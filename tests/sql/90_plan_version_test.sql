-- Migration 010: the plan version goes up only when the plan changes; a save based on an old version updates nothing.
\set ON_ERROR_STOP on
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.events (id, name, slug, data) values ('ffffffff-0000-0000-0000-000000000006', 'Version test', 'x', '{"tables":[]}');
reset role;

-- A. New events start at 1; plan changes add 1; other changes (name, publishing, trash) don't; clients can't set it.
set role authenticated;
update public.events set name = 'Renamed' where id = 'ffffffff-0000-0000-0000-000000000006';
select public.publish_guest_page('ffffffff-0000-0000-0000-000000000006');
reset role;
set role authenticated;
update public.events set version = 99 where id = 'ffffffff-0000-0000-0000-000000000006';
reset role;
do $$ begin
  assert (select version from public.events where id = 'ffffffff-0000-0000-0000-000000000006') = 1, 'version moved without a plan change';
end $$;
set role authenticated;
update public.events set data = '{"tables":[],"guests":{"a":{"name":"A"}}}' where id = 'ffffffff-0000-0000-0000-000000000006' and version = 1;
reset role;
do $$ begin
  assert (select version from public.events where id = 'ffffffff-0000-0000-0000-000000000006') = 2, 'plan change did not bump the version';
  raise notice 'ok A version counts plan changes only';
end $$;

-- B. Two tabs both loaded version 2. The first save wins; the second (still on 2) updates nothing.
set role authenticated;
update public.events set data = '{"tables":[],"guests":{"b":{"name":"Tab one"}}}' where id = 'ffffffff-0000-0000-0000-000000000006' and version = 2;
update public.events set data = '{"tables":[],"guests":{"c":{"name":"Tab two"}}}' where id = 'ffffffff-0000-0000-0000-000000000006' and version = 2;
reset role;
do $$ begin
  assert (select data->'guests' ? 'b' and version = 3 from public.events where id = 'ffffffff-0000-0000-0000-000000000006'),
    'stale save overwrote the newer plan';
  raise notice 'ok B a save from an old version changes nothing';
end $$;

-- C. Another user's update never matches, whatever version they send.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
update public.events set data = '{}' where id = 'ffffffff-0000-0000-0000-000000000006' and version = 3;
reset role;
do $$ begin
  assert (select version from public.events where id = 'ffffffff-0000-0000-0000-000000000006') = 3, 'other user saved';
  raise notice 'ok C other users cannot save';
end $$;
