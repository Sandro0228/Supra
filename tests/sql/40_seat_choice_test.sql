-- "Guests choose their own seat": the guest page gets the table only — no seat numbers, no drawings at chairs.
\set ON_ERROR_STOP on
set request.headers = '{"x-forwarded-for":"10.0.0.40"}';
do $$
declare j jsonb; r jsonb;
begin
  update public.events set guest_page = true, lookup_mode = 'prefix', lookup_pin_hash = null,
         data = jsonb_set(data, '{event,seatMode}', '"table"') where slug = 'testslug01';
  j := public.public_plan('testslug01');
  assert j->'lookup'->>'seatMode' = 'table', 'seat mode not reported';
  assert not exists (select 1 from jsonb_array_elements(j->'tables') t, jsonb_array_elements(t->'seats') st
                      where jsonb_typeof(st) <> 'boolean'), 'drawings or seat details sent in table mode';
  assert (select count(*) from jsonb_array_elements(j->'tables') t, jsonb_array_elements(t->'seats') st where st = 'true'::jsonb) > 0, 'taken seats missing';
  -- each table lists its guests' drawings (no names, nothing else), as many as are seated there
  assert (select count(*) from jsonb_array_elements(j->'tables'->0->'people')) =
         (select count(*) from jsonb_array_elements(j->'tables'->0->'seats') st where st = 'true'::jsonb), 'people count differs';
  assert not exists (select 1 from jsonb_array_elements(j->'tables') t, jsonb_array_elements(t->'people') pe
                      where (select array_agg(k order by k) from jsonb_object_keys(pe) k) <> array['kid','look']), 'person carries more than a drawing';
  assert j::text not like '%ლაშა%' and j::text not like '%SECRET%', 'name or private field leaked';
  r := public.find_seat('testslug01', 'ლაშა');
  assert r->>'status' = 'ok' and jsonb_array_length(r->'matches') = 1, 'search broke in table mode';
  assert r->'matches'->0->'seat' = 'null'::jsonb and r->'matches'->0 ? 'tableName', 'seat number leaked in table mode';
  -- back to seats: numbers return
  update public.events set data = jsonb_set(data, '{event,seatMode}', '"seat"') where slug = 'testslug01';
  r := public.find_seat('testslug01', 'ლაშა');
  assert (r->'matches'->0->>'seat')::int >= 1, 'seat number missing in seat mode';
  assert public.public_plan('testslug01')->'tables'->0->'people' = 'null'::jsonb, 'people list only in table mode';
  raise notice 'ok 13 table-only mode hides seats';
end $$;
