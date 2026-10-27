-- Supra migration 005: in "guests choose their seat" mode, the guest page shows each table's guests as
-- drawings standing beside the table (in name order, so the seat order stays private). No names are sent.
-- Safe to run more than once; replaces public_plan only, changes no data.

create or replace function public.public_plan(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare e record; tbl jsonb; ven jsonb; tbl_only boolean;
begin
  select data, lookup_mode, lookup_pin_hash is not null as pin into e
    from public.events where slug = p_slug and guest_page;
  if not found then return null; end if;
  tbl_only := coalesce(e.data#>>'{event,seatMode}', 'seat') = 'table';

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', t->'name', 'shape', t->'shape', 'deco', t->'deco',
           'x', t->'x', 'y', t->'y', 'rot', t->'rot',
           'seats', (select coalesce(jsonb_agg(
                       case when g is null then 'false'::jsonb
                            when tbl_only then 'true'::jsonb
                            else jsonb_build_object(
                              'look', jsonb_strip_nulls(jsonb_build_object(
                                 'kind', g->'look'->'kind', 'skin', g->'look'->'skin', 'hair', g->'look'->'hair',
                                 'hairColor', g->'look'->'hairColor', 'beard', g->'look'->'beard', 'beardColor', g->'look'->'beardColor',
                                 'eye', g->'look'->'eye', 'outfit', g->'look'->'outfit', 'outfitColor', g->'look'->'outfitColor',
                                 'glasses', g->'look'->'glasses')),
                              'kid', coalesce((g->>'kid')::boolean, false)) end
                       order by si), '[]'::jsonb)
                       from jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) with ordinality as z(s, si)
                       left join lateral (select case when jsonb_typeof(s) = 'string' then e.data->'guests'->(s #>> '{}') end as g) gg on true),
           -- table-only mode: the table's guests as drawings, in name order (never seat order), no names
           'people', case when tbl_only then (select coalesce(jsonb_agg(jsonb_build_object(
                              'look', jsonb_strip_nulls(jsonb_build_object(
                                 'kind', g->'look'->'kind', 'skin', g->'look'->'skin', 'hair', g->'look'->'hair',
                                 'hairColor', g->'look'->'hairColor', 'beard', g->'look'->'beard', 'beardColor', g->'look'->'beardColor',
                                 'eye', g->'look'->'eye', 'outfit', g->'look'->'outfit', 'outfitColor', g->'look'->'outfitColor',
                                 'glasses', g->'look'->'glasses')),
                              'kid', coalesce((g->>'kid')::boolean, false)) order by g->>'name'), '[]'::jsonb)
                       from jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) z(s)
                       join lateral (select e.data->'guests'->(s #>> '{}') as g) gg on true
                      where jsonb_typeof(s) = 'string' and g is not null) end)
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
    'lookup', jsonb_build_object('mode', e.lookup_mode, 'pin', e.pin, 'seatMode', case when tbl_only then 'table' else 'seat' end));
end $$;
revoke all on function public.public_plan(text) from public;
grant execute on function public.public_plan(text) to anon, authenticated;

