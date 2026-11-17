-- Migration 008: RSVP invitations, guest answers, deadline, privacy and authorization. Fixture data only.
\set ON_ERROR_STOP on
-- Owner 1111… owns event aaaa…01 (fixture plan: g01 ლაშა ბერიძე, g09 თეონა ბერიძე, g06 has SECRET_* fields).
create temp table t (k text primary key, v text);
grant select, insert, update on t to anon, authenticated;

-- A. The owner creates invitations; the server picks the token whatever the client sends.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.invites (event_id, token, name, members, extra_allowed, phone, email, lang)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'chosen', 'Beridze family', array['g01', 'g09', 'g01', ''], 1,
        '+995555123456', 'beridze@example.com', 'ka');
insert into public.invites (event_id, name, members, phone) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Tabatadze', array['g06'], '+995599000000');
insert into t select 'beridze', token from public.invites where name = 'Beridze family';
insert into t select 'tab', token from public.invites where name = 'Tabatadze';
do $$ declare r public.invites; begin
  select * into r from public.invites where name = 'Beridze family';
  assert r.token <> 'chosen' and char_length(r.token) = 22 and r.token ~ '^[A-Za-z0-9_-]+$', 'token not server-made: ' || r.token;
  assert r.state = 'pending' and r.coming_count = 0 and r.answer is null and r.answered_at is null, 'new invite not pending';
  assert r.members = array['g01', 'g09'] or r.members = array['g09', 'g01'], 'members not cleaned: ' || r.members::text;
  raise notice 'ok A invitations get a server-made 128-bit link';
end $$;
reset role;

-- B. The guest sees only their own household: names and drawings, event details, no contacts or private fields.
update public.events set starts_at = now() + interval '30 days', venue_name = 'Restaurant Iveria',
       venue_map_url = 'https://maps.example/iveria' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role anon;
do $$ declare j jsonb; s text; begin
  j := public.rsvp_get((select v from t where k = 'beridze'));
  s := j::text;
  assert j->>'status' = 'ok' and not (j->>'closed')::boolean, 'not open: ' || s;
  assert j->'event'->>'venue' = 'Restaurant Iveria' and j->'event' ? 'startsAt' and j->'event'->>'name' = 'Nino & Giorgi', 'event details: ' || s;
  assert jsonb_array_length(j->'invite'->'members') = 2, 'two members expected';
  assert s like '%ლაშა ბერიძე%' and s like '%თეონა ბერიძე%', 'member names missing';
  assert s not like '%ნინო%' and s not like '%Neighbour%' and s not like '%მარიამ%', 'another guest leaked';
  assert s not like '%+995%' and s not like '%example.com%' and s not like '%SECRET%', 'contact or private data leaked';
  assert s not like '%aaaaaaaa%' and s not like '%1111111%' and s not like '%"owner"%', 'event or owner id leaked';
  assert (select array_agg(k order by k) from jsonb_object_keys(j->'invite'->'members'->0) k) = array['id','kid','look','name'], 'member fields';
  j := public.rsvp_get((select v from t where k = 'tab'));
  assert j::text not like '%SECRET%' and j::text not like '%fish%', 'private plan fields leaked to own household';
  assert public.rsvp_get('nope')->>'status' = 'unavailable' and public.rsvp_get(null)->>'status' = 'unavailable', 'unknown token';
  raise notice 'ok B guests see only their household';
end $$;

-- C. Answering: per-member yes/no and meals, extras, allergies, message; counts and log follow.
do $$ declare j jsonb; begin
  j := public.rsvp_answer((select v from t where k = 'beridze'), '{"members":{"g01":{"coming":true,"meal":"meat"},
        "g09":{"coming":true,"meal":"fish"},"g06":{"coming":true}},"extras":[{"name":"  Nika   B. ","meal":"kids"}],
        "allergies":"nuts","message":"Congratulations!"}');
  assert j->>'status' = 'ok', 'answer failed: ' || j::text;
  assert j->'invite'->'answer'->'members' ? 'g01' and not j->'invite'->'answer'->'members' ? 'g06', 'non-member kept';
  assert j->'invite'->'answer'->'extras'->0->>'name' = 'Nika B.', 'extra name not tidied';
  assert j->'invite' ? 'answeredAt', 'answeredAt missing';
end $$;
reset role;
do $$ declare r public.invites; begin
  select * into r from public.invites where name = 'Beridze family';
  assert r.state = 'coming' and r.coming_count = 3, 'expected 3 coming, got ' || r.coming_count;
  assert (select count(*) from public.invite_log where invite_id = r.id and by = 'guest' and state_before = 'pending' and coming_after = 3) = 1, 'log row';
  raise notice 'ok C answers count members and extras and are logged';
end $$;

-- D. Invalid answers are refused and change nothing.
set role anon;
do $$ declare tok text := (select v from t where k = 'beridze'); bad jsonb; begin
  foreach bad in array array[
    '{"members":{"g01":{"coming":true}}}',                                                -- g09 missing
    '{"members":{"g01":{"coming":"yes"},"g09":{"coming":true}}}',                         -- not a boolean
    '{"members":{"g01":{"coming":true,"meal":"pizza"},"g09":{"coming":true}}}',           -- unknown meal
    '{"members":{"g01":{"coming":true},"g09":{"coming":true}},"extras":[{"name":"A"},{"name":"B"}]}', -- over the limit
    '{"members":{"g01":{"coming":true},"g09":{"coming":true}},"extras":[{"name":"   "}]}',              -- empty name
    '"text"']::jsonb[] loop
    begin perform public.rsvp_answer(tok, bad); raise exception 'accepted: %', bad;
    exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.rsvp_answer(tok, jsonb_build_object('members', '{"g01":{"coming":true},"g09":{"coming":true}}'::jsonb,
                                                           'message', repeat('x', 1001)));
        raise exception 'long message accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
  assert (select coming_count from public.invites where name = 'Beridze family') = 3, 'refused answer changed the invite';
  raise notice 'ok D invalid answers are refused';
end $$;

-- E. Changing your mind: not coming now, then coming again. Each change is logged.
set role anon;
do $$ declare j jsonb; tok text := (select v from t where k = 'beridze'); begin
  j := public.rsvp_answer(tok, '{"members":{"g01":{"coming":false,"meal":"meat"},"g09":{"coming":false}},"message":"Sorry"}');
  assert j->'invite'->'answer'->'members'->'g01'->>'meal' = '', 'meal kept for someone not coming';
  j := public.rsvp_answer(tok, '{"members":{"g01":{"coming":true},"g09":{"coming":false}}}');
  assert j->>'status' = 'ok';
end $$;
reset role;
do $$ declare iid uuid := (select i.id from public.invites i where i.name = 'Beridze family'); begin
  assert (select state || coming_count from public.invites i where i.id = iid) = 'coming1', 'final state';
  assert (select string_agg(state_after || coming_after, ',' order by l.id) from public.invite_log l where l.invite_id = iid) = 'coming3,declined0,coming1',
    'log: ' || (select string_agg(state_after || coming_after, ',' order by l.id) from public.invite_log l where l.invite_id = iid);
  raise notice 'ok E guests can change their mind and every change is logged';
end $$;

-- F. Deadline: 24 h before the start by default, movable, can be switched off; closing by hand.
update public.events set starts_at = now() + interval '23 hours' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role anon;
do $$ declare j jsonb; tok text := (select v from t where k = 'beridze'); begin
  j := public.rsvp_get(tok);
  assert (j->>'closed')::boolean, 'should close 24 h before the start';
  j := public.rsvp_answer(tok, '{"members":{"g01":{"coming":false},"g09":{"coming":false}}}');
  assert j->>'status' = 'closed' and j->'invite'->'answer'->'members'->'g01'->>'coming' = 'true', 'closed answer changed: ' || j::text;
end $$;
reset role;
update public.events set rsvp_no_deadline = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role anon;
do $$ begin assert not (public.rsvp_get((select v from t where k = 'beridze'))->>'closed')::boolean, 'no-deadline should be open'; end $$;
reset role;
update public.events set rsvp_no_deadline = false, rsvp_deadline = now() + interval '1 hour' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role anon;
do $$ begin assert public.rsvp_answer((select v from t where k = 'beridze'), '{"members":{"g01":{"coming":true},"g09":{"coming":true}}}')->>'status' = 'ok', 'custom deadline should be open'; end $$;
reset role;
update public.events set rsvp_open = false where id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role anon;
do $$ begin assert public.rsvp_answer((select v from t where k = 'beridze'), '{"members":{"g01":{"coming":false},"g09":{"coming":false}}}')->>'status' = 'closed', 'closed by hand'; end $$;
reset role;
update public.events set rsvp_open = true, rsvp_deadline = null, starts_at = now() + interval '30 days' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin raise notice 'ok F deadline enforced by the server, movable and switchable'; end $$;

-- G. Links: the owner can rotate (old link dies) or revoke; nobody can set a token by hand.
set role authenticated;
do $$ declare old text := (select v from t where k = 'beridze'); nw text; begin
  begin update public.invites set token = 'mine' where name = 'Beridze family'; raise exception 'token changed by hand';
  exception when insufficient_privilege then null; end;
  nw := public.rotate_invite_link((select id from public.invites where name = 'Beridze family'));
  assert nw <> old and char_length(nw) = 22, 'rotate';
  assert public.rsvp_get(old)->>'status' = 'unavailable' and public.rsvp_get(nw)->>'status' = 'ok', 'old link still works';
  update t set v = nw where k = 'beridze';
  update public.invites set revoked = true where name = 'Tabatadze';
  assert public.rsvp_get((select v from t where k = 'tab'))->>'status' = 'unavailable', 'revoked link works';
  raise notice 'ok G rotate and revoke';
end $$;
reset role;

-- H. Other users and anonymous visitors cannot read or change invitations, logs or contacts.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$ begin
  assert (select count(*) from public.invites) = 0 and (select count(*) from public.invite_log) = 0, 'other user sees invites';
  update public.invites set phone = 'x'; delete from public.invites;
  begin insert into public.invites (event_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'intruder'); raise exception 'insert into foreign event';
  exception when insufficient_privilege then null; end;
  begin perform public.rotate_invite_link((select id from public.invites limit 1)); raise exception 'rotated foreign invite';
  exception when insufficient_privilege then null; end;
  begin perform public.clear_rsvp_contacts('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'cleared foreign contacts';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform 1 from public.invites; raise exception 'anon reads invites'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.invite_log; raise exception 'anon reads log'; exception when insufficient_privilege then null; end;
  begin perform public.rotate_invite_link(gen_random_uuid()); raise exception 'anon rotates'; exception when insufficient_privilege then null; end;
  begin perform public.supra_purge_rsvp_contacts(); raise exception 'anon purges'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.invites where phone like '+995%') = 2, 'another user changed contacts';
  raise notice 'ok H only the owner can see or change invitations';
end $$;

-- I. The couple edits a household: answers for removed members go, counts follow, logged as the couple's change.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
update public.invites set members = array['g01'] where name = 'Beridze family';
do $$ declare r public.invites; begin
  select * into r from public.invites where name = 'Beridze family';
  assert not r.answer->'members' ? 'g09' and r.coming_count = 1, 'removed member kept: ' || r.answer::text;
  update public.invites set answer = '{"members":{"g01":{"coming":false}}}' where id = r.id;   -- "Lasha phoned: can't come"
  assert (select state from public.invites where id = r.id) = 'declined', 'couple answer';
  assert (select by from public.invite_log where invite_id = r.id order by id desc limit 1) = 'couple', 'not logged as couple';
  raise notice 'ok I couple edits keep answers consistent';
end $$;
reset role;

-- J. Rate limit: at most 20 guest answers per invitation per hour.
set role anon;
do $$ declare tok text := (select v from t where k = 'beridze'); s text; n int := 0; begin
  for k in 1..25 loop
    s := public.rsvp_answer(tok, jsonb_build_object('members', jsonb_build_object('g01', jsonb_build_object('coming', k % 2 = 0))))->>'status';
    if s = 'rate_limited' then n := n + 1; end if;
  end loop;
  assert n >= 5, 'rate limit not applied: ' || n;
  raise notice 'ok J answers are rate-limited';
end $$;
reset role;

-- K. Contact details: the owner can clear them; the daily purge clears them 90 days after the event.
set role authenticated;
do $$ begin
  assert public.clear_rsvp_contacts('aaaaaaaa-0000-0000-0000-000000000001') = 2, 'clear count';
  assert (select count(*) from public.invites where phone is not null or email is not null) = 0, 'contacts left';
end $$;
reset role;
update public.invites set phone = '+995555000000';
update public.events set starts_at = now() - interval '91 days' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  assert public.supra_purge_rsvp_contacts() = 2, 'purge count';
  assert (select count(*) from public.invites where phone is not null) = 0, 'purge left contacts';
  raise notice 'ok K contact details are cleared on request and 90 days after the event';
end $$;
update public.events set starts_at = null where id = 'aaaaaaaa-0000-0000-0000-000000000001';
