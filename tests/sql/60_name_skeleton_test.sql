-- Migration 007: guests are found whether they type their name in Georgian or Latin letters.
\set ON_ERROR_STOP on

-- A. Georgian and Latin spellings reduce to the same form.
do $$ begin
  assert public.supra_skel('ნინო') = 'nino', public.supra_skel('ნინო');
  assert public.supra_skel('ხატია') = public.supra_skel('Khatia') and public.supra_skel('Xatia') = public.supra_skel('Khatia'), 'kh/x';
  assert public.supra_skel('ქეთევან ლორთქიფანიძე') = public.supra_skel('Qetevan Lortkipanidze'), 'q/k, dz';
  assert public.supra_skel('ქეთევან') = public.supra_skel('Ketevan'), 'k';
  assert public.supra_skel('მარიამ ჩხეიძე') = 'mariam cxeize', public.supra_skel('მარიამ ჩხეიძე');
  assert public.supra_skel('მარიამ ჩხეიძე') = public.supra_skel('  MARIAM   Chkheidze '), 'case and spaces';
  assert public.supra_skel('ზურაბ მაჭავარიანი') = public.supra_skel('Zurab Machavariani'), 'ch';
  assert public.supra_skel('ირაკლი წერეთელი') = public.supra_skel('Irakli Tsereteli'), 'ts';
  assert public.supra_skel('ცოტნე') = public.supra_skel('Cotne'), 'c';
  assert public.supra_skel('ღვინიაშვილი') = public.supra_skel('Ghviniashvili'), 'gh, sh';
  assert public.supra_skel('ჟანა') = public.supra_skel('Zhana'), 'zh';
  assert public.supra_skel('დავით ქავთარაძე') = public.supra_skel('Davit K''avtaradze'), 'apostrophe';
  assert public.supra_skel('ჯონ') = public.supra_skel('John'), 'silent h';
  assert public.supra_skel(null) = '', 'null';
  raise notice 'ok A Georgian and Latin spellings match';
end $$;

-- B. Prefix mode: Latin queries find Georgian names, with the same approved fields only.
do $$
declare ev uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r jsonb; m jsonb;
begin
  update public.events set lookup_mode = 'prefix', show_tablemates = false where id = ev;
  r := public.supra_search(ev, 'Ketevan');
  assert r->>'status' = 'ok' and jsonb_array_length(r->'matches') = 1, 'Ketevan: ' || r::text;
  m := r->'matches'->0;
  assert m->>'name' = 'ქეთევან ლორთქიფანიძე', 'wrong guest ' || m::text;
  assert (select array_agg(k order by k) from jsonb_object_keys(m) k) = array['kid','look','mates','name','seat','table','tableName'], 'unexpected fields ' || m::text;
  assert r::text not like '%SECRET%' and r::text not like '%"meal"%', 'private field leaked';
  assert jsonb_array_length(public.supra_search(ev, 'Lortkipanidze')->'matches') = 1, 'surname in Latin';
  assert jsonb_array_length(public.supra_search(ev, 'Gelashvili')->'matches') = 2, 'two Gelashvilis';
  assert jsonb_array_length(public.supra_search(ev, 'Mariam')->'matches') = 4, 'four Mariams';
  assert public.supra_search(ev, 'Chkheidze')->'matches'->0->>'name' = 'მარიამ ჩხეიძე', 'Chkheidze';
  assert public.supra_search(ev, 'Nino')->'matches'->0->>'name' = 'ნინო კაპანაძე', 'Nino';
  -- the Georgian query still works, and Latin names are still found as before
  assert jsonb_array_length(public.supra_search(ev, 'ქეთევან')->'matches') = 1, 'Georgian query';
  assert public.supra_search(ev, 'Neighbour')->>'status' = 'many', 'Latin names';
  raise notice 'ok B prefix mode finds Georgian names typed in Latin';
end $$;

-- C. A skeleton shorter than 3 letters is not used, so short queries are no broader than before.
do $$
declare ev uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
begin
  assert public.supra_skel('Sha') = 'sa';
  assert public.supra_search(ev, 'Sha')->>'status' = 'none', 'Sha must not match ლაშა/შ… by a 2-letter skeleton';
  assert public.supra_search(ev, 'xx')->>'status' = 'short';
  raise notice 'ok C short skeletons are ignored';
end $$;

-- D. Exact mode: the full name in Latin letters, either order; a first name alone is not enough.
do $$
declare ev uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; r jsonb;
begin
  update public.events set lookup_mode = 'exact' where id = ev;
  r := public.supra_search(ev, 'Luka Janashia');
  assert r->>'status' = 'ok' and r->'matches'->0->>'name' = 'ლუკა ჯანაშია', 'exact Latin: ' || r::text;
  assert public.supra_search(ev, 'Janashia Luka')->>'status' = 'ok', 'surname first';
  assert public.supra_search(ev, 'Luka')->>'status' = 'none', 'first name alone must not match in exact mode';
  assert public.supra_search(ev, 'Luka Janash')->>'status' = 'none', 'partial must not match in exact mode';
  update public.events set lookup_mode = 'prefix' where id = ev;
  raise notice 'ok D exact mode accepts the full Latin name only';
end $$;

-- E. Visitors cannot call the internal search directly.
do $$ begin
  assert not has_function_privilege('anon', 'public.supra_search(uuid, text)', 'execute'), 'anon can call supra_search';
  raise notice 'ok E supra_search stays internal';
end $$;
