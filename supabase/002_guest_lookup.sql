-- Supra migration 002: server-side guest lookup.
-- Safe to run more than once. Keeps every event, slug (guest link) and plan as they are.
--
-- Before: the guest page downloaded a copy of every seated guest (public_data) and searched it in the browser.
-- After:  the guest page gets only the room layout (no names). Seat searches run here, need 3+ letters,
--         return at most 5 matches with only name, drawing, table and seat, and are rate-limited per visitor.

create extension if not exists pgcrypto with schema extensions;

-- Per-event lookup policy (owner-controlled).
alter table public.events add column if not exists lookup_mode text not null default 'prefix';
alter table public.events add column if not exists lookup_pin_hash text;
alter table public.events add column if not exists show_tablemates boolean not null default false;
do $$ begin
  alter table public.events add constraint events_lookup_mode_chk check (lookup_mode in ('prefix','exact'));
exception when duplicate_object then null; end $$;

-- Log used only for rate limiting. Nobody can read it through the API.
create table if not exists public.seat_lookups (
  id     bigserial primary key,
  slug   text not null,
  client text not null,
  at     timestamptz not null default now()
);
create index if not exists seat_lookups_recent_idx on public.seat_lookups (slug, client, at);
create index if not exists seat_lookups_at_idx on public.seat_lookups (at);
alter table public.seat_lookups enable row level security;
revoke all on public.seat_lookups from anon, authenticated;

-- One normal form for Georgian and Latin names: Unicode NFC, lower case, single spaces, trimmed.
create or replace function public.supra_norm(t text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(lower(normalize(coalesce(t, ''), NFC)), '\s+', ' ', 'g'))
$$;

-- Public layout for the guest page: event title/date/style, table shapes and positions,
-- which seats are taken (true/false only), room items, and the lookup policy. No guest data.
create or replace function public.public_plan(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare e record; tbl jsonb; ven jsonb;
begin
  select data, lookup_mode, lookup_pin_hash is not null as pin into e
    from public.events where slug = p_slug and guest_page;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', t->'name', 'shape', t->'shape', 'deco', t->'deco',
           'x', t->'x', 'y', t->'y', 'rot', t->'rot',
           'seats', (select coalesce(jsonb_agg(jsonb_typeof(s) = 'string' order by si), '[]'::jsonb)
                       from jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) with ordinality as z(s, si)))
         order by ti), '[]'::jsonb)
    into tbl
    from jsonb_array_elements(coalesce(e.data->'tables', '[]'::jsonb)) with ordinality as x(t, ti);

  select coalesce(jsonb_agg(jsonb_build_object(
           'type', v->'type', 'label', v->'label', 'x', v->'x', 'y', v->'y', 'w', v->'w', 'h', v->'h', 'rot', v->'rot')), '[]'::jsonb)
    into ven
    from jsonb_array_elements(coalesce(e.data->'venue', '[]'::jsonb)) v;

  return jsonb_build_object(
    'event',  jsonb_build_object('name', e.data#>'{event,name}', 'date', e.data#>'{event,date}',
                                 'palette', e.data#>'{event,palette}', 'lang', e.data#>'{event,lang}', 'type', e.data#>'{event,type}'),
    'tables', tbl,
    'venue',  ven,
    'lookup', jsonb_build_object('mode', e.lookup_mode, 'pin', e.pin));
end $$;
revoke all on function public.public_plan(text) from public;
grant execute on function public.public_plan(text) to anon, authenticated;

-- Seat search for guests. Returns {status, matches[]}.
-- status: ok | short (fewer than 3 letters) | many (more than 5 matches) | pin (PIN missing/wrong)
--         | rate_limited | not_found (no such guest page)
-- Each match: name, look (drawing), kid, table (position), tableName, seat; mates only if the owner enabled it.
create or replace function public.find_seat(p_slug text, p_query text, p_pin text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  e record; q text; q_swapped text; q_like text; who text; recent int; total int; n int; res jsonb;
begin
  q := public.supra_norm(p_query);
  if char_length(replace(q, ' ', '')) < 3 then
    return jsonb_build_object('status', 'short', 'matches', '[]'::jsonb);
  end if;

  select data, lookup_mode, lookup_pin_hash, show_tablemates into e
    from public.events where slug = p_slug and guest_page;
  if not found then return jsonb_build_object('status', 'not_found', 'matches', '[]'::jsonb); end if;

  -- Rate limit: 30 searches per visitor per 10 minutes, 1500 per guest page per hour.
  who := btrim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  if who = '' then who := 'unknown'; end if;
  delete from public.seat_lookups where at < now() - interval '1 day';
  select count(*) into recent from public.seat_lookups where slug = p_slug and client = who and at > now() - interval '10 minutes';
  select count(*) into total  from public.seat_lookups where slug = p_slug and at > now() - interval '1 hour';
  if recent >= 30 or total >= 1500 then
    return jsonb_build_object('status', 'rate_limited', 'matches', '[]'::jsonb);
  end if;
  insert into public.seat_lookups (slug, client) values (p_slug, who);

  if e.lookup_pin_hash is not null and (p_pin is null or crypt(btrim(p_pin), e.lookup_pin_hash) <> e.lookup_pin_hash) then
    return jsonb_build_object('status', 'pin', 'matches', '[]'::jsonb);
  end if;

  q_swapped := regexp_replace(q, '^(\S+) (.+)$', '\2 \1');
  q_like := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');

  create temporary table if not exists _supra_seated (tidx int, tname text, sidx int, gu jsonb, nn text) on commit drop;
  truncate _supra_seated;
  insert into _supra_seated
    select (ti - 1)::int, t->>'name', (si - 1)::int, e.data->'guests'->(s #>> '{}'), public.supra_norm(e.data->'guests'->(s #>> '{}')->>'name')
      from jsonb_array_elements(coalesce(e.data->'tables', '[]'::jsonb)) with ordinality as x(t, ti),
           jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) with ordinality as z(s, si)
     where jsonb_typeof(s) = 'string' and e.data->'guests'->(s #>> '{}') is not null;

  select count(*) into n from _supra_seated
   where case when e.lookup_mode = 'exact' then nn = q or nn = q_swapped
              else nn like q_like || '%' or nn like '% ' || q_like || '%' end;
  if n > 5 then return jsonb_build_object('status', 'many', 'matches', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', m.gu->>'name', 'look', m.gu->'look', 'kid', coalesce((m.gu->>'kid')::boolean, false),
           'table', m.tidx, 'tableName', m.tname, 'seat', m.sidx + 1,
           'mates', case when e.show_tablemates then
                      (select coalesce(jsonb_agg(o.gu->>'name' order by o.sidx), '[]'::jsonb)
                         from _supra_seated o where o.tidx = m.tidx and o.sidx <> m.sidx)
                    else null end)
         order by m.nn, m.tidx), '[]'::jsonb)
    into res
    from _supra_seated m
   where case when e.lookup_mode = 'exact' then m.nn = q or m.nn = q_swapped
              else m.nn like q_like || '%' or m.nn like '% ' || q_like || '%' end;

  return jsonb_build_object('status', 'ok', 'matches', res);
end $$;
revoke all on function public.find_seat(text, text, text) from public;
grant execute on function public.find_seat(text, text, text) to anon, authenticated;

-- Owner sets the lookup policy. p_pin: null = keep, '' = remove, otherwise set (4-12 characters).
create or replace function public.set_guest_lookup(p_event uuid, p_mode text, p_pin text, p_mates boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare r record;
begin
  if p_mode not in ('prefix', 'exact') then raise exception 'bad mode'; end if;
  if p_pin is not null and p_pin <> '' and char_length(btrim(p_pin)) not between 4 and 12 then raise exception 'bad pin'; end if;
  update public.events
     set lookup_mode = p_mode,
         show_tablemates = coalesce(p_mates, show_tablemates),
         lookup_pin_hash = case when p_pin is null then lookup_pin_hash
                                when p_pin = '' then null
                                else crypt(btrim(p_pin), gen_salt('bf')) end
   where id = p_event and owner = auth.uid()
   returning lookup_mode, lookup_pin_hash is not null as pin, show_tablemates into r;
  if not found then raise exception 'not found'; end if;
  return jsonb_build_object('mode', r.lookup_mode, 'pin', r.pin, 'mates', r.show_tablemates);
end $$;
revoke all on function public.set_guest_lookup(uuid, text, text, boolean) from public;
grant execute on function public.set_guest_lookup(uuid, text, text, boolean) to authenticated;

-- The old full copy of guest names for the guest page is no longer used anywhere. Clear it.
update public.events set public_data = '{}'::jsonb where public_data <> '{}'::jsonb;
