-- Supra migration 006: guest-link lifecycle, privacy presets, organiser preview, backoff and safe telemetry.
-- Safe to run more than once. Keeps every event, plan and existing guest link working.
--
-- What changes
--   * events gain share_status (draft | published | revoked), share_expires_at, share_published_at, show_layout.
--     Existing events keep today's behaviour: published if their guest page was on, layout shown.
--   * New events: the server picks a 128-bit link token, starts as a draft, Balanced privacy
--     (full-name search, no tablemates, no layout). The client can no longer choose the token.
--   * The token, the invitation-code hash and the publish state change only through the owner functions below.
--   * Public lookups answer only for published, unexpired links, with generic wording, exponential backoff
--     for repeated misses, a near-constant response time, and counts-only telemetry. IPs are stored hashed.
--
-- Rollback
--   Re-run 004_seat_choice.sql then 005_table_people.sql (restores the previous public functions), then:
--     drop trigger if exists events_share_defaults on public.events;
--     drop trigger if exists events_share_guard on public.events;
--     drop trigger if exists events_share_history on public.events;
--   The added columns and tables can stay; older code ignores them.

create extension if not exists pgcrypto with schema extensions;

-- 1. Columns, backfilled once so live links keep working -----------------------------------------
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'events' and column_name = 'share_status') then
    alter table public.events
      add column share_status text not null default 'draft' check (share_status in ('draft', 'published', 'revoked')),
      add column share_expires_at timestamptz,
      add column share_published_at timestamptz,
      add column show_layout boolean not null default false;
    update public.events
       set share_status = case when guest_page then 'published' else 'draft' end,
           share_published_at = case when guest_page then now() end,
           show_layout = true;
  end if;
end $$;

-- 2. Tokens -------------------------------------------------------------------------------------
-- 16 random bytes → 22 url-safe characters (128 bits).
create or replace function public.supra_new_token() returns text
language sql volatile set search_path = public, extensions as $$
  select translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_')
$$;
create or replace function public.supra_sha(t text) returns text
language sql immutable set search_path = public, extensions as $$ select encode(digest(coalesce(t, ''), 'sha256'), 'hex') $$;

-- History of link tokens (hashes only) for audit.
create table if not exists public.share_links (
  id          bigserial primary key,
  event_id    uuid not null references public.events(id) on delete cascade,
  token_sha   text not null,
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,
  reason      text
);
create index if not exists share_links_event_idx on public.share_links (event_id);
alter table public.share_links enable row level security;
revoke all on public.share_links from anon, authenticated;
grant select on public.share_links to authenticated;
drop policy if exists "owner reads link history" on public.share_links;
create policy "owner reads link history" on public.share_links for select
  using (exists (select 1 from public.events e where e.id = event_id and e.owner = auth.uid()));
insert into public.share_links (event_id, token_sha, reason)
  select e.id, public.supra_sha(e.slug), 'existing link'
    from public.events e
   where not exists (select 1 from public.share_links s where s.event_id = e.id);

-- Counts-only lookup telemetry: no IPs, names or queries.
create table if not exists public.lookup_stats (
  event_id  uuid not null references public.events(id) on delete cascade,
  hour      timestamptz not null,
  outcome   text not null,
  n         int not null default 0,
  primary key (event_id, hour, outcome)
);
alter table public.lookup_stats enable row level security;
revoke all on public.lookup_stats from anon, authenticated;
grant select on public.lookup_stats to authenticated;
drop policy if exists "owner reads lookup stats" on public.lookup_stats;
create policy "owner reads lookup stats" on public.lookup_stats for select
  using (exists (select 1 from public.events e where e.id = event_id and e.owner = auth.uid()));

-- Rate-limit log: client is now sha-256(ip ‖ token); misses drive the backoff.
alter table public.seat_lookups add column if not exists miss boolean not null default false;
update public.seat_lookups set client = public.supra_sha(client || ':' || slug) where char_length(client) <> 64;

-- 3. Triggers ----------------------------------------------------------------------------------
-- New events: server token, draft, Balanced preset — whatever the client sent.
create or replace function public.supra_share_defaults() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  new.slug := public.supra_new_token();
  new.share_status := 'draft';
  new.share_published_at := null;
  new.share_expires_at := null;
  new.guest_page := false;
  new.lookup_mode := 'exact';
  new.show_tablemates := false;
  new.show_layout := false;
  new.lookup_pin_hash := null;
  return new;
end $$;
drop trigger if exists events_share_defaults on public.events;
create trigger events_share_defaults before insert on public.events
  for each row execute function public.supra_share_defaults();

create or replace function public.supra_share_history() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.share_links (event_id, token_sha, reason) values (new.id, public.supra_sha(new.slug), 'created');
  return new;
end $$;
drop trigger if exists events_share_history on public.events;
create trigger events_share_history after insert on public.events
  for each row execute function public.supra_share_history();

-- Token, code hash and publish state change only inside the owner functions (which set supra.owner_fn).
create or replace function public.supra_share_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('supra.owner_fn', true), '') <> 'on' then
    if new.slug is distinct from old.slug then raise exception 'the guest link changes only with rotate_guest_link' using errcode = '42501'; end if;
    if new.lookup_pin_hash is distinct from old.lookup_pin_hash then raise exception 'the invitation code changes only with set_guest_lookup' using errcode = '42501'; end if;
    new.share_status := old.share_status;
    new.share_expires_at := old.share_expires_at;
    new.share_published_at := old.share_published_at;
  end if;
  new.guest_page := new.share_status = 'published';
  return new;
end $$;
drop trigger if exists events_share_guard on public.events;
create trigger events_share_guard before update on public.events
  for each row execute function public.supra_share_guard();

-- 4. Shared building blocks (not callable by visitors) ----------------------------------------
create or replace function public.supra_share_live(st text, exp timestamptz) returns boolean
language sql stable as $$ select st = 'published' and (exp is null or exp > now()) $$;

-- Only drawing settings, rebuilt key by key.
create or replace function public.supra_look(g jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object('look', jsonb_strip_nulls(jsonb_build_object(
           'kind', g->'look'->'kind', 'skin', g->'look'->'skin', 'hair', g->'look'->'hair',
           'hairColor', g->'look'->'hairColor', 'beard', g->'look'->'beard', 'beardColor', g->'look'->'beardColor',
           'eye', g->'look'->'eye', 'outfit', g->'look'->'outfit', 'outfitColor', g->'look'->'outfitColor',
           'glasses', g->'look'->'glasses')),
         'kid', coalesce((g->>'kid')::boolean, false))
$$;

-- What the guest page may show for one event (the same for visitors and the organiser's preview).
create or replace function public.supra_plan_payload(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare e record; tbl jsonb; ven jsonb; tbl_only boolean;
begin
  select data, lookup_mode, lookup_pin_hash is not null as pin, show_layout into e from public.events where id = p_event;
  if not found then return null; end if;
  tbl_only := coalesce(e.data#>>'{event,seatMode}', 'seat') = 'table';
  if e.show_layout then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', t->'name', 'shape', t->'shape', 'deco', t->'deco', 'x', t->'x', 'y', t->'y', 'rot', t->'rot',
             'seats', (select coalesce(jsonb_agg(case when g is null then 'false'::jsonb when tbl_only then 'true'::jsonb
                                                     else public.supra_look(g) end order by si), '[]'::jsonb)
                         from jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) with ordinality as z(s, si)
                         left join lateral (select case when jsonb_typeof(s) = 'string' then e.data->'guests'->(s #>> '{}') end as g) gg on true),
             'people', case when tbl_only then (select coalesce(jsonb_agg(public.supra_look(g) order by g->>'name'), '[]'::jsonb)
                         from jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) z(s)
                         join lateral (select e.data->'guests'->(s #>> '{}') as g) gg on true
                        where jsonb_typeof(s) = 'string' and g is not null) end)
           order by ti), '[]'::jsonb)
      into tbl
      from jsonb_array_elements(coalesce(e.data->'tables', '[]'::jsonb)) with ordinality as x(t, ti);
    select coalesce(jsonb_agg(jsonb_build_object('type', v->'type', 'label', v->'label', 'x', v->'x', 'y', v->'y',
                                                 'w', v->'w', 'h', v->'h', 'rot', v->'rot')), '[]'::jsonb)
      into ven from jsonb_array_elements(coalesce(e.data->'venue', '[]'::jsonb)) v;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'event',  jsonb_build_object('name', e.data#>'{event,name}', 'date', e.data#>'{event,date}',
                                 'palette', e.data#>'{event,palette}', 'lang', e.data#>'{event,lang}', 'type', e.data#>'{event,type}'),
    'tables', tbl,
    'venue',  ven,
    'lookup', jsonb_build_object('mode', e.lookup_mode, 'pin', e.pin, 'layout', e.show_layout,
                                 'seatMode', case when tbl_only then 'table' else 'seat' end)));
end $$;

-- Name search for one event. status: short | none | many | ok.
create or replace function public.supra_search(p_event uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare e record; q text; qs text; ql text; n int; res jsonb; tbl_only boolean;
begin
  q := public.supra_norm(p_query);
  if char_length(replace(q, ' ', '')) < 3 then return jsonb_build_object('status', 'short', 'matches', '[]'::jsonb); end if;
  select data, lookup_mode, show_tablemates into e from public.events where id = p_event;
  if not found then return jsonb_build_object('status', 'none', 'matches', '[]'::jsonb); end if;
  tbl_only := coalesce(e.data#>>'{event,seatMode}', 'seat') = 'table';
  qs := regexp_replace(q, '^(\S+) (.+)$', '\2 \1');
  ql := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  with seated as (
    select (ti - 1)::int as tidx, t->>'name' as tname, (si - 1)::int as sidx, e.data->'guests'->(s #>> '{}') as gu,
           public.supra_norm(e.data->'guests'->(s #>> '{}')->>'name') as nn
      from jsonb_array_elements(coalesce(e.data->'tables', '[]'::jsonb)) with ordinality as x(t, ti),
           jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) with ordinality as z(s, si)
     where jsonb_typeof(s) = 'string' and e.data->'guests'->(s #>> '{}') is not null),
  hit as (
    select * from seated
     where case when e.lookup_mode = 'exact' then nn = q or nn = qs
                else nn like ql || '%' or nn like '% ' || ql || '%' end)
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'name', h.gu->>'name', 'look', public.supra_look(h.gu)->'look', 'kid', coalesce((h.gu->>'kid')::boolean, false),
           'table', h.tidx, 'tableName', h.tname, 'seat', case when tbl_only then null else h.sidx + 1 end,
           'mates', case when e.show_tablemates then
                      (select coalesce(jsonb_agg(o.gu->>'name' order by case when tbl_only then o.gu->>'name' end, o.sidx), '[]'::jsonb)
                         from seated o where o.tidx = h.tidx and o.sidx <> h.sidx) end)
         order by h.nn, h.tidx), '[]'::jsonb)
    into n, res from hit h;
  if n = 0 then return jsonb_build_object('status', 'none', 'matches', '[]'::jsonb); end if;
  if n > 5 then return jsonb_build_object('status', 'many', 'matches', '[]'::jsonb); end if;
  return jsonb_build_object('status', 'ok', 'matches', res);
end $$;

create or replace function public.supra_count(p_event uuid, p_outcome text) returns void
language sql volatile security definer set search_path = public as $$
  insert into public.lookup_stats (event_id, hour, outcome, n) values (p_event, date_trunc('hour', now()), p_outcome, 1)
  on conflict (event_id, hour, outcome) do update set n = public.lookup_stats.n + 1
$$;

revoke all on function public.supra_plan_payload(uuid) from public, anon, authenticated;
revoke all on function public.supra_search(uuid, text) from public, anon, authenticated;
revoke all on function public.supra_count(uuid, text) from public, anon, authenticated;
revoke all on function public.supra_look(jsonb) from public, anon, authenticated;

-- 5. Public functions --------------------------------------------------------------------------
create or replace function public.public_plan(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare eid uuid;
begin
  select id into eid from public.events
   where slug = p_slug and public.supra_share_live(share_status, share_expires_at);
  if eid is null then return null; end if;
  return public.supra_plan_payload(eid);
end $$;
revoke all on function public.public_plan(text) from public;
grant execute on function public.public_plan(text) to anon, authenticated;

-- status: short | none | many | ok | pin | rate_limited (with retry_after seconds) | unavailable
-- Limits: 60 searches per visitor per 10 minutes, 1500 per link per hour, backoff after repeated misses.
create or replace function public.find_seat(p_slug text, p_query text, p_pin text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  t0 timestamptz := clock_timestamp(); e record; who text; recent int; total int; misses int; last_at timestamptz;
  wait_s numeric; res jsonb; lid bigint;
begin
  if char_length(replace(public.supra_norm(p_query), ' ', '')) < 3 then
    return jsonb_build_object('status', 'short', 'matches', '[]'::jsonb);
  end if;

  select id, lookup_pin_hash, share_status, share_expires_at into e from public.events where slug = p_slug;
  if not found or not public.supra_share_live(e.share_status, e.share_expires_at) then
    res := jsonb_build_object('status', 'unavailable', 'matches', '[]'::jsonb);
  else
    who := public.supra_sha(coalesce(nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), ''), 'unknown') || ':' || p_slug);
    delete from public.seat_lookups where at < now() - interval '1 day';
    select count(*), count(*) filter (where miss and at > now() - interval '30 minutes'), max(at) filter (where miss)
      into recent, misses, last_at
      from public.seat_lookups where slug = p_slug and client = who and at > now() - interval '30 minutes';
    select count(*) into total from public.seat_lookups where slug = p_slug and at > now() - interval '1 hour';
    select count(*) into recent from public.seat_lookups where slug = p_slug and client = who and at > now() - interval '10 minutes';
    -- after 8 misses in 30 minutes, wait 10 s, then 20 s, 40 s … at most 5 minutes. Kept gentle because
    -- many guests at a venue can share one Wi-Fi address; the per-link cap below stops bulk scraping.
    wait_s := case when misses >= 8 then least(300, 10 * power(2, misses - 8)) else 0 end;
    if recent >= 60 or total >= 1500 or (wait_s > 0 and now() < last_at + make_interval(secs => wait_s)) then
      perform public.supra_count(e.id, 'rate_limited');
      res := jsonb_build_object('status', 'rate_limited', 'matches', '[]'::jsonb,
               'retry_after', greatest(1, ceil(case when wait_s > 0 then extract(epoch from (last_at + make_interval(secs => wait_s) - now())) else 600 end))::int);
    else
      insert into public.seat_lookups (slug, client) values (p_slug, who) returning id into lid;
      if e.lookup_pin_hash is not null and (p_pin is null or crypt(btrim(p_pin), e.lookup_pin_hash) <> e.lookup_pin_hash) then
        update public.seat_lookups set miss = true where id = lid;
        perform public.supra_count(e.id, 'pin');
        res := jsonb_build_object('status', 'pin', 'matches', '[]'::jsonb);
      else
        res := public.supra_search(e.id, p_query);
        if res->>'status' <> 'ok' then update public.seat_lookups set miss = true where id = lid; end if;
        perform public.supra_count(e.id, res->>'status');
      end if;
    end if;
  end if;
  -- near-constant response time, so timing doesn't tell found from not found
  perform pg_sleep(greatest(0, 0.25 + random() * 0.05 - extract(epoch from clock_timestamp() - t0)));
  return res;
end $$;
revoke all on function public.find_seat(text, text, text) from public;
grant execute on function public.find_seat(text, text, text) to anon, authenticated;

-- 6. Owner functions ---------------------------------------------------------------------------
create or replace function public.supra_own(p_event uuid) returns public.events
language plpgsql security definer set search_path = public as $$
declare r public.events;
begin
  select * into r from public.events where id = p_event and owner = auth.uid() for update;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  perform set_config('supra.owner_fn', 'on', true);
  return r;
end $$;
revoke all on function public.supra_own(uuid) from public, anon, authenticated;

create or replace function public.supra_share_state(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', case when share_status = 'published' and share_expires_at is not null and share_expires_at <= now()
                                           then 'expired' else share_status end,
                            'slug', slug, 'expires', share_expires_at, 'published', share_published_at,
                            'mode', lookup_mode, 'pin', lookup_pin_hash is not null, 'mates', show_tablemates, 'layout', show_layout)
    from public.events where id = p_event and owner = auth.uid()
$$;
revoke all on function public.supra_share_state(uuid) from public, anon;
grant execute on function public.supra_share_state(uuid) to authenticated;

create or replace function public.publish_guest_page(p_event uuid, p_expires timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r public.events := public.supra_own(p_event);
begin
  if r.share_status = 'revoked' then raise exception 'revoked: make a new link first' using errcode = '22023'; end if;
  if p_expires is not null and p_expires <= now() then raise exception 'expiry must be in the future' using errcode = '22023'; end if;
  update public.events set share_status = 'published', share_published_at = now(), share_expires_at = p_expires where id = p_event;
  return public.supra_share_state(p_event);
end $$;

create or replace function public.unpublish_guest_page(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r public.events := public.supra_own(p_event);
begin
  update public.events set share_status = case when r.share_status = 'revoked' then 'revoked' else 'draft' end where id = p_event;
  return public.supra_share_state(p_event);
end $$;

create or replace function public.revoke_guest_link(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r public.events := public.supra_own(p_event);
begin
  update public.events set share_status = 'revoked', share_expires_at = null where id = p_event;
  update public.share_links set retired_at = now(), reason = 'revoked' where event_id = p_event and retired_at is null;
  return public.supra_share_state(p_event);
end $$;

create or replace function public.rotate_guest_link(p_event uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare r public.events := public.supra_own(p_event); tok text := public.supra_new_token();
begin
  update public.share_links set retired_at = now(), reason = coalesce(reason, 'rotated') where event_id = p_event and retired_at is null;
  update public.events set slug = tok, share_status = case when r.share_status = 'revoked' then 'draft' else r.share_status end where id = p_event;
  insert into public.share_links (event_id, token_sha, reason) values (p_event, public.supra_sha(tok), 'rotated');
  delete from public.seat_lookups where slug = r.slug;
  return public.supra_share_state(p_event);
end $$;

-- Fine-grained privacy (search mode, tablemates, layout). Code: set_guest_lookup.
create or replace function public.set_guest_privacy(p_event uuid, p_mode text, p_mates boolean, p_layout boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r public.events := public.supra_own(p_event);
begin
  if p_mode not in ('prefix', 'exact') then raise exception 'bad mode' using errcode = '22023'; end if;
  update public.events set lookup_mode = p_mode, show_tablemates = coalesce(p_mates, show_tablemates),
         show_layout = coalesce(p_layout, show_layout) where id = p_event;
  return public.supra_share_state(p_event);
end $$;

-- Presets. strict: code required, full name, nothing else. balanced: full name, nothing else (code recommended).
-- open: start of name, tablemates and layout (the app asks for explicit confirmation first).
create or replace function public.apply_privacy_preset(p_event uuid, p_preset text, p_pin text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare r public.events := public.supra_own(p_event);
begin
  if p_preset = 'strict' then
    if r.lookup_pin_hash is null and (p_pin is null or char_length(btrim(p_pin)) not between 4 and 12) then
      raise exception 'strict needs an invitation code (4-12 characters)' using errcode = '22023';
    end if;
    update public.events set lookup_mode = 'exact', show_tablemates = false, show_layout = false,
           lookup_pin_hash = case when p_pin is not null then crypt(btrim(p_pin), gen_salt('bf')) else lookup_pin_hash end
     where id = p_event;
  elsif p_preset = 'balanced' then
    update public.events set lookup_mode = 'exact', show_tablemates = false, show_layout = false where id = p_event;
  elsif p_preset = 'open' then
    update public.events set lookup_mode = 'prefix', show_tablemates = true, show_layout = true where id = p_event;
  else
    raise exception 'unknown preset' using errcode = '22023';
  end if;
  return public.supra_share_state(p_event);
end $$;

-- Replaces the 002 version: same contract, now goes through the owner guard.
create or replace function public.set_guest_lookup(p_event uuid, p_mode text, p_pin text, p_mates boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare r public.events := public.supra_own(p_event);
begin
  if p_mode not in ('prefix', 'exact') then raise exception 'bad mode'; end if;
  if p_pin is not null and p_pin <> '' and char_length(btrim(p_pin)) not between 4 and 12 then raise exception 'bad pin'; end if;
  update public.events
     set lookup_mode = p_mode,
         show_tablemates = coalesce(p_mates, show_tablemates),
         lookup_pin_hash = case when p_pin is null then lookup_pin_hash when p_pin = '' then null
                                else crypt(btrim(p_pin), gen_salt('bf')) end
   where id = p_event;
  return jsonb_build_object('mode', p_mode, 'pin', (select lookup_pin_hash is not null from public.events where id = p_event),
                            'mates', (select show_tablemates from public.events where id = p_event));
end $$;

-- Organiser preview: exactly the public payload and search, whatever the publish state; no code, no rate limit.
create or replace function public.preview_public_plan(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.events where id = p_event and owner = auth.uid()) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return public.supra_plan_payload(p_event);
end $$;
create or replace function public.preview_find_seat(p_event uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.events where id = p_event and owner = auth.uid()) then
    raise exception 'not found' using errcode = '42501';
  end if;
  return public.supra_search(p_event, p_query);
end $$;

do $$ declare f text; begin
  foreach f in array array['publish_guest_page(uuid, timestamptz)', 'unpublish_guest_page(uuid)', 'revoke_guest_link(uuid)',
                           'rotate_guest_link(uuid)', 'set_guest_privacy(uuid, text, boolean, boolean)',
                           'apply_privacy_preset(uuid, text, text)', 'set_guest_lookup(uuid, text, text, boolean)',
                           'preview_public_plan(uuid)', 'preview_find_seat(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
