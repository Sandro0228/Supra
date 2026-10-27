-- Guest lookup privacy tests. Run: tests/sql/run.sh  (fails loudly on the first broken assertion)
\set ON_ERROR_STOP on
set request.headers = '{"x-forwarded-for":"10.0.0.1"}';

-- 1. The public layout carries no guest data at all.
do $$
declare j jsonb := public.public_plan('testslug01'); s text;
begin
  assert j is not null, 'public_plan returned null';
  s := j::text;
  assert j ? 'event' and j ? 'tables' and j ? 'venue' and j ? 'lookup', 'missing top-level keys';
  assert not j ? 'guests', 'guests key leaked';
  assert s not like '%ლაშა%' and s not like '%Neighbour%' and s not like '%Waiting Person%', 'a guest name leaked';
  assert s not like '%SECRET_ALLERGY%' and s not like '%SECRET_GROUP%' and s not like '%"meal"%' and s not like '%allergies%', 'private field leaked';
  assert s not like '%g01%' and s not like '%"rules"%' and s not like '%"waiting"%', 'internal id or rules leaked';
  assert s not like '%aaaaaaaa%' and s not like '%1111111%', 'event or owner id leaked';
  -- each seat: false, or only the drawing and the child flag
  assert not exists (select 1 from jsonb_array_elements(j->'tables') t, jsonb_array_elements(t->'seats') st
                      where not (st = 'false'::jsonb or (jsonb_typeof(st) = 'object'
                        and (select array_agg(k order by k) from jsonb_object_keys(st) k) = array['kid','look']))), 'seat carries more than a drawing';
  assert not exists (select 1 from jsonb_array_elements(j->'tables') t, jsonb_array_elements(t->'seats') st, jsonb_object_keys(st->'look') k
                      where jsonb_typeof(st) = 'object' and k not in ('kind','skin','hair','hairColor','beard','beardColor','eye','outfit','outfitColor','glasses')), 'unexpected drawing field';
  assert (select array_agg(k order by k) from jsonb_object_keys(j->'tables'->0) k) = array['deco','name','rot','seats','shape','x','y'], 'unexpected table fields';
  raise notice 'ok 1 public_plan has only layout';
end $$;

-- 2. Empty, 1- and 2-letter queries return nothing (Georgian and Latin, with spaces).
do $$ begin
  assert public.find_seat('testslug01', '')->>'status' = 'short';
  assert public.find_seat('testslug01', 'ნ')->>'status' = 'short';
  assert public.find_seat('testslug01', 'ნა')->>'status' = 'short';
  assert public.find_seat('testslug01', '  n e ')->>'status' = 'short';
  assert public.find_seat('testslug01', null)->>'status' = 'short';
  assert jsonb_array_length(public.find_seat('testslug01', 'ნა')->'matches') = 0;
  raise notice 'ok 2 short queries return no guest data';
end $$;

-- 3. Prefix search returns only approved fields.
do $$
declare r jsonb := public.find_seat('testslug01', 'ქეთევან'); m jsonb; s text;
begin
  assert r->>'status' = 'ok', 'status ' || (r->>'status');
  assert jsonb_array_length(r->'matches') = 1, 'expected 1 match';
  m := r->'matches'->0;
  assert m->>'name' = 'ქეთევან ლორთქიფანიძე' and m->>'tableName' = 'Table 2' and (m->>'table')::int = 2, 'wrong match ' || m::text;
  assert (select array_agg(k order by k) from jsonb_object_keys(m) k) = array['kid','look','mates','name','seat','table','tableName'], 'unexpected fields ' || m::text;
  assert jsonb_typeof(m->'mates') = 'null', 'tablemates must be hidden by default';
  s := r::text;
  assert s not like '%SECRET%' and s not like '%"meal"%' and s not like '%allergies%' and s not like '%"group"%' and s not like '%"id"%', 'private field leaked';
  raise notice 'ok 3 prefix match with approved fields only';
end $$;

-- 4. Surname prefix, duplicate first names, case and spacing normalization, private guest.
do $$
declare r jsonb;
begin
  r := public.find_seat('testslug01', 'გელა');
  assert jsonb_array_length(r->'matches') = 2, 'surname prefix should find 2';
  r := public.find_seat('testslug01', 'მარიამ');
  assert r->>'status' = 'ok' and jsonb_array_length(r->'matches') = 4, 'four Mariams expected, got ' || r::text;
  assert (select count(distinct x->>'tableName') from jsonb_array_elements(r->'matches') x) >= 2, 'duplicates must keep table context';
  r := public.find_seat('testslug01', '  NEIGHBOUR    3 ');
  assert jsonb_array_length(r->'matches') = 1 and r->'matches'->0->>'name' = 'Neighbour 3', 'case/space normalization failed';
  r := public.find_seat('testslug01', 'secret_allergy');
  assert jsonb_array_length(r->'matches') = 0, 'must not search private fields';
  r := public.find_seat('testslug01', 'waiting person');
  assert jsonb_array_length(r->'matches') = 0, 'unseated guests must not be returned';
  raise notice 'ok 4 normalization and duplicates';
end $$;

-- 5. More than 5 matches: ask for more letters instead of listing.
do $$ declare r jsonb := public.find_seat('testslug01', 'neighbour');
begin
  assert r->>'status' = 'many' and jsonb_array_length(r->'matches') = 0, 'expected many ' || r::text;
  raise notice 'ok 5 result cap';
end $$;

-- 6. Wildcards in the query are treated as plain text.
do $$ begin
  assert jsonb_array_length(public.find_seat('testslug01', '%%%')->'matches') = 0, 'percent wildcard matched';
  assert jsonb_array_length(public.find_seat('testslug01', '___')->'matches') = 0, 'underscore wildcard matched';
  raise notice 'ok 6 wildcards escaped';
end $$;

-- 7. Owner switches to exact full-name matching, adds a PIN and enables tablemates.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select public.set_guest_lookup('aaaaaaaa-0000-0000-0000-000000000001', 'exact', '2810', true);
reset role;
set request.jwt.claim.sub = '';
do $$
declare r jsonb;
begin
  assert (public.public_plan('testslug01')->'lookup') = '{"mode":"exact","pin":true}'::jsonb, 'lookup policy not exposed correctly';
  assert public.find_seat('testslug01', 'ქეთევან ლორთქიფანიძე')->>'status' = 'pin', 'PIN must be required';
  assert public.find_seat('testslug01', 'ქეთევან ლორთქიფანიძე', '0000')->>'status' = 'pin', 'wrong PIN accepted';
  r := public.find_seat('testslug01', 'ქეთევან ლორთქიფანიძე', ' 2810 ');
  assert r->>'status' = 'ok' and jsonb_array_length(r->'matches') = 1, 'exact + PIN failed ' || r::text;
  assert jsonb_array_length(r->'matches'->0->'mates') = 5, 'tablemates expected when enabled';
  assert not (r->'matches'->0->'mates') ? 'ქეთევან ლორთქიფანიძე', 'self in mates';
  assert jsonb_array_length(public.find_seat('testslug01', 'ქეთევან', '2810')->'matches') = 0, 'prefix must not match in exact mode';
  assert jsonb_array_length(public.find_seat('testslug01', 'ლორთქიფანიძე ქეთევან', '2810')->'matches') = 1, 'surname-first should match';
  raise notice 'ok 7 exact mode, PIN, tablemates';
end $$;

-- 8. Other users cannot change someone else's policy; anonymous visitors cannot call it at all.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$ begin
  begin perform public.set_guest_lookup('aaaaaaaa-0000-0000-0000-000000000001', 'prefix', '', false);
        raise exception 'other user changed policy';
  exception when others then if sqlerrm = 'other user changed policy' then raise; end if; end;
  raise notice 'ok 8a other users blocked';
end $$;
reset role;
set role anon;
do $$ begin
  begin perform public.set_guest_lookup('aaaaaaaa-0000-0000-0000-000000000001', 'prefix', '', false);
        raise exception 'anon changed policy';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.seat_lookups; raise exception 'anon read seat_lookups';
  exception when insufficient_privilege then null; end;
  begin assert (select count(*) from public.events) = 0, 'anon can read events';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 8b anon blocked from settings, logs and events';
end $$;
reset role;

-- 9. Rate limit: 30 searches per visitor per 10 minutes; another visitor is unaffected.
truncate public.seat_lookups;
set request.headers = '{"x-forwarded-for":"203.0.113.9, 10.0.0.2"}';
do $$ declare i int; r jsonb;
begin
  for i in 1..30 loop r := public.find_seat('testslug01', 'ქეთევან ლორთქიფანიძე', '2810'); assert r->>'status' = 'ok', 'blocked too early at ' || i; end loop;
  assert public.find_seat('testslug01', 'ქეთევან ლორთქიფანიძე', '2810')->>'status' = 'rate_limited', 'rate limit not applied';
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.4"}', false);
  assert public.find_seat('testslug01', 'ქეთევან ლორთქიფანიძე', '2810')->>'status' = 'ok', 'other visitor blocked';
  raise notice 'ok 9 rate limit';
end $$;

-- 10. Guest page switched off: nothing is returned.
update public.events set guest_page = false;
do $$ begin
  assert public.public_plan('testslug01') is null, 'layout returned while off';
  assert public.find_seat('testslug01', 'ქეთევან ლორთქიფანიძე', '2810')->>'status' = 'not_found', 'search worked while off';
  raise notice 'ok 10 guest page off';
end $$;

-- 11. The old public copy was cleared by the migration; slugs and plans are untouched.
do $$ begin
  assert (select public_data from public.events) = '{}'::jsonb, 'old public copy not cleared';
  assert (select slug from public.events) = 'testslug01', 'slug changed';
  assert (select data->'guests'->'n1'->>'name' from public.events) = 'Neighbour 1', 'plan data changed';
  raise notice 'ok 11 data preserved';
end $$;
