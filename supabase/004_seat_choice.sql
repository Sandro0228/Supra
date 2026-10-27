-- Supra migration 004: the organiser can let guests choose their own seat at their table.
-- Safe to run more than once; replaces two functions, changes no data.
--
-- The choice is saved with the plan (event.seatMode = 'seat' | 'table'; missing means 'seat', as before).
-- In 'table' mode the guest page learns only each guest's table: find_seat returns no seat number and
-- public_plan marks seats as taken (true) without drawings, so no one appears to own a particular chair.

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
    'lookup', jsonb_build_object('mode', e.lookup_mode, 'pin', e.pin, 'seatMode', case when tbl_only then 'table' else 'seat' end));
end $$;
revoke all on function public.public_plan(text) from public;
grant execute on function public.public_plan(text) to anon, authenticated;

-- Seat search for guests. Returns {status, matches[]}.
-- status: ok | short (fewer than 3 letters) | many (more than 5 matches) | pin (PIN missing/wrong)
--         | rate_limited | not_found (no such guest page)
-- Each match: name, look (drawing), kid, table (position), tableName, seat; mates only if the owner enabled it.
-- When the organiser lets guests pick their own seat (event.seatMode = 'table'), seat is null.
create or replace function public.find_seat(p_slug text, p_query text, p_pin text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  e record; q text; tbl_only boolean; q_swapped text; q_like text; who text; recent int; total int; n int; res jsonb;
begin
  q := public.supra_norm(p_query);
  if char_length(replace(q, ' ', '')) < 3 then
    return jsonb_build_object('status', 'short', 'matches', '[]'::jsonb);
  end if;

  select data, lookup_mode, lookup_pin_hash, show_tablemates into e
    from public.events where slug = p_slug and guest_page;
  if not found then return jsonb_build_object('status', 'not_found', 'matches', '[]'::jsonb); end if;

  -- Rate limit: 30 searches per visitor per 10 minutes, 1500 per guest page per hour.
  who := btrim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
  if who = '' then who := 'unknown'; end if;
  delete from public.seat_lookups where at < now() - interval '1 day';
  select count(*) into recent from public.seat_lookups where slug = p_slug and client = who and at > now() - interval '10 minutes';
  select count(*) into total  from public.seat_lookups where slug = p_slug and at > now() - interval '1 hour';
  if recent >= 30 or total >= 1500 then
    return jsonb_build_object('status', 'rate_limited', 'matches', '[]'::jsonb);
  end if;
  insert into public.seat_lookups (slug, client) values (p_slug, who);

  if e.lookup_pin_hash is not null and (p_pin is null or crypt(btrim(p_pin), e.lookup_pin_hash) <> e.lookup_pin_hash) then
    return jsonb_build_object('status', 'pin', 'matches', '[]'::jsonb);
  end if;

  tbl_only := coalesce(e.data#>>'{event,seatMode}', 'seat') = 'table';
  q_swapped := regexp_replace(q, '^(\S+) (.+)$', '\2 \1');
  q_like := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');

  create temporary table if not exists _supra_seated (tidx int, tname text, sidx int, gu jsonb, nn text) on commit drop;
  truncate _supra_seated;
  insert into _supra_seated
    select (ti - 1)::int, t->>'name', (si - 1)::int, e.data->'guests'->(s #>> '{}'), public.supra_norm(e.data->'guests'->(s #>> '{}')->>'name')
      from jsonb_array_elements(coalesce(e.data->'tables', '[]'::jsonb)) with ordinality as x(t, ti),
           jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) with ordinality as z(s, si)
     where jsonb_typeof(s) = 'string' and e.data->'guests'->(s #>> '{}') is not null;

  select count(*) into n from _supra_seated
   where case when e.lookup_mode = 'exact' then nn = q or nn = q_swapped
              else nn like q_like || '%' or nn like '% ' || q_like || '%' end;
  if n > 5 then return jsonb_build_object('status', 'many', 'matches', '[]'::jsonb); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', m.gu->>'name', 'look', m.gu->'look', 'kid', coalesce((m.gu->>'kid')::boolean, false),
           'table', m.tidx, 'tableName', m.tname, 'seat', case when tbl_only then null else m.sidx + 1 end,
           'mates', case when e.show_tablemates then
                      (select coalesce(jsonb_agg(o.gu->>'name' order by case when tbl_only then o.gu->>'name' end, o.sidx), '[]'::jsonb)
                         from _supra_seated o where o.tidx = m.tidx and o.sidx <> m.sidx)
                    else null end)
         order by m.nn, m.tidx), '[]'::jsonb)
    into res
    from _supra_seated m
   where case when e.lookup_mode = 'exact' then m.nn = q or m.nn = q_swapped
              else m.nn like q_like || '%' or m.nn like '% ' || q_like || '%' end;

  return jsonb_build_object('status', 'ok', 'matches', res);
end $$;
revoke all on function public.find_seat(text, text, text) from public;
grant execute on function public.find_seat(text, text, text) to anon, authenticated;

