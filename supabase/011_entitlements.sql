-- Supra migration 011: plans. Free events seat up to 40 guests; an event pass (79 ₾, one event) or Pro (99 ₾/month,
-- every event of the account) removes the limit. Run after 010_plan_version.sql. Safe to run more than once.
--
-- What changes
--   * entitlements: one row per pass or Pro period (who, which event, source, payment reference, amount). Owners can
--     read their own rows; nobody can write them through the API. Rows are added by supra_grant_pass /
--     supra_grant_pro (SQL editor now; the bank callback later), so a client can never grant itself a plan.
--   * Every event that exists when this first runs gets a free event pass (source 'launch'): no current user hits a
--     limit. Running the file again grants nothing new (events created after launch follow the normal rules).
--   * event_access(event): the event's plan for the planner (free | pass | pro, guest limit, guest count).
--   * The server refuses two things for a free event above 40 guests: publishing the guest page and creating
--     invitations. Editing and saving are never blocked, so no one can lose work; the planner stops new guests itself.
--
-- Rollback
--   Re-run publish_guest_page from 006_share_lifecycle.sql (removes the plan check), then:
--     drop trigger if exists invites_plan_guard on public.invites;
--     drop function if exists public.event_access(uuid), public.supra_over_free(uuid), public.supra_event_paid(uuid),
--       public.supra_event_plan(uuid), public.supra_guest_count(jsonb), public.supra_free_guest_limit(),
--       public.supra_invite_plan_guard(), public.supra_grant_pass(uuid, text, text, numeric),
--       public.supra_grant_pro(uuid, int, text, text, numeric);
--   Keep the entitlements table: it is the record of what people paid for.

-- 1. Entitlements ----------------------------------------------------------------------------------------
create table if not exists public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid references auth.users(id) on delete set null,     -- kept for accounting if the account goes
  event_id    uuid references public.events(id) on delete set null,
  kind        text not null check (kind in ('event_pass', 'pro')),
  source      text not null check (source in ('launch', 'grant', 'tbc', 'bog')),
  status      text not null default 'active' check (status in ('active', 'refunded', 'cancelled')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,                                          -- null: no end (event passes)
  amount_gel  numeric(10, 2),
  payment_ref text unique,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists entitlements_owner_idx on public.entitlements (owner);
create index if not exists entitlements_event_idx on public.entitlements (event_id);
alter table public.entitlements enable row level security;
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
drop policy if exists "owner reads own plans" on public.entitlements;
create policy "owner reads own plans" on public.entitlements for select using (owner = (select auth.uid()));

-- 2. Rules --------------------------------------------------------------------------------------------------
create or replace function public.supra_free_guest_limit() returns int
language sql immutable as $$ select 40 $$;

create or replace function public.supra_guest_count(d jsonb) returns int
language sql immutable as $$
  select case when jsonb_typeof(d->'guests') = 'object' then (select count(*)::int from jsonb_object_keys(d->'guests')) else 0 end
$$;

-- 'pro', 'pass' or null (free).
create or replace function public.supra_event_plan(p_event uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when bool_or(x.kind = 'pro') then 'pro' when bool_or(x.kind = 'event_pass') then 'pass' end
    from public.events e
    join public.entitlements x
      on x.status = 'active' and x.starts_at <= now() and (x.ends_at is null or x.ends_at > now())
     and ((x.kind = 'event_pass' and x.event_id = e.id) or (x.kind = 'pro' and x.owner = e.owner))
   where e.id = p_event
$$;
create or replace function public.supra_event_paid(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.supra_event_plan(p_event) is not null $$;

-- Free and over the limit?
create or replace function public.supra_over_free(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not public.supra_event_paid(p_event)
     and public.supra_guest_count((select data from public.events where id = p_event)) > public.supra_free_guest_limit()
$$;

-- For the planner: {plan: free|pass|pro, limit: 40 (free only), guests: n}
create or replace function public.event_access(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d jsonb; pl text;
begin
  select data into d from public.events where id = p_event and owner = auth.uid();
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  pl := coalesce(public.supra_event_plan(p_event), 'free');
  return jsonb_strip_nulls(jsonb_build_object('plan', pl, 'guests', public.supra_guest_count(d),
           'limit', case when pl = 'free' then public.supra_free_guest_limit() end));
end $$;

revoke all on function public.supra_event_plan(uuid) from public, anon, authenticated;
revoke all on function public.supra_event_paid(uuid) from public, anon, authenticated;
revoke all on function public.supra_over_free(uuid) from public, anon, authenticated;
revoke all on function public.event_access(uuid) from public, anon;
grant execute on function public.event_access(uuid) to authenticated;

-- 3. Where the server enforces the limit ------------------------------------------------------------------
-- Publishing the guest page (same as 006, plus the plan check).
create or replace function public.publish_guest_page(p_event uuid, p_expires timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r public.events := public.supra_own(p_event);
begin
  if r.share_status = 'revoked' then raise exception 'revoked: make a new link first' using errcode = '22023'; end if;
  if p_expires is not null and p_expires <= now() then raise exception 'expiry must be in the future' using errcode = '22023'; end if;
  if public.supra_over_free(p_event) then raise exception 'event pass required' using errcode = 'P0001'; end if;
  update public.events set share_status = 'published', share_published_at = now(), share_expires_at = p_expires where id = p_event;
  return public.supra_share_state(p_event);
end $$;
revoke all on function public.publish_guest_page(uuid, timestamptz) from public, anon;
grant execute on function public.publish_guest_page(uuid, timestamptz) to authenticated;

-- Creating invitations.
create or replace function public.supra_invite_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.supra_over_free(new.event_id) then raise exception 'event pass required' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function public.supra_invite_plan_guard() from public, anon, authenticated;
drop trigger if exists invites_plan_guard on public.invites;
create trigger invites_plan_guard before insert on public.invites
  for each row execute function public.supra_invite_plan_guard();

-- 4. Granting plans (SQL editor today; the bank callback later). Not callable through the API. ---------------
--   select public.supra_grant_pass('<event id>', 'grant', 'manual-2026-001', 79);
--   select public.supra_grant_pro('<user id>', 1, 'grant', 'manual-2026-002', 99);
create or replace function public.supra_grant_pass(p_event uuid, p_source text, p_ref text, p_amount numeric)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare o uuid; new_id uuid;
begin
  select owner into o from public.events where id = p_event;
  if not found then raise exception 'no such event' using errcode = '22023'; end if;
  insert into public.entitlements (owner, event_id, kind, source, payment_ref, amount_gel)
  values (o, p_event, 'event_pass', p_source, p_ref, p_amount)
  on conflict (payment_ref) do nothing
  returning entitlements.id into new_id;
  return new_id;   -- null: this payment reference was already used
end $$;

create or replace function public.supra_grant_pro(p_owner uuid, p_months int, p_source text, p_ref text, p_amount numeric)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare st timestamptz; new_id uuid;
begin
  if p_months is null or p_months < 1 then raise exception 'months must be at least 1' using errcode = '22023'; end if;
  -- a renewal starts when the current Pro period ends
  select greatest(now(), coalesce(max(ends_at), now())) into st from public.entitlements
   where owner = p_owner and kind = 'pro' and status = 'active';
  insert into public.entitlements (owner, kind, source, payment_ref, amount_gel, starts_at, ends_at)
  values (p_owner, 'pro', p_source, p_ref, p_amount, st, st + make_interval(months => p_months))
  on conflict (payment_ref) do nothing
  returning entitlements.id into new_id;
  return new_id;
end $$;
revoke all on function public.supra_grant_pass(uuid, text, text, numeric) from public, anon, authenticated;
revoke all on function public.supra_grant_pro(uuid, int, text, text, numeric) from public, anon, authenticated;

-- 5. Launch: every event that exists now keeps working without limits ---------------------------------------
insert into public.entitlements (owner, event_id, kind, source, note)
select e.owner, e.id, 'event_pass', 'launch', 'created before pricing'
  from public.events e
 where not exists (select 1 from public.entitlements x where x.source = 'launch');
