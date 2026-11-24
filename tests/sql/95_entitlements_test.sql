-- Migration 011: plans. Free events up to 40 guests; event pass / Pro lift the limit; existing events got a launch pass.
\set ON_ERROR_STOP on
create temp table guests41 as
  select jsonb_build_object('tables', '[]'::jsonb,
           'guests', (select jsonb_object_agg('g' || i, jsonb_build_object('name', 'Guest ' || i)) from generate_series(1, 41) i)) as d;
create temp table guests40 as
  select jsonb_build_object('tables', '[]'::jsonb,
           'guests', (select jsonb_object_agg('g' || i, jsonb_build_object('name', 'Guest ' || i)) from generate_series(1, 40) i)) as d;
grant select on guests41, guests40 to anon, authenticated;

-- A. Every event that existed at launch has exactly one launch pass, even though the migration ran twice.
do $$ begin
  assert (select count(*) from public.events e
           where (select count(*) from public.entitlements x where x.event_id = e.id and x.source = 'launch') <> 1) = 0,
    'launch passes missing or duplicated';
  assert (select count(*) from public.entitlements where source = 'launch') = (select count(*) from public.events), 'launch count';
  raise notice 'ok A existing events keep working (one launch pass each)';
end $$;

-- B. A new event is free: limit 40.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.events (id, name, slug, data) values ('12121212-0000-0000-0000-000000000007', 'Free wedding', 'x', (select d from guests40));
do $$ declare a jsonb := public.event_access('12121212-0000-0000-0000-000000000007'); begin
  assert a->>'plan' = 'free' and (a->>'limit')::int = 40 and (a->>'guests')::int = 40, 'free access: ' || a::text;
  -- at the limit everything works
  perform public.publish_guest_page('12121212-0000-0000-0000-000000000007');
  perform public.unpublish_guest_page('12121212-0000-0000-0000-000000000007');
  raise notice 'ok B new events are free with a 40-guest limit';
end $$;

-- C. Over the limit: saving still works, publishing and invitations are refused.
update public.events set data = (select d from guests41) where id = '12121212-0000-0000-0000-000000000007';
do $$ begin
  assert public.supra_guest_count((select data from public.events where id = '12121212-0000-0000-0000-000000000007')) = 41, 'save blocked';
  begin perform public.publish_guest_page('12121212-0000-0000-0000-000000000007'); raise exception 'published over the limit';
  exception when raise_exception then assert sqlerrm = 'event pass required', sqlerrm; end;
  begin insert into public.invites (event_id, name, members) values ('12121212-0000-0000-0000-000000000007', 'Family', array['g1']);
        raise exception 'invited over the limit';
  exception when raise_exception then assert sqlerrm = 'event pass required', sqlerrm; end;
  raise notice 'ok C over the limit: saving works, publishing and invitations need a pass';
end $$;

-- D. Nobody grants themselves a plan; owners read only their own rows.
do $$ begin
  begin insert into public.entitlements (owner, event_id, kind, source) values (auth.uid(), '12121212-0000-0000-0000-000000000007', 'event_pass', 'grant');
        raise exception 'client inserted an entitlement';
  exception when insufficient_privilege then null; end;
  begin perform public.supra_grant_pass('12121212-0000-0000-0000-000000000007', 'grant', 'self', 0); raise exception 'client granted a pass';
  exception when insufficient_privilege then null; end;
  begin perform public.supra_grant_pro(auth.uid(), 12, 'grant', 'self-pro', 0); raise exception 'client granted pro';
  exception when insufficient_privilege then null; end;
  update public.entitlements set status = 'active', ends_at = null;   -- no update privilege: must not change anything
  raise notice 'ok D1 clients cannot grant or change plans';
exception when insufficient_privilege then raise notice 'ok D1 clients cannot grant or change plans';
end $$;
reset role;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$ begin
  assert (select count(*) from public.entitlements) = 0, 'other user reads plans';
  begin perform public.event_access('12121212-0000-0000-0000-000000000007'); raise exception 'other user read access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform public.event_access('12121212-0000-0000-0000-000000000007'); raise exception 'anon read access';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.entitlements; raise exception 'anon reads plans';
  exception when insufficient_privilege then null; end;
  raise notice 'ok D2 plans are private to their owner';
end $$;
reset role;

-- E. An event pass lifts the limit; a payment reference is used once; a refund ends it.
do $$ declare a uuid; b uuid; begin
  a := public.supra_grant_pass('12121212-0000-0000-0000-000000000007', 'tbc', 'tbc-order-1', 79);
  b := public.supra_grant_pass('12121212-0000-0000-0000-000000000007', 'tbc', 'tbc-order-1', 79);
  assert a is not null and b is null, 'payment reference reused';
  assert (select count(*) from public.entitlements where payment_ref = 'tbc-order-1') = 1, 'duplicate pass';
  assert (select owner from public.entitlements where id = a) = '11111111-1111-1111-1111-111111111111', 'pass owner';
end $$;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
do $$ begin
  assert public.event_access('12121212-0000-0000-0000-000000000007')->>'plan' = 'pass', 'pass not active';
  assert not public.event_access('12121212-0000-0000-0000-000000000007') ? 'limit', 'paid plan has a limit';
  perform public.publish_guest_page('12121212-0000-0000-0000-000000000007');
  insert into public.invites (event_id, name, members) values ('12121212-0000-0000-0000-000000000007', 'Family', array['g1']);
  assert (select count(*) from public.entitlements where event_id = '12121212-0000-0000-0000-000000000007') = 1, 'owner sees own pass';
  raise notice 'ok E an event pass lifts the limit';
end $$;
reset role;
update public.entitlements set status = 'refunded' where payment_ref = 'tbc-order-1';
set role authenticated;
do $$ begin
  assert public.event_access('12121212-0000-0000-0000-000000000007')->>'plan' = 'free', 'refunded pass still active';
  raise notice 'ok E2 a refunded pass ends';
end $$;
reset role;

-- F. Pro covers every event of the account while it lasts; a renewal starts when the current period ends.
do $$ declare first_end timestamptz; begin
  perform public.supra_grant_pro('11111111-1111-1111-1111-111111111111', 1, 'bog', 'bog-1', 99);
  first_end := (select ends_at from public.entitlements where payment_ref = 'bog-1');
  perform public.supra_grant_pro('11111111-1111-1111-1111-111111111111', 1, 'bog', 'bog-2', 99);
  assert (select starts_at from public.entitlements where payment_ref = 'bog-2') = first_end, 'renewal overlaps';
  begin perform public.supra_grant_pro('11111111-1111-1111-1111-111111111111', 0, 'bog', 'bog-3', 0); raise exception 'zero months';
  exception when invalid_parameter_value then null; end;
end $$;
set role authenticated;
do $$ begin
  assert public.event_access('12121212-0000-0000-0000-000000000007')->>'plan' = 'pro', 'pro not applied';
  raise notice 'ok F Pro covers all events and renewals queue up';
end $$;
reset role;
update public.entitlements set starts_at = now() - interval '3 months', ends_at = now() - interval '1 day' where kind = 'pro';
set role authenticated;
do $$ begin
  assert public.event_access('12121212-0000-0000-0000-000000000007')->>'plan' = 'free', 'expired pro still active';
  raise notice 'ok F2 Pro ends when its period ends';
end $$;
reset role;
