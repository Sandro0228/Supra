-- Migration 006: link lifecycle, presets, preview, backoff, telemetry, authorization. Fixture data only.
\set ON_ERROR_STOP on
grant select, insert, update, delete on public.events to anon, authenticated;
truncate public.seat_lookups;
set request.headers = '{"x-forwarded-for":"192.0.2.50"}';

-- A. Existing events were backfilled so their links keep working.
do $$ begin
  assert (select share_status from public.events where slug = 'testslug01') in ('published', 'draft'), 'backfill missing';
  assert (select show_layout from public.events where slug = 'testslug01'), 'existing events keep their layout';
  assert (select count(*) from public.share_links where event_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1, 'history not seeded';
  raise notice 'ok A existing events backfilled';
end $$;

-- B. New event created by the owner through the API: server token, draft, Balanced.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.events (id, name, slug, guest_page, lookup_mode, show_tablemates)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'New wedding', 'weak', true, 'prefix', true);
reset role;
update public.events set data = pg_read_file(:'fixture')::jsonb where id = 'bbbbbbbb-0000-0000-0000-000000000002';
create temp table tok as select slug as s from public.events where id = 'bbbbbbbb-0000-0000-0000-000000000002';
grant select, update on tok to anon, authenticated;
do $$ declare r record; begin
  select * into r from public.events where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert r.slug <> 'weak' and char_length(r.slug) = 22 and r.slug ~ '^[A-Za-z0-9_-]+$', 'token not server-generated: ' || r.slug;
  assert r.share_status = 'draft' and not r.guest_page, 'new event published';
  assert r.lookup_mode = 'exact' and not r.show_tablemates and not r.show_layout, 'not the Balanced preset';
  assert public.public_plan(r.slug) is null, 'draft layout visible';
  assert public.find_seat(r.slug, 'ნინო კაპანაძე')->>'status' = 'unavailable', 'draft searchable';
  raise notice 'ok B new events are private drafts with a 128-bit link';
end $$;

-- C. The owner cannot weaken the link or publish around the rules with a direct update.
set role authenticated;
do $$ begin
  begin update public.events set slug = 'chosen' where id = 'bbbbbbbb-0000-0000-0000-000000000002'; raise exception 'slug changed';
  exception when insufficient_privilege then null; end;
  begin update public.events set lookup_pin_hash = 'x' where id = 'bbbbbbbb-0000-0000-0000-000000000002'; raise exception 'hash changed';
  exception when insufficient_privilege then null; end;
  update public.events set share_status = 'published', guest_page = true where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert (select share_status from public.events where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'draft', 'published by direct update';
  raise notice 'ok C token, code and publish state only change through the owner functions';
end $$;

-- D. Organiser preview while still a draft = exactly what will be public.
do $$ declare pv jsonb; s text := (select s from tok); begin
  pv := public.preview_public_plan('bbbbbbbb-0000-0000-0000-000000000002');
  assert pv is not null and not pv ? 'tables' and (pv->'lookup'->>'layout')::boolean = false, 'preview shows layout while layout is off';
  assert public.preview_find_seat('bbbbbbbb-0000-0000-0000-000000000002', 'ნინო კაპანაძე')->>'status' = 'ok', 'preview search';
  perform public.publish_guest_page('bbbbbbbb-0000-0000-0000-000000000002');
  assert public.public_plan(s) = pv, 'public payload differs from the preview';
  raise notice 'ok D preview equals the public payload';
end $$;
reset role;

-- E. Balanced search: full name in either order only; every non-match answers the same way.
do $$ declare s text := (select s from tok); a jsonb; b jsonb; c jsonb; begin
  assert public.find_seat(s, 'ნინო კაპანაძე')->>'status' = 'ok', 'full name';
  assert public.find_seat(s, 'კაპანაძე ნინო')->>'status' = 'ok', 'surname first';
  a := public.find_seat(s, 'ნინო');                 -- partial
  b := public.find_seat(s, 'ზზზზზზ ზზზზ');          -- unknown
  c := public.find_seat(s, 'Waiting Person');       -- invited but unseated
  assert a = b and b = c and a->>'status' = 'none', 'non-matches differ: ' || a || b || c;
  assert coalesce(public.find_seat(s, 'ნინო კაპანაძე')->'matches'->0->'mates', 'null') = 'null'::jsonb, 'tablemates shown in Balanced';
  raise notice 'ok E exact match, generic no-match';
end $$;

-- F. Near-constant response time for found and not found.
do $$ declare s text := (select s from tok); t timestamptz; d1 numeric; d2 numeric; begin
  truncate public.seat_lookups;
  t := clock_timestamp(); perform public.find_seat(s, 'ნინო კაპანაძე'); d1 := extract(epoch from clock_timestamp() - t);
  t := clock_timestamp(); perform public.find_seat(s, 'ზზზზზზ ზზზზ'); d2 := extract(epoch from clock_timestamp() - t);
  assert d1 >= 0.25 and d2 >= 0.25 and abs(d1 - d2) < 0.1, format('timing differs: %s vs %s', d1, d2);
  raise notice 'ok F response time does not reveal a match';
end $$;

-- G. Backoff: eight misses, then a growing wait; another visitor is unaffected; telemetry holds counts only.
do $$ declare s text := (select s from tok); r jsonb; i int; begin
  truncate public.seat_lookups;
  for i in 1..8 loop assert public.find_seat(s, 'ზზზზზ ' || i)->>'status' = 'none'; end loop;
  r := public.find_seat(s, 'ნინო კაპანაძე');
  assert r->>'status' = 'rate_limited' and (r->>'retry_after')::int between 1 and 10, 'no backoff: ' || r;
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.77"}', false);
  assert public.find_seat(s, 'ნინო კაპანაძე')->>'status' = 'ok', 'other visitor blocked';
  assert not exists (select 1 from public.seat_lookups where client like '%192.0.2%' or char_length(client) <> 64), 'raw IP stored';
  assert (select array_agg(column_name::text order by column_name) from information_schema.columns
           where table_schema = 'public' and table_name = 'lookup_stats') = array['event_id','hour','n','outcome'], 'telemetry columns';
  assert (select sum(n) from public.lookup_stats where event_id = 'bbbbbbbb-0000-0000-0000-000000000002' and outcome = 'none') >= 5, 'misses not counted';
  perform set_config('request.headers', '{"x-forwarded-for":"192.0.2.50"}', false);
  raise notice 'ok G backoff and counts-only telemetry';
end $$;

-- H. Strict preset needs a code; wrong or missing code gets the code status and counts as a miss.
set role authenticated;
do $$ declare s text := (select s from tok); begin
  begin perform public.apply_privacy_preset('bbbbbbbb-0000-0000-0000-000000000002', 'strict'); raise exception 'strict without code';
  exception when invalid_parameter_value then null; end;
  perform public.apply_privacy_preset('bbbbbbbb-0000-0000-0000-000000000002', 'strict', '7319');
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.80"}', false);
  assert public.find_seat(s, 'ნინო კაპანაძე')->>'status' = 'pin', 'no code accepted';
  assert public.find_seat(s, 'ნინო კაპანაძე', '0000')->>'status' = 'pin', 'wrong code accepted';
  assert public.find_seat(s, 'ნინო კაპანაძე', '7319')->>'status' = 'ok', 'right code refused';
  raise notice 'ok H strict preset and invitation code';
end $$;

-- I. Open preset: start of name, tablemates and layout.
do $$ declare s text := (select s from tok); r jsonb; begin
  perform public.apply_privacy_preset('bbbbbbbb-0000-0000-0000-000000000002', 'open');
  perform public.set_guest_lookup('bbbbbbbb-0000-0000-0000-000000000002', 'prefix', '', null);
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.81"}', false);
  r := public.find_seat(s, 'ნინო');
  assert r->>'status' = 'ok' and jsonb_array_length(r->'matches'->0->'mates') > 0, 'open search';
  assert public.public_plan(s) ? 'tables', 'open shows layout';
  raise notice 'ok I open preset';
end $$;

-- J. Expiry, revoke and rotate.
do $$ declare s text := (select s from tok); n text; begin
  perform public.publish_guest_page('bbbbbbbb-0000-0000-0000-000000000002', now() + interval '1 day');
  assert public.public_plan(s) is not null, 'not live before expiry';
  begin perform public.publish_guest_page('bbbbbbbb-0000-0000-0000-000000000002', now() - interval '1 minute'); raise exception 'past expiry accepted';
  exception when invalid_parameter_value then null; end;
  perform public.revoke_guest_link('bbbbbbbb-0000-0000-0000-000000000002');
  assert public.public_plan(s) is null and public.find_seat(s, 'ნინო')->>'status' = 'unavailable', 'revoked link works';
  begin perform public.publish_guest_page('bbbbbbbb-0000-0000-0000-000000000002'); raise exception 'revoked link republished';
  exception when invalid_parameter_value then null; end;
  n := public.rotate_guest_link('bbbbbbbb-0000-0000-0000-000000000002')->>'slug';
  assert n <> s and char_length(n) = 22, 'no new token';
  assert (public.supra_share_state('bbbbbbbb-0000-0000-0000-000000000002')->>'status') = 'draft', 'rotated revoked link not draft';
  perform public.publish_guest_page('bbbbbbbb-0000-0000-0000-000000000002');
  assert public.public_plan(n) is not null and public.public_plan(s) is null, 'old token still works after rotation';
  assert (select count(*) from public.share_links where event_id = 'bbbbbbbb-0000-0000-0000-000000000002' and retired_at is not null) >= 1, 'history';
  update tok set s = n;
  raise notice 'ok J expiry, revoke and rotate';
end $$;
reset role;
-- an expired link stops working
do $$ declare s text := (select s from tok); begin
  perform set_config('supra.owner_fn', 'on', true);
  update public.events set share_expires_at = now() - interval '1 second' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert public.public_plan(s) is null and public.find_seat(s, 'ნინო')->>'status' = 'unavailable', 'expired link works';
  perform set_config('supra.owner_fn', '', true);
  raise notice 'ok J2 expired link';
end $$;

-- K. Authorization: another user and anonymous visitors.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$ declare f text; begin
  foreach f in array array['publish_guest_page', 'unpublish_guest_page', 'revoke_guest_link', 'rotate_guest_link',
                           'preview_public_plan', 'preview_find_seat', 'apply_privacy_preset', 'set_guest_privacy'] loop
    begin
      execute case f when 'preview_find_seat' then format('select public.%s(%L, %L)', f, 'bbbbbbbb-0000-0000-0000-000000000002', 'ნინო კაპანაძე')
                     when 'apply_privacy_preset' then format('select public.%s(%L, %L)', f, 'bbbbbbbb-0000-0000-0000-000000000002', 'open')
                     when 'set_guest_privacy' then format('select public.%s(%L, %L, true, true)', f, 'bbbbbbbb-0000-0000-0000-000000000002', 'prefix')
                     else format('select public.%s(%L)', f, 'bbbbbbbb-0000-0000-0000-000000000002') end;
      raise exception 'other user ran %', f;
    exception when insufficient_privilege then null; end;
  end loop;
  assert (select count(*) from public.events where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'other user reads the event';
  assert (select count(*) from public.share_links where event_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'other user reads link history';
  assert (select count(*) from public.lookup_stats) = 0, 'other user reads stats';
  update public.events set name = 'hijacked' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise notice 'ok K1 other users blocked';
end $$;
reset role;
do $$ begin assert (select name from public.events where id = 'bbbbbbbb-0000-0000-0000-000000000002') = 'New wedding', 'other user renamed the event'; end $$;
set role anon;
do $$ begin
  begin perform public.preview_public_plan('bbbbbbbb-0000-0000-0000-000000000002'); raise exception 'anon preview';
  exception when insufficient_privilege then null; end;
  begin perform public.supra_plan_payload('bbbbbbbb-0000-0000-0000-000000000002'); raise exception 'anon payload';
  exception when insufficient_privilege then null; end;
  begin perform public.supra_search('bbbbbbbb-0000-0000-0000-000000000002', 'ნინო'); raise exception 'anon raw search';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from public.lookup_stats; raise exception 'anon stats';
  exception when insufficient_privilege then null; end;
  raise notice 'ok K2 anonymous visitors only get the public functions';
end $$;
reset role;
