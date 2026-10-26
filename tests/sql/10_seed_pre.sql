-- Supabase grants table access to both API roles and relies on row-level security; mirror that.
grant select, insert, update, delete on public.events to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.events (id, owner, name, slug, data, public_data)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Nino & Giorgi', 'testslug01',
        pg_read_file(:'fixture')::jsonb, '{"guests":{"x":{"name":"old copy"}}}');
