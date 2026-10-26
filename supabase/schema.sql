-- Supra: run this once in Supabase → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default '',
  type        text not null default 'wedding',
  event_date  date,
  slug        text not null unique,                 -- random code used in the guest link /e/<slug>
  data        jsonb not null default '{}'::jsonb,   -- the full plan (only the owner can read it)
  public_data jsonb not null default '{}'::jsonb,   -- names, looks and tables only, for the guest page
  guest_page  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists events_owner_idx on public.events(owner);

alter table public.events enable row level security;

drop policy if exists "owner can read"   on public.events;
drop policy if exists "owner can insert" on public.events;
drop policy if exists "owner can update" on public.events;
drop policy if exists "owner can delete" on public.events;
create policy "owner can read"   on public.events for select using (owner = auth.uid());
create policy "owner can insert" on public.events for insert with check (owner = auth.uid());
create policy "owner can update" on public.events for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner can delete" on public.events for delete using (owner = auth.uid());

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- Guests look up seats without signing in. They only ever get public_data,
-- and only when the owner has the guest page switched on.
create or replace function public.public_plan(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public_data from public.events where slug = p_slug and guest_page limit 1
$$;
revoke all on function public.public_plan(text) from public;
grant execute on function public.public_plan(text) to anon, authenticated;
