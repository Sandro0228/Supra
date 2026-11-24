-- Supra migration 012: delete my account. Run after 011_entitlements.sql. Safe to run more than once.
--
-- What changes
--   * delete_my_account(): the signed-in user deletes their own account. All their events go at once, with the
--     guest pages, invitations, answers, link history and lookup counts that belong to them (foreign keys cascade).
--     Payment records (entitlements) stay for accounting but lose the link to the person (owner and event set null).
--   * Only the caller's own account; anonymous visitors cannot call it.
--
-- Rollback
--   drop function if exists public.delete_my_account();

create or replace function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.events where owner = u;   -- guest pages, invitations and answers go with each event
  delete from auth.users where id = u;         -- entitlements keep amount and date, owner becomes null
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
