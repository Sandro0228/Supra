-- Supra migration 008: RSVP. Each invited household gets a personal link (/r/<token>). The household says
-- who is coming, meals, allergies and a message, and can change its answer until the deadline.
-- Run after 007_name_skeleton.sql. Safe to run more than once. Design: docs/RSVP_DESIGN.md.
--
-- What changes
--   * events gain starts_at, venue_name, venue_map_url, rsvp_open, rsvp_deadline, rsvp_no_deadline.
--     Deadline = rsvp_deadline, else 24 h before starts_at; none when rsvp_no_deadline (or no start time yet).
--   * invites: one row per household. Only the event owner can read or change it (RLS). The server makes
--     the 128-bit link token; it changes only through rotate_invite_link.
--   * invite_log: every change of an answer (by the guest or by the couple), for "Recent changes".
--   * Guests (anon) call only rsvp_get(token) and rsvp_answer(token, answer). They see their own household:
--     names and drawings of its members, never other guests, phone numbers, emails or private plan fields.
--   * Answers never touch events.data (the plan), so a guest answering cannot overwrite the couple's edits.
--
-- Rollback
--   drop table if exists public.invite_log, public.invites;
--   drop function if exists public.rsvp_get(text), public.rsvp_answer(text, jsonb), public.rotate_invite_link(uuid),
--     public.clear_rsvp_contacts(uuid), public.supra_purge_rsvp_contacts(), public.supra_rsvp_deadline(uuid),
--     public.supra_rsvp_clean(text[], int, jsonb, boolean), public.supra_invite_guard(), public.supra_invite_log();
--   The new events columns can stay; older code ignores them.

-- 1. Event details for invitations ------------------------------------------------------------------
alter table public.events
  add column if not exists starts_at        timestamptz,
  add column if not exists venue_name       text,
  add column if not exists venue_map_url    text,
  add column if not exists rsvp_open        boolean not null default true,
  add column if not exists rsvp_deadline    timestamptz,
  add column if not exists rsvp_no_deadline boolean not null default false;
do $$ begin
  alter table public.events add constraint events_venue_name_len check (char_length(venue_name) <= 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.events add constraint events_venue_map_url_ok
    check (venue_map_url is null or (venue_map_url ~ '^https://' and char_length(venue_map_url) <= 500));
exception when duplicate_object then null; end $$;

-- When answers close: null means open until the couple closes RSVP by hand.
create or replace function public.supra_rsvp_deadline(p_event uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when rsvp_no_deadline then null else coalesce(rsvp_deadline, starts_at - interval '24 hours') end
    from public.events where id = p_event
$$;
revoke all on function public.supra_rsvp_deadline(uuid) from public, anon;
grant execute on function public.supra_rsvp_deadline(uuid) to authenticated;

-- 2. Tables ---------------------------------------------------------------------------------------
create table if not exists public.invites (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  token         text not null unique,
  name          text not null default '' check (char_length(name) <= 120),
  members       text[] not null default '{}' check (cardinality(members) <= 30),
  extra_allowed smallint not null default 0 check (extra_allowed between 0 and 5),
  phone         text check (char_length(phone) <= 32),
  email         text check (char_length(email) <= 254),
  lang          text not null default 'ka' check (lang in ('ka', 'en')),
  sent          jsonb not null default '[]'::jsonb check (jsonb_typeof(sent) = 'array'),
  answer        jsonb,
  coming_count  smallint not null default 0,
  state         text not null default 'pending' check (state in ('pending', 'coming', 'declined')),
  revoked       boolean not null default false,
  answered_at   timestamptz,
  applied_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists invites_event_idx on public.invites (event_id);

create table if not exists public.invite_log (
  id            bigserial primary key,
  invite_id     uuid not null references public.invites(id) on delete cascade,
  event_id      uuid not null references public.events(id) on delete cascade,
  at            timestamptz not null default now(),
  by            text not null check (by in ('guest', 'couple')),
  state_before  text,
  state_after   text not null,
  coming_before smallint,
  coming_after  smallint not null
);
create index if not exists invite_log_invite_idx on public.invite_log (invite_id, at);
create index if not exists invite_log_event_idx on public.invite_log (event_id, at desc);

-- 3. Access: the event owner only. Guests never touch these tables directly. ----------------------
alter table public.invites enable row level security;
alter table public.invite_log enable row level security;
revoke all on public.invites, public.invite_log from anon, authenticated;
grant select, insert, update, delete on public.invites to authenticated;
grant select on public.invite_log to authenticated;
revoke all on sequence public.invite_log_id_seq from anon, authenticated;

drop policy if exists "owner manages invites" on public.invites;
create policy "owner manages invites" on public.invites for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner = (select auth.uid())))
  with check (exists (select 1 from public.events e where e.id = event_id and e.owner = (select auth.uid())));
drop policy if exists "owner reads invite log" on public.invite_log;
create policy "owner reads invite log" on public.invite_log for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.owner = (select auth.uid())));

-- 4. Answers: one clean shape, whoever writes them ------------------------------------------------
-- {members:{<guest id>:{coming, meal}}, extras:[{name, meal}], allergies, message}
-- strict (guest answers): every member must say yes or no. Lenient (couple edits the household):
-- answers for removed members and extras over the new limit are dropped; new members stay unanswered.
create or replace function public.supra_rsvp_clean(p_members text[], p_extra int, a jsonb, p_strict boolean)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  meals constant text[] := array['', 'meat', 'fish', 'veg', 'vegan', 'kids'];
  m jsonb := '{}'::jsonb; ex jsonb := '[]'::jsonb; gid text; v jsonb; x jsonb; meal text; nm text; al text; msg text; n int := 0;
begin
  if a is null then return null; end if;
  if jsonb_typeof(a) <> 'object' then raise exception 'answer must be an object' using errcode = '22023'; end if;
  if a ? 'members' and jsonb_typeof(a->'members') <> 'object' then raise exception 'members must be an object' using errcode = '22023'; end if;
  foreach gid in array p_members loop
    v := a->'members'->gid;
    if v is null or jsonb_typeof(v->'coming') is distinct from 'boolean' then
      if p_strict then raise exception 'every member needs coming yes or no' using errcode = '22023'; end if;
      continue;
    end if;
    meal := coalesce(v->>'meal', '');
    if not meal = any(meals) then raise exception 'unknown meal' using errcode = '22023'; end if;
    m := m || jsonb_build_object(gid, jsonb_build_object('coming', (v->>'coming')::boolean,
                                                          'meal', case when (v->>'coming')::boolean then meal else '' end));
  end loop;
  if a ? 'extras' and jsonb_typeof(a->'extras') <> 'null' then
    if jsonb_typeof(a->'extras') <> 'array' then raise exception 'extras must be a list' using errcode = '22023'; end if;
    if p_strict and jsonb_array_length(a->'extras') > p_extra then
      raise exception 'too many extra guests' using errcode = '22023';
    end if;
    for x in select value from jsonb_array_elements(a->'extras') loop
      exit when n >= p_extra;
      nm := btrim(regexp_replace(coalesce(x->>'name', ''), '\s+', ' ', 'g'));
      if nm = '' or char_length(nm) > 80 then raise exception 'extra guest needs a name (up to 80 letters)' using errcode = '22023'; end if;
      meal := coalesce(x->>'meal', '');
      if not meal = any(meals) then raise exception 'unknown meal' using errcode = '22023'; end if;
      ex := ex || jsonb_build_array(jsonb_build_object('name', nm, 'meal', meal));
      n := n + 1;
    end loop;
  end if;
  al := btrim(coalesce(a->>'allergies', ''));
  msg := btrim(coalesce(a->>'message', ''));
  if char_length(al) > 500 then raise exception 'allergies too long' using errcode = '22023'; end if;
  if char_length(msg) > 1000 then raise exception 'message too long' using errcode = '22023'; end if;
  return jsonb_build_object('members', m, 'extras', ex, 'allergies', al, 'message', msg);
end $$;
-- Pure function; the invites trigger runs it as the signed-in owner.
revoke all on function public.supra_rsvp_clean(text[], int, jsonb, boolean) from public, anon;
grant execute on function public.supra_rsvp_clean(text[], int, jsonb, boolean) to authenticated;

-- Server-made token, cleaned answer, derived counts. The token changes only inside rotate_invite_link.
create or replace function public.supra_invite_guard() returns trigger
language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    new.token := public.supra_new_token();
    new.created_at := now();
    new.answered_at := null;
  else
    if new.token is distinct from old.token and coalesce(current_setting('supra.owner_fn', true), '') <> 'on' then
      raise exception 'the invitation link changes only with rotate_invite_link' using errcode = '42501';
    end if;
    if new.event_id is distinct from old.event_id then
      raise exception 'an invitation cannot move to another event' using errcode = '42501';
    end if;
  end if;
  new.members := coalesce((select array_agg(distinct m) from unnest(new.members) m where m is not null and m <> ''), '{}');
  new.answer := public.supra_rsvp_clean(new.members, new.extra_allowed, new.answer,
                                        coalesce(current_setting('supra.rsvp_by', true), '') = 'guest');
  new.coming_count := coalesce((select count(*) from jsonb_each(new.answer->'members') j where (j.value->>'coming')::boolean), 0)
                      + coalesce(jsonb_array_length(new.answer->'extras'), 0);
  new.state := case when new.answer is null then 'pending' when new.coming_count > 0 then 'coming' else 'declined' end;
  if new.answer is not null and (tg_op = 'INSERT' or new.answer is distinct from old.answer) then
    new.answered_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists invites_guard on public.invites;
create trigger invites_guard before insert or update on public.invites
  for each row execute function public.supra_invite_guard();

create or replace function public.supra_invite_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.answer is not null and (tg_op = 'INSERT' or new.answer is distinct from old.answer
                                 or new.coming_count is distinct from old.coming_count) then
    insert into public.invite_log (invite_id, event_id, by, state_before, state_after, coming_before, coming_after)
    values (new.id, new.event_id,
            case when coalesce(current_setting('supra.rsvp_by', true), '') = 'guest' then 'guest' else 'couple' end,
            case when tg_op = 'UPDATE' then old.state end, new.state,
            case when tg_op = 'UPDATE' then old.coming_count end, new.coming_count);
  end if;
  return null;
end $$;
revoke all on function public.supra_invite_log() from public, anon, authenticated;
drop trigger if exists invites_log on public.invites;
create trigger invites_log after insert or update on public.invites
  for each row execute function public.supra_invite_log();

-- 5. Guest functions (anon) ------------------------------------------------------------------------
-- status: unavailable | ok. closed = answers can no longer change.
create or replace function public.rsvp_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i public.invites; e public.events; dl timestamptz; mem jsonb;
begin
  select * into i from public.invites where token = p_token and not revoked;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  select * into e from public.events where id = i.event_id;
  dl := public.supra_rsvp_deadline(e.id);
  select coalesce(jsonb_agg(jsonb_build_object('id', m.gid, 'name', g->>'name') || public.supra_look(g) order by m.ord), '[]'::jsonb)
    into mem
    from unnest(i.members) with ordinality as m(gid, ord)
    cross join lateral (select e.data->'guests'->m.gid as g) gg
   where g is not null;
  return jsonb_strip_nulls(jsonb_build_object(
    'status', 'ok',
    'event', jsonb_build_object('name', e.data#>'{event,name}', 'date', e.data#>'{event,date}', 'type', e.data#>'{event,type}',
                                'palette', e.data#>'{event,palette}', 'lang', e.data#>'{event,lang}',
                                'startsAt', e.starts_at, 'venue', e.venue_name, 'mapUrl', e.venue_map_url),
    'invite', jsonb_build_object('name', i.name, 'lang', i.lang, 'extraAllowed', i.extra_allowed, 'members', mem,
                                 'answer', i.answer, 'answeredAt', i.answered_at),
    'deadline', dl,
    'closed', not e.rsvp_open or (dl is not null and now() >= dl)));
end $$;
revoke all on function public.rsvp_get(text) from public;
grant execute on function public.rsvp_get(text) to anon, authenticated;

-- status: unavailable | closed | rate_limited | ok (with the same payload as rsvp_get).
-- Invalid answers raise 22023; the page validates before sending, so that only happens to hand-made requests.
create or replace function public.rsvp_answer(p_token text, p_answer jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare i public.invites; e public.events; dl timestamptz;
begin
  select * into i from public.invites where token = p_token and not revoked for update;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  select * into e from public.events where id = i.event_id;
  dl := public.supra_rsvp_deadline(e.id);
  if not e.rsvp_open or (dl is not null and now() >= dl) then
    return public.rsvp_get(p_token) || jsonb_build_object('status', 'closed');
  end if;
  if (select count(*) from public.invite_log where invite_id = i.id and by = 'guest' and at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('status', 'rate_limited', 'retry_after', 3600);
  end if;
  if pg_column_size(p_answer) > 16384 then raise exception 'answer too large' using errcode = '22023'; end if;
  perform set_config('supra.rsvp_by', 'guest', true);
  update public.invites set answer = p_answer where id = i.id;
  perform set_config('supra.rsvp_by', '', true);
  return public.rsvp_get(p_token);
end $$;
revoke all on function public.rsvp_answer(text, jsonb) from public;
grant execute on function public.rsvp_answer(text, jsonb) to anon, authenticated;

-- 6. Owner functions -------------------------------------------------------------------------------
-- New link for one invitation (the old one stops working at once). Returns the new token.
create or replace function public.rotate_invite_link(p_invite uuid) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare tok text;
begin
  if not exists (select 1 from public.invites i join public.events e on e.id = i.event_id
                  where i.id = p_invite and e.owner = auth.uid()) then
    raise exception 'not found' using errcode = '42501';
  end if;
  perform set_config('supra.owner_fn', 'on', true);
  update public.invites set token = public.supra_new_token() where id = p_invite returning token into tok;
  perform set_config('supra.owner_fn', '', true);
  return tok;
end $$;
revoke all on function public.rotate_invite_link(uuid) from public, anon;
grant execute on function public.rotate_invite_link(uuid) to authenticated;

-- "Delete contact details now": phone numbers and emails of one event's invitations.
create or replace function public.clear_rsvp_contacts(p_event uuid) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.events where id = p_event and owner = auth.uid()) then
    raise exception 'not found' using errcode = '42501';
  end if;
  update public.invites set phone = null, email = null
   where event_id = p_event and (phone is not null or email is not null);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.clear_rsvp_contacts(uuid) from public, anon;
grant execute on function public.clear_rsvp_contacts(uuid) to authenticated;

-- 7. Contact data is kept for 90 days after the event ------------------------------------------------
-- Schedule once in Supabase (Database → Cron, or SQL):
--   select cron.schedule('supra-purge-rsvp-contacts', '17 3 * * *', 'select public.supra_purge_rsvp_contacts()');
create or replace function public.supra_purge_rsvp_contacts() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update public.invites i set phone = null, email = null
    from public.events e
   where e.id = i.event_id and (i.phone is not null or i.email is not null)
     and coalesce(e.starts_at, e.event_date::timestamptz) < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.supra_purge_rsvp_contacts() from public, anon, authenticated;
