-- Migration 013: version history. Automatic versions at most every 30 minutes, restore points on request,
-- 60 per event, owner only.
\set ON_ERROR_STOP on
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.events (id, name, slug, data) values ('56565656-0000-0000-0000-000000000009', 'History', 'x', '{}');
reset role;

-- A. The empty start is not kept; the first real plan replaced by a save is; quick saves after it are not.
set role authenticated;
update public.events set data = '{"tables":[],"guests":{"a":{"name":"A"}}}' where id = '56565656-0000-0000-0000-000000000009';
update public.events set data = '{"tables":[{"id":"t1","seats":["a"]}],"guests":{"a":{"name":"A"},"b":{"name":"B"}}}' where id = '56565656-0000-0000-0000-000000000009';
update public.events set data = '{"tables":[{"id":"t1","seats":["a","b"]}],"guests":{"a":{"name":"A"},"b":{"name":"B"}}}' where id = '56565656-0000-0000-0000-000000000009';
update public.events set name = 'Renamed' where id = '56565656-0000-0000-0000-000000000009';   -- not a plan change
do $$ declare r public.event_versions; begin
  assert (select count(*) from public.event_versions where event_id = '56565656-0000-0000-0000-000000000009') = 1, 'auto versions not throttled';
  select * into r from public.event_versions where event_id = '56565656-0000-0000-0000-000000000009';
  assert r.reason = 'auto' and r.guests = 1 and r.tables = 0 and r.data->'guests' ? 'a', 'wrong version kept: ' || r.data::text;
  raise notice 'ok A one automatic version per 30 minutes, the plan as it was';
end $$;
reset role;

-- B. 30 minutes later the next save keeps another version.
update public.event_versions set saved_at = now() - interval '31 minutes' where event_id = '56565656-0000-0000-0000-000000000009';
set role authenticated;
update public.events set data = '{"tables":[],"guests":{}}' where id = '56565656-0000-0000-0000-000000000009';
do $$ begin
  assert (select count(*) from public.event_versions where event_id = '56565656-0000-0000-0000-000000000009' and reason = 'auto') = 2, 'no second version';
  assert (select tables from public.event_versions where event_id = '56565656-0000-0000-0000-000000000009' order by id desc limit 1) = 1, 'second version content';
  raise notice 'ok B a new automatic version after 30 minutes';
end $$;

-- C. Restore points on request: the saved plan or the planner's copy; bad input refused.
do $$ declare v bigint; begin
  v := public.add_restore_point('56565656-0000-0000-0000-000000000009', 'manual');
  assert (select reason = 'manual' and guests = 0 from public.event_versions where id = v), 'manual point';
  v := public.add_restore_point('56565656-0000-0000-0000-000000000009', 'conflict', '{"tables":[],"guests":{"z":{"name":"Mine"}}}');
  assert (select data->'guests' ? 'z' and guests = 1 from public.event_versions where id = v), 'planner copy not kept';
  begin perform public.add_restore_point('56565656-0000-0000-0000-000000000009', 'auto'); raise exception 'client made an auto version';
  exception when invalid_parameter_value then null; end;
  begin perform public.add_restore_point('56565656-0000-0000-0000-000000000009', 'manual', '{"x":1}'); raise exception 'non-plan kept';
  exception when invalid_parameter_value then null; end;
  raise notice 'ok C restore points on request';
end $$;

-- D. Clients cannot write versions directly.
do $$ begin
  begin insert into public.event_versions (event_id, data) values ('56565656-0000-0000-0000-000000000009', '{}'); raise exception 'direct insert';
  exception when insufficient_privilege then null; end;
  begin delete from public.event_versions; raise exception 'direct delete';
  exception when insufficient_privilege then null; end;
  raise notice 'ok D versions are written only by the server';
end $$;
reset role;

-- E. Only the owner reads versions or adds restore points; guests never.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$ begin
  assert (select count(*) from public.event_versions where event_id = '56565656-0000-0000-0000-000000000009') = 0, 'other user reads versions';
  begin perform public.add_restore_point('56565656-0000-0000-0000-000000000009', 'manual'); raise exception 'other user added a point';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform 1 from public.event_versions; raise exception 'anon reads versions';
  exception when insufficient_privilege then null; end;
  begin perform public.add_restore_point('56565656-0000-0000-0000-000000000009', 'manual'); raise exception 'anon added a point';
  exception when insufficient_privilege then null; end;
  raise notice 'ok E versions are private to the owner';
end $$;
reset role;

-- F. At most 60 versions per event, newest kept; versions go with the event.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
do $$ begin
  for i in 1..70 loop perform public.add_restore_point('56565656-0000-0000-0000-000000000009', 'manual'); end loop;
  assert (select count(*) from public.event_versions where event_id = '56565656-0000-0000-0000-000000000009') = 60, 'not pruned to 60';
  raise notice 'ok F60 the latest 60 versions are kept';
end $$;
select public.trash_event('56565656-0000-0000-0000-000000000009');
delete from public.events where id = '56565656-0000-0000-0000-000000000009';
reset role;
do $$ begin
  assert (select count(*) from public.event_versions where event_id = '56565656-0000-0000-0000-000000000009') = 0, 'versions outlived the event';
  raise notice 'ok F versions go with their event';
end $$;
