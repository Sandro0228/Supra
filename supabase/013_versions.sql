-- Supra migration 013: version history. Run after 012_account.sql. Safe to run more than once.
--
-- What changes
--   * event_versions: earlier copies of each plan. Only the event's owner can read them (never guests).
--   * Automatic: when a save changes the plan, the version being replaced is kept, at most one every 30 minutes,
--     so an afternoon of editing leaves a trail of restore points without a copy per keystroke.
--   * On request: add_restore_point(event, reason, data) keeps a copy before risky steps (import, clear the plan,
--     choosing the other version in a save conflict) or when the organiser asks. data = the plan as the planner
--     has it (it may be newer than the last save); null = the saved plan.
--   * The latest 60 versions per event are kept; older ones are removed. Versions go with their event.
--   * Restoring happens in the planner: it loads a version as a normal, undoable change and saves it (010 check).
--
-- Rollback
--   drop trigger if exists events_keep_version on public.events;
--   drop function if exists public.supra_keep_version(), public.add_restore_point(uuid, text, jsonb),
--     public.supra_prune_versions(uuid);
--   drop table if exists public.event_versions;   -- only if the history is not wanted any more

-- 1. Table -----------------------------------------------------------------------------------------------
create table if not exists public.event_versions (
  id        bigserial primary key,
  event_id  uuid not null references public.events(id) on delete cascade,
  saved_at  timestamptz not null default now(),   -- when this version was the current plan
  reason    text not null default 'auto' check (reason in ('auto', 'manual', 'import', 'clear', 'conflict', 'restore')),
  guests    int not null default 0,
  tables    int not null default 0,
  data      jsonb not null
);
create index if not exists event_versions_event_idx on public.event_versions (event_id, saved_at desc);
alter table public.event_versions enable row level security;
revoke all on public.event_versions from anon, authenticated;
grant select on public.event_versions to authenticated;
drop policy if exists "owner reads versions" on public.event_versions;
create policy "owner reads versions" on public.event_versions for select
  using (exists (select 1 from public.events e where e.id = event_id and e.owner = (select auth.uid())));

-- 2. Keep the latest 60 per event -----------------------------------------------------------------------
create or replace function public.supra_prune_versions(p_event uuid) returns void
language sql volatile security definer set search_path = public as $$
  delete from public.event_versions
   where event_id = p_event
     and id not in (select id from public.event_versions where event_id = p_event order by saved_at desc, id desc limit 60)
$$;
revoke all on function public.supra_prune_versions(uuid) from public, anon, authenticated;

-- 3. Automatic versions ----------------------------------------------------------------------------------
create or replace function public.supra_keep_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.data is distinct from old.data
     and jsonb_typeof(old.data->'tables') = 'array'                -- a real plan, not the empty start
     and not exists (select 1 from public.event_versions
                      where event_id = old.id and reason = 'auto' and saved_at > now() - interval '30 minutes') then
    insert into public.event_versions (event_id, saved_at, reason, guests, tables, data)
    values (old.id, old.updated_at, 'auto', public.supra_guest_count(old.data), jsonb_array_length(old.data->'tables'), old.data);
    perform public.supra_prune_versions(old.id);
  end if;
  return null;
end $$;
revoke all on function public.supra_keep_version() from public, anon, authenticated;
drop trigger if exists events_keep_version on public.events;
create trigger events_keep_version after update on public.events
  for each row execute function public.supra_keep_version();

-- 4. Restore points on request (owner only) -------------------------------------------------------------
create or replace function public.add_restore_point(p_event uuid, p_reason text, p_data jsonb default null) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare d jsonb; vid bigint;
begin
  select coalesce(p_data, data) into d from public.events where id = p_event and owner = auth.uid() and deleted_at is null;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  if p_reason not in ('manual', 'import', 'clear', 'conflict', 'restore') then raise exception 'bad reason' using errcode = '22023'; end if;
  if jsonb_typeof(d->'tables') <> 'array' or jsonb_typeof(d->'guests') <> 'object' then raise exception 'not a plan' using errcode = '22023'; end if;
  if pg_column_size(d) > 2000000 then raise exception 'plan too large' using errcode = '22023'; end if;
  insert into public.event_versions (event_id, reason, guests, tables, data)
  values (p_event, p_reason, public.supra_guest_count(d), jsonb_array_length(d->'tables'), d)
  returning id into vid;
  perform public.supra_prune_versions(p_event);
  return vid;
end $$;
revoke all on function public.add_restore_point(uuid, text, jsonb) from public, anon;
grant execute on function public.add_restore_point(uuid, text, jsonb) to authenticated;
