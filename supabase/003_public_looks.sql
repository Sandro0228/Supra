-- Supra migration 003: the guest page shows each seated guest's drawing (no names).
-- Safe to run more than once; changes only the public_plan function. No data is changed.
--
-- Each seat is now false (empty) or {"look": {...}, "kid": bool}. The look is rebuilt key by key from the
-- drawing settings only, so nothing else stored on a guest (name, meal, allergies, group, notes) can slip through.
create or replace function public.public_plan(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare e record; tbl jsonb; ven jsonb;
begin
  select data, lookup_mode, lookup_pin_hash is not null as pin into e
    from public.events where slug = p_slug and guest_page;
  if not found then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', t->'name', 'shape', t->'shape', 'deco', t->'deco',
           'x', t->'x', 'y', t->'y', 'rot', t->'rot',
           'seats', (select coalesce(jsonb_agg(
                       case when g is null then 'false'::jsonb
                            else jsonb_build_object(
                              'look', jsonb_strip_nulls(jsonb_build_object(
                                 'kind', g->'look'->'kind', 'skin', g->'look'->'skin', 'hair', g->'look'->'hair',
                                 'hairColor', g->'look'->'hairColor', 'beard', g->'look'->'beard', 'beardColor', g->'look'->'beardColor',
                                 'eye', g->'look'->'eye', 'outfit', g->'look'->'outfit', 'outfitColor', g->'look'->'outfitColor',
                                 'glasses', g->'look'->'glasses')),
                              'kid', coalesce((g->>'kid')::boolean, false)) end
                       order by si), '[]'::jsonb)
                       from jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) with ordinality as z(s, si)
                       left join lateral (select case when jsonb_typeof(s) = 'string' then e.data->'guests'->(s #>> '{}') end as g) gg on true))
         order by ti), '[]'::jsonb)
    into tbl
    from jsonb_array_elements(coalesce(e.data->'tables', '[]'::jsonb)) with ordinality as x(t, ti);

  select coalesce(jsonb_agg(jsonb_build_object(
           'type', v->'type', 'label', v->'label', 'x', v->'x', 'y', v->'y', 'w', v->'w', 'h', v->'h', 'rot', v->'rot')), '[]'::jsonb)
    into ven
    from jsonb_array_elements(coalesce(e.data->'venue', '[]'::jsonb)) v;

  return jsonb_build_object(
    'event',  jsonb_build_object('name', e.data#>'{event,name}', 'date', e.data#>'{event,date}',
                                 'palette', e.data#>'{event,palette}', 'lang', e.data#>'{event,lang}', 'type', e.data#>'{event,type}'),
    'tables', tbl,
    'venue',  ven,
    'lookup', jsonb_build_object('mode', e.lookup_mode, 'pin', e.pin));
end $$;
revoke all on function public.public_plan(text) from public;
grant execute on function public.public_plan(text) to anon, authenticated;
