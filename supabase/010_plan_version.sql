-- Supra migration 010: plan version for safe saving from two tabs or devices (risk R8).
-- Run after 009_trash.sql. Safe to run more than once.
--
-- What changes
--   * events gain version (int). The server adds 1 whenever the plan (data) changes, and only then: publishing,
--     privacy settings, trash and RSVP details don't count, so they never look like a conflicting edit.
--   * The planner saves with "update … where id = … and version = <the version it loaded>". If another tab or
--     device saved in between, nothing is updated and the planner asks which version to keep.
--     Concurrent saves are safe: under read committed, the second update re-checks the version after the first
--     commits and matches no row.
--   * Clients can't set version themselves; the trigger always derives it from the old row.
--
-- Rollback
--   drop trigger if exists events_plan_version on public.events;
--   drop function if exists public.supra_plan_version();
--   The column can stay (planners then save without the check); or: alter table public.events drop column version;

alter table public.events add column if not exists version int not null default 1;

create or replace function public.supra_plan_version() returns trigger
language plpgsql set search_path = public as $$
begin
  new.version := old.version + case when new.data is distinct from old.data then 1 else 0 end;
  return new;
end $$;
revoke all on function public.supra_plan_version() from public, anon, authenticated;

drop trigger if exists events_plan_version on public.events;
create trigger events_plan_version before update on public.events
  for each row execute function public.supra_plan_version();
