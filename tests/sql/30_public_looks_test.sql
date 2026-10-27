-- The guest page gets each seated guest's drawing exactly as saved, and a stray field on a look never leaks.
\set ON_ERROR_STOP on
do $$
declare j jsonb; first_seat jsonb; g jsonb; i int;
begin
  -- plant a stray field inside one guest's look
  update public.events set guest_page = true, data = jsonb_set(data, '{guests,g01,look,secretNote}', '"SECRET_IN_LOOK"') where slug = 'testslug01';
  j := public.public_plan('testslug01');
  -- first taken seat of the first table, in the saved plan and on the guest page
  select data->'guests'->(s #>> '{}'), (si - 1)::int into g, i
    from public.events, jsonb_array_elements(data->'tables'->0->'seats') with ordinality z(s, si)
   where slug = 'testslug01' and jsonb_typeof(s) = 'string' order by si limit 1;
  first_seat := j->'tables'->0->'seats'->i;
  assert g is not null, 'fixture has no seated guest';
  assert first_seat->'look'->>'hair' = g->'look'->>'hair' and first_seat->'look'->>'outfit' = g->'look'->>'outfit'
     and first_seat->'look'->>'skin' = g->'look'->>'skin', 'drawing differs from the saved one';
  assert j::text not like '%SECRET_IN_LOOK%' and j::text not like '%secretNote%', 'stray look field leaked';
  assert j::text not like '%ლაშა%', 'name leaked';
  raise notice 'ok 12 seated guests keep their drawings on the guest page, nothing else';
end $$;
