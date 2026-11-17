-- Migration 007: find guests whether they type their name in Georgian or Latin letters.
-- Run after 006_share_lifecycle.sql.
--
-- Guests often type Georgian names in Latin letters ("Nino", "Khatia", "Qetevan"), and foreign
-- guests cannot type Georgian at all. Both the guest's name and the query are reduced to one simple
-- Latin "skeleton" (supra_skel) and compared, in addition to the existing exact-script match:
--   ნინო / Nino → nino      ხატია / Khatia / Xatia → xatia      ქეთევან / Qetevan / Ketevan → ketevan
--   ჩხეიძე / Chkheidze → cxeize      შოთა / Shota → sota      ცოტნე / Tsotne / Cotne → cotne
-- The skeleton is used only when it has at least 3 letters, so short queries are no broader than before.
--
-- Rollback: re-run the supra_search section of 006_share_lifecycle.sql, then
--   drop function if exists public.supra_skel(text);

create or replace function public.supra_skel(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(                                              -- 4. "nn" → "n"
         replace(                                                     -- 3. leftover h is silent ("john" = "ჯონ")
         replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
         translate(                                                   -- 2. Latin spellings → one form
           regexp_replace(
             translate(public.supra_norm(t),                          -- 1. Georgian letters → Latin
               'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ',
               'abgdevztiklmnopjrstupkgkscczccxjh'),
             '[''`’ʼ]', '', 'g'),
           'qwy', 'kvi'),
           'kh', 'x'), 'gh', 'g'), 'sh', 's'), 'ch', 'c'), 'zh', 'j'),
           'tz', 'c'), 'ts', 'c'), 'dz', 'z'), 'ph', 'p'), 'th', 't'),
         'h', ''),
         '(.)\1+', '\1', 'g')
$$;

create or replace function public.supra_search(p_event uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare e record; q text; qs text; ql text; k text; ks text; kl text; use_k boolean; n int; res jsonb; tbl_only boolean;
begin
  q := public.supra_norm(p_query);
  if char_length(replace(q, ' ', '')) < 3 then return jsonb_build_object('status', 'short', 'matches', '[]'::jsonb); end if;
  select data, lookup_mode, show_tablemates into e from public.events where id = p_event;
  if not found then return jsonb_build_object('status', 'none', 'matches', '[]'::jsonb); end if;
  tbl_only := coalesce(e.data#>>'{event,seatMode}', 'seat') = 'table';
  qs := regexp_replace(q, '^(\S+) (.+)$', '\2 \1');
  ql := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  k := public.supra_skel(q);
  ks := regexp_replace(k, '^(\S+) (.+)$', '\2 \1');
  kl := replace(replace(replace(k, '\', '\\'), '%', '\%'), '_', '\_');
  use_k := char_length(replace(k, ' ', '')) >= 3;
  with seated as (
    select (ti - 1)::int as tidx, t->>'name' as tname, (si - 1)::int as sidx, e.data->'guests'->(s #>> '{}') as gu,
           public.supra_norm(e.data->'guests'->(s #>> '{}')->>'name') as nn,
           public.supra_skel(e.data->'guests'->(s #>> '{}')->>'name') as sk
      from jsonb_array_elements(coalesce(e.data->'tables', '[]'::jsonb)) with ordinality as x(t, ti),
           jsonb_array_elements(coalesce(t->'seats', '[]'::jsonb)) with ordinality as z(s, si)
     where jsonb_typeof(s) = 'string' and e.data->'guests'->(s #>> '{}') is not null),
  hit as (
    select * from seated
     where case when e.lookup_mode = 'exact' then nn = q or nn = qs or (use_k and (sk = k or sk = ks))
                else nn like ql || '%' or nn like '% ' || ql || '%'
                     or (use_k and (sk like kl || '%' or sk like '% ' || kl || '%')) end)
  select count(*), coalesce(jsonb_agg(jsonb_build_object(
           'name', h.gu->>'name', 'look', public.supra_look(h.gu)->'look', 'kid', coalesce((h.gu->>'kid')::boolean, false),
           'table', h.tidx, 'tableName', h.tname, 'seat', case when tbl_only then null else h.sidx + 1 end,
           'mates', case when e.show_tablemates then
                      (select coalesce(jsonb_agg(o.gu->>'name' order by case when tbl_only then o.gu->>'name' end, o.sidx), '[]'::jsonb)
                         from seated o where o.tidx = h.tidx and o.sidx <> h.sidx) end)
         order by h.nn, h.tidx), '[]'::jsonb)
    into n, res from hit h;
  if n = 0 then return jsonb_build_object('status', 'none', 'matches', '[]'::jsonb); end if;
  if n > 5 then return jsonb_build_object('status', 'many', 'matches', '[]'::jsonb); end if;
  return jsonb_build_object('status', 'ok', 'matches', res);
end $$;
revoke all on function public.supra_search(uuid, text) from public, anon, authenticated;
