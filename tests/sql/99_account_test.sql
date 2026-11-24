-- Migration 012: a user deletes their own account and everything that belongs to it; payment records stay, unlinked.
\set ON_ERROR_STOP on
insert into auth.users values ('33333333-3333-3333-3333-333333333333');
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set role authenticated;
insert into public.events (id, name, slug, data) values ('34343434-0000-0000-0000-000000000008', 'Leaving', 'x', '{"tables":[],"guests":{"a":{"name":"A"}}}');
insert into public.invites (event_id, name, members) values ('34343434-0000-0000-0000-000000000008', 'Family', array['a']);
reset role;
select public.supra_grant_pass('34343434-0000-0000-0000-000000000008', 'tbc', 'tbc-leaving', 79);

-- A. Nobody else can delete an account: anonymous visitors can't call it; another user deletes only themselves.
set role anon;
do $$ begin
  begin perform public.delete_my_account(); raise exception 'anon deleted an account';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from auth.users where id = '33333333-3333-3333-3333-333333333333') = 1, 'account gone early';
  raise notice 'ok A only the signed-in user can delete their own account';
end $$;

-- B. Deleting: the account, its events, invitations and logs go; others' data stays; the payment record stays, unlinked.
create temp table before as select (select count(*) from public.events) as ev, (select count(*) from auth.users) as us;
set role authenticated;
select public.delete_my_account();
reset role;
do $$ begin
  assert (select count(*) from auth.users where id = '33333333-3333-3333-3333-333333333333') = 0, 'account kept';
  assert (select count(*) from public.events where id = '34343434-0000-0000-0000-000000000008') = 0, 'event kept';
  assert (select count(*) from public.invites where event_id = '34343434-0000-0000-0000-000000000008') = 0, 'invites kept';
  assert (select count(*) from public.invite_log where event_id = '34343434-0000-0000-0000-000000000008') = 0, 'invite log kept';
  assert (select count(*) from public.events) = (select ev from before) - 1, 'other events deleted';
  assert (select count(*) from auth.users) = (select us from before) - 1, 'other accounts deleted';
  assert (select owner is null and event_id is null and amount_gel = 79 from public.entitlements where payment_ref = 'tbc-leaving'),
    'payment record not kept or still linked';
  raise notice 'ok B the account and its events go; payment records stay without the person';
end $$;
