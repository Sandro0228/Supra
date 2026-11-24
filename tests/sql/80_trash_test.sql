-- Migration 009: trash, restore, delete for good only from the trash, purge after 30 days. Fixture data only.
\set ON_ERROR_STOP on
create temp table tr (k text primary key, v text);
grant select, insert, update on tr to anon, authenticated;

-- Setup: owner 1111… creates a published event with an RSVP invitation.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.events (id, name, slug) values ('cccccccc-0000-0000-0000-000000000003', 'Trash test', 'x');
reset role;
update public.events set data = pg_read_file(:'fixture')::jsonb where id = 'cccccccc-0000-0000-0000-000000000003';
set role authenticated;
select public.publish_guest_page('cccccccc-0000-0000-0000-000000000003');
insert into public.invites (event_id, name, members) values ('cccccccc-0000-0000-0000-000000000003', 'Trash family', array['g01']);
insert into tr select 'slug', slug from public.events where id = 'cccccccc-0000-0000-0000-000000000003';
insert into tr select 'inv', token from public.invites where name = 'Trash family';
reset role;

-- A. A live event cannot be deleted for good, and the trash columns cannot be set by a direct update.
set role authenticated;
delete from public.events where id = 'cccccccc-0000-0000-0000-000000000003';
update public.events set deleted_at = now(), trash_share_status = 'x' where id = 'cccccccc-0000-0000-0000-000000000003';
reset role;
do $$ begin
  assert (select deleted_at is null and trash_share_status is null from public.events where id = 'cccccccc-0000-0000-0000-000000000003'),
    'trash state changed by a direct update (or the event was deleted)';
  raise notice 'ok A live events cannot be deleted; trash state only through the owner functions';
end $$;

-- B. Trashing: the guest page and the RSVP link stop answering, share functions refuse, the owner still sees it.
set role authenticated;
select public.trash_event('cccccccc-0000-0000-0000-000000000003');
reset role;
do $$ declare r public.events; begin
  select * into r from public.events where id = 'cccccccc-0000-0000-0000-000000000003';
  assert r.deleted_at is not null and r.trash_share_status = 'published' and r.share_status = 'draft' and not r.guest_page,
    'trash state: ' || r.share_status || ' / ' || coalesce(r.trash_share_status, 'null');
end $$;
set role anon;
do $$ begin
  assert public.public_plan((select v from tr where k = 'slug')) is null, 'trashed layout public';
  assert public.find_seat((select v from tr where k = 'slug'), 'ნინო კაპანაძე')->>'status' = 'unavailable', 'trashed event searchable';
  assert public.rsvp_get((select v from tr where k = 'inv'))->>'status' = 'unavailable', 'trashed RSVP readable';
  assert public.rsvp_answer((select v from tr where k = 'inv'), '{"members":{"g01":{"coming":true}}}')->>'status' = 'unavailable',
    'trashed RSVP answerable';
end $$;
reset role;
set role authenticated;
do $$ begin
  begin perform public.publish_guest_page('cccccccc-0000-0000-0000-000000000003'); raise exception 'published a trashed event';
  exception when insufficient_privilege then null; end;
  begin perform public.trash_event('cccccccc-0000-0000-0000-000000000003'); raise exception 'trashed twice';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.events where id = 'cccccccc-0000-0000-0000-000000000003') = 1, 'owner cannot see the trash';
  raise notice 'ok B trashed events are private and frozen for sharing';
end $$;
reset role;

-- C. Another user can neither trash, restore nor delete it.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set role authenticated;
do $$ begin
  begin perform public.restore_event('cccccccc-0000-0000-0000-000000000003'); raise exception 'other user restored';
  exception when insufficient_privilege then null; end;
  begin perform public.trash_event('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'other user trashed';
  exception when insufficient_privilege then null; end;
end $$;
delete from public.events where id = 'cccccccc-0000-0000-0000-000000000003';
reset role;
set role anon;
do $$ begin
  begin perform public.restore_event('cccccccc-0000-0000-0000-000000000003'); raise exception 'anon restored';
  exception when insufficient_privilege then null; end;
  begin perform public.supra_purge_trash(); raise exception 'anon purged';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.events where id = 'cccccccc-0000-0000-0000-000000000003' and deleted_at is not null) = 1, 'other user changed it';
  assert (select deleted_at is null from public.events where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'other user trashed an event';
  raise notice 'ok C only the owner can trash, restore or delete';
end $$;

-- D. Restoring brings the published guest page and the RSVP link back.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select public.restore_event('cccccccc-0000-0000-0000-000000000003');
reset role;
set role anon;
do $$ begin
  assert public.public_plan((select v from tr where k = 'slug')) is not null, 'restored page not public';
  assert public.rsvp_get((select v from tr where k = 'inv'))->>'status' = 'ok', 'restored RSVP not answering';
  raise notice 'ok D restore brings the guest page back';
end $$;
reset role;
do $$ begin
  assert (select deleted_at is null and trash_share_status is null and share_status = 'published'
            from public.events where id = 'cccccccc-0000-0000-0000-000000000003'), 'restore state';
end $$;

-- E. A draft stays a draft after a round trip through the trash.
set role authenticated;
select public.unpublish_guest_page('cccccccc-0000-0000-0000-000000000003');
select public.trash_event('cccccccc-0000-0000-0000-000000000003');
select public.restore_event('cccccccc-0000-0000-0000-000000000003');
reset role;
do $$ begin
  assert (select share_status from public.events where id = 'cccccccc-0000-0000-0000-000000000003') = 'draft', 'draft published by restore';
  raise notice 'ok E drafts stay drafts';
end $$;

-- F. Delete for good from the trash: the owner can; invitations go with the event.
set role authenticated;
select public.trash_event('cccccccc-0000-0000-0000-000000000003');
delete from public.events where id = 'cccccccc-0000-0000-0000-000000000003';
reset role;
do $$ begin
  assert (select count(*) from public.events where id = 'cccccccc-0000-0000-0000-000000000003') = 0, 'not deleted from the trash';
  assert (select count(*) from public.invites where event_id = 'cccccccc-0000-0000-0000-000000000003') = 0, 'invites left behind';
  raise notice 'ok F delete for good works only from the trash';
end $$;

-- G. The purge removes events trashed more than 30 days ago, and nothing else.
set role authenticated;
insert into public.events (id, name, slug) values ('dddddddd-0000-0000-0000-000000000004', 'Old', 'x'), ('eeeeeeee-0000-0000-0000-000000000005', 'Recent', 'x');
select public.trash_event('dddddddd-0000-0000-0000-000000000004');
select public.trash_event('eeeeeeee-0000-0000-0000-000000000005');
reset role;
select set_config('supra.owner_fn', 'on', false);
update public.events set deleted_at = now() - interval '31 days' where id = 'dddddddd-0000-0000-0000-000000000004';
select set_config('supra.owner_fn', '', false);
do $$ declare live int := (select count(*) from public.events where deleted_at is null); begin
  assert public.supra_purge_trash() = 1, 'purge count';
  assert (select count(*) from public.events where id = 'dddddddd-0000-0000-0000-000000000004') = 0, 'old trash kept';
  assert (select count(*) from public.events where id = 'eeeeeeee-0000-0000-0000-000000000005') = 1, 'recent trash purged';
  assert (select count(*) from public.events where deleted_at is null) = live, 'purge removed a live event';
  raise notice 'ok G trash is emptied after 30 days';
end $$;
