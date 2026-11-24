-- Supra migration 009: trash. Deleting an event moves it to the trash for 30 days; the couple can restore it.
-- Run after 008_rsvp.sql. Safe to run more than once. Closes risk R7 (one click deleted a whole plan for good).
--
-- What changes
--   * events gain deleted_at (in the trash since) and trash_share_status (the guest-page state before trashing).
--   * trash_event(event) and restore_event(event) are the only way in and out of the trash (owner only).
--     A trashed event's guest page and RSVP links stop answering; restoring brings a published page back.
--   * Events can be deleted for good only from the trash (row-level security), so no client bug or old tab can
--     destroy a live plan. supra_purge_trash() removes events trashed more than 30 days ago (schedule it, below).
--   * Owner share functions (publish, rotate, presets …) refuse trashed events.
--
-- Rollback
--   Re-run the "owner can delete" policy from schema.sql, re-run 006_share_lifecycle.sql (supra_own, guard) and
--   008_rsvp.sql (rsvp_get, rsvp_answer), then:
--     drop function if exists public.trash_event(uuid), public.restore_event(uuid), public.supra_purge_trash();
--   Restore any trashed events first: update public.events set deleted_at = null where deleted_at is not null;
--   The new columns can stay; older code ignores them.

-- 1. Columns ------------------------------------------------------------------------------------------
alter table public.events
  add column if not exists deleted_at         timestamptz,
  add column if not exists trash_share_status text;
create index if not exists events_trash_idx on public.events (deleted_at) where deleted_at is not null;

-- 2. Delete for good only from the trash ----------------------------------------------------------------
drop policy if exists "owner can delete" on public.events;
create policy "owner can delete" on public.events for delete using (owner = auth.uid() and deleted_at is not null);

-- 3. The trash state changes only through the owner functions (same guard as 006, plus two columns) -----
create or replace function public.supra_share_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('supra.owner_fn', true), '') <> 'on' then
    if new.slug is distinct from old.slug then raise exception 'the guest link changes only with rotate_guest_link' using errcode = '42501'; end if;
    if new.lookup_pin_hash is distinct from old.lookup_pin_hash then raise exception 'the invitation code changes only with set_guest_lookup' using errcode = '42501'; end if;
    new.share_status := old.share_status;
    new.share_expires_at := old.share_expires_at;
    new.share_published_at := old.share_published_at;
    new.deleted_at := old.deleted_at;
    new.trash_share_status := old.trash_share_status;
  end if;
  new.guest_page := new.share_status = 'published';
  return new;
end $$;

-- Owner share functions work only on live events.
create or replace function public.supra_own(p_event uuid) returns public.events
language plpgsql security definer set search_path = public as $$
declare r public.events;
begin
  select * into r from public.events where id = p_event and owner = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  perform set_config('supra.owner_fn', 'on', true);
  return r;
end $$;
revoke all on function public.supra_own(uuid) from public, anon, authenticated;

-- 4. Owner functions ------------------------------------------------------------------------------------
-- Into the trash: a published guest page goes back to draft (public_plan and find_seat then answer
-- "unavailable"), and its state is remembered for restore_event.
create or replace function public.trash_event(p_event uuid) returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare r public.events := public.supra_own(p_event); at timestamptz := now();
begin
  update public.events
     set deleted_at = at, trash_share_status = r.share_status,
         share_status = case when r.share_status = 'published' then 'draft' else r.share_status end
   where id = p_event;
  perform set_config('supra.owner_fn', '', true);
  return at;
end $$;

-- Out of the trash, with the guest page as it was (unless its link expired meanwhile, which public_plan checks).
create or replace function public.restore_event(p_event uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform 1 from public.events where id = p_event and owner = auth.uid() and deleted_at is not null for update;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  perform set_config('supra.owner_fn', 'on', true);
  update public.events
     set deleted_at = null, trash_share_status = null,
         share_status = case when share_status = 'draft' and trash_share_status = 'published' then 'published' else share_status end
   where id = p_event;
  perform set_config('supra.owner_fn', '', true);
end $$;

revoke all on function public.trash_event(uuid) from public, anon;
revoke all on function public.restore_event(uuid) from public, anon;
grant execute on function public.trash_event(uuid) to authenticated;
grant execute on function public.restore_event(uuid) to authenticated;

-- 5. RSVP links of trashed events stop answering (same as 008 plus the trash check) ---------------------
create or replace function public.rsvp_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare i public.invites; e public.events; dl timestamptz; mem jsonb;
begin
  select * into i from public.invites where token = p_token and not revoked;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  select * into e from public.events where id = i.event_id;
  if e.deleted_at is not null then return jsonb_build_object('status', 'unavailable'); end if;
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

create or replace function public.rsvp_answer(p_token text, p_answer jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare i public.invites; e public.events; dl timestamptz;
begin
  select * into i from public.invites where token = p_token and not revoked for update;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  select * into e from public.events where id = i.event_id;
  if e.deleted_at is not null then return jsonb_build_object('status', 'unavailable'); end if;
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

-- 6. Empty the trash after 30 days ----------------------------------------------------------------------
-- Schedule once in Supabase (Database → Cron, or SQL):
--   select cron.schedule('supra-purge-trash', '37 3 * * *', 'select public.supra_purge_trash()');
create or replace function public.supra_purge_trash() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  delete from public.events where deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.supra_purge_trash() from public, anon, authenticated;
