-- Kate, 8 Oct 2026: Client Mix. How many different clients had colour, treatments, nails,
-- beauty or bought retail, how many units that came to, and which clients they were.
--
-- Everything is read from sales_transaction_lines (Phorest Sales Transactions, Jan 2025 on).
-- That table only holds the item NAME, so each item is sorted by Phorest's own Services
-- list (Manager > Services > Export all services), which gives every service a Category:
--
--   service_catalog   one row per Phorest service: name key, name, Phorest category
--                     (the four branches share one menu, 352 names, so one roster)
--   service_families  which family each Phorest category belongs to
--                     (colour, treat, cut, nails, beauty, retail, extensions, consult, other, skip)
--   item_classes()    every distinct sales item with its category and family: the catalog
--                     first (the whole name, then the part after any " - ", so package and
--                     combo lines follow their service; "(Treat) " is ignored), then name
--                     rules for retired names (the menu was renamed in Nov 2025) and
--                     products, else UNMAPPED, which the page shows so nothing disappears
--   client_mix_cards / client_mix_detail   the page's two reads, security invoker
--   service_roster / service_set_family / service_catalog_replace   the roster tab
--
-- A client is the lowercased, space-collapsed name (the same key Top Clients uses).
-- Walk-ins, refunds, negative lines, deposits, balance payments, vouchers and prepaid
-- courses are left out. item_classes(p_items) classes only the items named (the window's), because a
-- scan of the whole table under row-level security took 6s; no argument classes every item
-- (the roster tab). A unit is one sales line, except the second half of a keratin
-- ("... - Ironing"), which is the same treatment as its "... - Application" line and
-- counts 0.

create table if not exists public.service_catalog (
  name_key text primary key,
  service_name text not null,
  category text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.service_families (
  category text primary key,
  family text not null check (family in ('colour','treat','cut','nails','beauty','retail','extensions','consult','other','skip')),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.service_catalog enable row level security;
alter table public.service_families enable row level security;
drop policy if exists service_catalog_read on public.service_catalog;
drop policy if exists service_families_read on public.service_families;
create policy service_catalog_read on public.service_catalog for select to authenticated using (true);
create policy service_families_read on public.service_families for select to authenticated using (true);
-- no write policies: changes go through service_set_family / service_catalog_replace (Level 4+)

create or replace function public.stl_name_key(p text) returns text
language sql immutable parallel safe as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g')
$$;

-- "Root Colour - MD", "- L/T", "- F/S" and the old "(Med)" are one service, so they share a
-- stem; a keratin's "- Application" and "- Ironing" share one too.
create or replace function public.stl_item_stem(p text) returns text
language sql immutable parallel safe as $$
  select nullif(trim(both ' -' from
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), '\s*\(Refund\)\s*$', '', 'i'),
        '\s*-?\s*\((EL ?/ ?ET|F ?/ ?S|L ?/ ?T|MD|S ?/ ?F|Med|MED|Long|Short)\)\s*$', '', 'i'),
      '\s*-?\s*(EL ?/ ?ET|F ?/ ?S|L ?/ ?T|MD|S ?/ ?F|MED)\s*$|\s*-\s*(Application|Ironing)\s*$', '', 'i')
  ), '')
$$;

create or replace function public.item_classes(p_items text[] default null)
returns table(item text, kind text, category text, family text, stem text, via text)
language sql stable
set search_path to 'public'
as $$
  with d as (
    select distinct x as item from unnest(p_items) as x
    union
    select distinct coalesce(s.item, '') from sales_transaction_lines s where p_items is null
  ),
  k as (
    select d.item, public.stl_item_kind(d.item) as kind,
           regexp_replace(regexp_replace(d.item, '\s*\(Refund\)\s*$', '', 'i'), '^\(treat\)\s*', '', 'i') as nm,
           lower(d.item) as li
    from d
  ), m as (
    -- Phorest's list first: the whole name, then the part after any " - " (package and combo
    -- lines read "Polish & Pamper (AED 350) - Manicure", "Mani & Pedi Combo - Pedicure"), the
    -- longest such part first. "(Treat) " (a free one) is ignored.
    select k.item, k.kind, k.li,
           coalesce(c.category, sfx.category) as cat_catalog,
           coalesce(c.service_name, sfx.service_name) as cat_name
    from k
    left join public.service_catalog c on c.name_key = public.stl_name_key(k.nm)
    left join lateral (
      select c2.category, c2.service_name
      from generate_series(2, coalesce(array_length(string_to_array(k.nm, ' - '), 1), 1)) as i
      join public.service_catalog c2
        on c2.name_key = public.stl_name_key(array_to_string((string_to_array(k.nm, ' - '))[i:], ' - '))
      where c.category is null and k.kind = 'service'
      order by i limit 1
    ) sfx on true
  ), r as (
    select m.*,
      case when m.kind = 'service' and m.cat_catalog is null then
        case
          when m.li ~ 'colou?r ?lock' then 'COLOUR LOCKING TRT'
          when m.li ~ 'repair or hydrate|hydrate trt|caviar treatment|fibre clinix|oil treatment|express treatment' then 'REPAIR & HYDRATE TRT'
          when m.li ~ 'courier|fratelli.*package' then 'SKIP'
          when m.li ~ 'keratin (bond|tip)|sticktip|nano (ext|bomb|stick)|clip-?in|hair extension keratin|\m(16|18|20|22|24) ?(["'']|inch|iches|@)|invisi|nano ?bond|nanobon|slim ?-?line|slime|\mtapes?\M|k-tip|flat tip|brond.?mbre|\mnano\M' then 'HAIR EXTENSIONS'
          when m.li ~ '^(nude pink|nude sugar|cranberry citrus|tea rose|tangerine pomegranate|rose|rose lime|pink juniper|cherry plum|guava blush|ruby grapefruit|peach melon)$' then 'RETAIL PRODUCTS'
          when m.li ~ '^refill -|cleanser|\mconditioner|shampoo|shower|cartridge|enhancer|enhance\M|leave-in|sealer|\msoap|\mrinse|affirmation|jelly mask|clarifying|\mcola\M|\moil\M|mask w/|hyaluronic|viart (elastic|shampoo|mask)|after ?care|remedy|split end|facial roller|facial brush|sonic|straightener|\mstyler\M|\mghd\M|oval brush|hydrator|activator|mousse|\mpdx\M|nano seal|stmnt|serum|gift bag|eau de|wax powder|brush|detangler|\mt\.t\.?\M|twss|cloud nine|\msocks?\M|roller|face-?lift pen|microneedle|microcurrent|hardener|pomade|\mspray|creme|\mcream|scrub|masque|essence|top ?coat|essie|developer|lightener|\mbag\M|greeting cards|immune|session label|^6% |parlux|\miron\M' then 'RETAIL PRODUCTS'
          when m.li ~ '^\(treat\) abc|\mabc |viart treat|philipps' then '1TREATMENTS - ABC'
          when m.li ~ 'fine hair' then 'FINE HAIR TRT'
          when m.li ~ 'curly hair' then 'CURLY HAIR TRT'
          when m.li ~ 'chelat|detox|mineral' then 'MINERAL BUILD-UP TRT'
          when m.li ~ 'bond repair|olaplex|\mr-?2\M|r-?two' then 'BOND REPAIR TRT'
          when m.li ~ 'scalp' then 'SCALP TRT'
          when m.li ~ 'keratin|straighten|frizz' then 'KERATIN'
          when m.li ~ 'beauty potion' then 'BEAUTY POTION TRT'
          when m.li ~ 'blonde rev' then 'BLONDE REVIVAL TRT'
          when m.li ~ 'balayage' then 'BALAYAGE'
          when m.li ~ 'bleach' then 'BLEACHING'
          when m.li ~ 'tint' and m.li !~ 'highlight|foil|root tint' then 'TINTING'
          when m.li ~ 'lash lift|\mlvl\M|lamination|lifting' then 'LIFTING'
          when m.li ~ 'lash' then 'LASH EXTENSION'
          when m.li ~ 'nail ext|overlay|acrylic|acrygel' then 'NAIL EXTENSION'
          when m.li ~ 'thread' then 'THREADING'
          when m.li ~ 'wax|brazil|hollywood|bikini|under ?arm|^(forehead|tummy|chest|half back|full back)$|ingrown' then 'WAXING'
          when m.li ~ 'facial|hydermabrasion|hydrafacial|deep cleans|led light|anti-aging|skin tight|back cleans|^cleanse$|face treatment|hydra ?electro' then 'FACIALS'
          when m.li ~ 'massage|reiki|sound healing' then 'MASSAGE'
          when m.li ~ 'chameleon|pigments full nails|polish full colo' then 'HANDS AND FEET'
          when m.li ~ 'foil|highlight|face frame|bright|partial|\mfh\M|half head|3/4' then 'HIGHLIGHTS'
          when m.li ~ 'toner|toning|gloss|rebalance' then 'TONING'
          when m.li ~ 'colou?r|root|pigment|stretch|hairline' then 'COLOURING'
          when m.li ~ 'extension|re-?fit|weft|tape ext|removal and re|put in|\mmaintenance' then 'HAIR EXTENSIONS'
          when m.li ~ 'consult|hair plan' then 'Consultation'
          when m.li ~ 'mani|pedi|polish|gelish|\mgel\M|biab|nail|callus|paraffin|french' then 'HANDS AND FEET'
          when m.li ~ 'wash cut|cut and finish|haircut|cut only|fringe|restyle|\mcut\M|trim|fade|beard|shave' then 'CUTTING'
          when m.li ~ 'blow[ -]?dry|blast|hair up|plait|hair wash|updo|styl' then 'STYLING'
        end
      end as cat_rule
    from m
  ), n as (
    select r.item, r.kind, r.cat_name,
      case when r.kind in ('non_sale', 'voucher', 'prepaid') then 'SKIP'
           when r.kind = 'product' then 'RETAIL PRODUCTS'
           else coalesce(r.cat_catalog, r.cat_rule, 'UNMAPPED') end as category,
      case when r.kind in ('non_sale', 'voucher', 'prepaid') then 'skip'
           when r.kind = 'product' then 'product'
           when r.cat_catalog is not null then 'phorest'
           when r.cat_rule is not null then 'rule'
           else 'none' end as via
    from r
  )
  select n.item, n.kind, n.category, coalesce(f.family, 'unmapped'),
         case when n.kind = 'product' then trim(n.item)
              when n.cat_name is not null then public.stl_item_stem(n.cat_name)
              else public.stl_item_stem(n.item) end, n.via
  from n left join public.service_families f on f.category = n.category
$$;
revoke all on function public.item_classes(text[]) from public, anon;
grant execute on function public.item_classes(text[]) to authenticated;

-- ── THE CARDS: per family, how many different clients and how many units ───────────────
create or replace function public.client_mix_cards(p_from date, p_to date, p_branch text default null)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb; scope text[];
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 1 then
    raise exception 'Sign in to see Client Mix';
  end if;
  scope := case when p_branch is null then array['SAA','KCA','MC','AQ'] else array[p_branch] end;
  with b as materialized (
    select s.client_name as cn, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch = any(scope) and s.date between p_from and p_to and s.client_name is not null
      and coalesce(s.net, 0) >= 0 and coalesce(s.item, '') !~* '\(Refund\)\s*$'
  ), nm as materialized (
    select cn, lower(regexp_replace(trim(cn), '\s+', ' ', 'g')) as k
    from (select distinct cn from b) d
    where trim(cn) <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), ic as materialized (select item, family, stem from public.item_classes(array(select distinct raw_item from b))),
  p as materialized (
    select nm.k, ic.family, ic.stem,
           case when b.raw_item ~* '\s-\s*ironing\s*$' then 0 else 1 end as u
    from b join nm using (cn) join ic on ic.item = b.raw_item
    where ic.family <> 'skip'
  ), fam as (
    select family, count(distinct k)::int as clients, sum(u)::int as units from p group by family
  )
  select jsonb_build_object(
    'total_clients', (select count(distinct k) from p),
    'fams', coalesce((select jsonb_agg(to_jsonb(fam)) from fam), '[]'::jsonb),
    'unmapped_items', (select count(distinct stem) from p where family = 'unmapped'),
    'unmapped_lines', (select count(*) from p where family = 'unmapped')
  ) into out;
  return out;
end $function$;
revoke all on function public.client_mix_cards(date, date, text) from public, anon;
grant execute on function public.client_mix_cards(date, date, text) to authenticated;

-- ── THE DETAIL: one family, narrowed by "also had" / "did not have", a Phorest category
-- and an item: the items table, the category counts, and the clients ─────────────────────
create or replace function public.client_mix_detail(
  p_from date, p_to date, p_branch text, p_fam text,
  p_with text[] default '{}', p_without text[] default '{}',
  p_cat text default null, p_item text default null, p_limit int default 300)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb; scope text[];
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 1 then
    raise exception 'Sign in to see Client Mix';
  end if;
  scope := case when p_branch is null then array['SAA','KCA','MC','AQ'] else array[p_branch] end;
  with b as materialized (
    select s.client_name as cn, s.branch, s.date, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch = any(scope) and s.date between p_from and p_to and s.client_name is not null
      and coalesce(s.net, 0) >= 0 and coalesce(s.item, '') !~* '\(Refund\)\s*$'
  ), nm as materialized (
    select cn, lower(regexp_replace(trim(cn), '\s+', ' ', 'g')) as k, regexp_replace(trim(cn), '\s+', ' ', 'g') as name
    from (select distinct cn from b) d
    where trim(cn) <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), ic as materialized (select item, family, category, stem from public.item_classes(array(select distinct raw_item from b))),
  p as materialized (
    select nm.k, nm.name, b.branch, b.date, ic.family, ic.category, ic.stem,
           case when b.raw_item ~* '\s-\s*ironing\s*$' then 0 else 1 end as u
    from b join nm using (cn) join ic on ic.item = b.raw_item
    where ic.family <> 'skip'
  ), fk as materialized (
    select distinct k, family from p
  ), pop0 as materialized (
    select x.k from fk x
    where x.family = p_fam
      and not exists (select 1 from unnest(coalesce(p_with, '{}'::text[])) w
                      where not exists (select 1 from fk f where f.k = x.k and f.family = w))
      and not exists (select 1 from fk f where f.k = x.k and f.family = any(coalesce(p_without, '{}'::text[])))
  ), sl0 as materialized (
    select p.* from p join pop0 using (k) where p.family = p_fam
  ), pop as materialized (
    select distinct k from sl0 where p_cat is null or category = p_cat
  ), sl as materialized (
    select sl0.* from sl0 join pop using (k) where p_cat is null or sl0.category = p_cat
  ), sel as materialized (
    select k, sum(u)::int as units from sl where p_item is null or stem = p_item group by k
  ), lim as materialized (
    select k, units from sel order by units desc, k limit greatest(p_limit, 1)
  ), vis as (
    select p.k, max(p.name) as client_name, mode() within group (order by p.branch) as branch,
           count(distinct ((p.date - date '2000-01-01') * 8 + array_position(array['SAA','KCA','MC','AQ'], p.branch)))::int as visits
    from p join lim using (k) group by p.k
  ), bg0 as (
    select p.k, p.family, p.stem, sum(p.u)::int as u from p join lim using (k) group by p.k, p.family, p.stem
  ), bg as (
    select k, family, stem, u, row_number() over (partition by k order by (family = p_fam) desc, u desc, stem) as rn from bg0
  ), r as (
    select vis.client_name, vis.branch, vis.visits, lim.units,
           (select jsonb_agg(jsonb_build_object('s', bg.stem, 'f', bg.family, 'u', bg.u) order by bg.rn)
            from bg where bg.k = lim.k and bg.rn <= 10) as bought
    from lim join vis on vis.k = lim.k
  )
  select jsonb_build_object(
    'clients', (select count(*) from pop),
    'units', (select coalesce(sum(u), 0) from sl),
    'matched', (select count(*) from sel),
    'cats', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'clients', clients, 'units', units) order by clients desc)
                      from (select category, count(distinct k)::int as clients, sum(u)::int as units from sl0 group by category) c), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'stem', stem, 'clients', clients, 'units', units) order by clients desc, units desc)
                       from (select category, stem, count(distinct k)::int as clients, sum(u)::int as units from sl group by category, stem order by 3 desc, 4 desc limit 80) i), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.units desc, r.visits desc, r.client_name) from r), '[]'::jsonb)
  ) into out;
  return out;
end $function$;
revoke all on function public.client_mix_detail(date, date, text, text, text[], text[], text, text, int) from public, anon;
grant execute on function public.client_mix_detail(date, date, text, text, text[], text[], text, text, int) to authenticated;

-- ── THE ROSTER TAB ─────────────────────────────────────────────────────────────────────
create or replace function public.service_roster()
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 1 then
    raise exception 'Sign in to see the service roster';
  end if;
  with ic as materialized (select * from public.item_classes()),
  ln as materialized (
    select ic.item, ic.category, ic.family, ic.via, count(*)::int as lines, max(s.date) as last_seen
    from sales_transaction_lines s join ic on ic.item = coalesce(s.item, '')
    where s.date >= date '2025-01-01' and ic.family <> 'skip' and ic.kind <> 'product'
    group by 1, 2, 3, 4
  ), cat as (
    select category from service_catalog union select category from service_families
    union select category from ln
  ), cats as (
    select cat.category, coalesce(f.family, 'unmapped') as family,
           (select count(*) from service_catalog c where c.category = cat.category)::int as services,
           coalesce((select sum(lines) from ln where ln.category = cat.category), 0)::int as lines
    from cat left join service_families f on f.category = cat.category
    where cat.category not in ('UNMAPPED', 'SKIP', 'RETAIL PRODUCTS')
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(cats) order by (family = 'unmapped') desc, lines desc) from cats), '[]'::jsonb),
    'unmapped', coalesce((select jsonb_agg(jsonb_build_object('item', item, 'lines', lines, 'last_seen', last_seen) order by lines desc)
                          from (select * from ln where via = 'none' order by lines desc limit 60) u), '[]'::jsonb),
    'by_rule', coalesce((select jsonb_agg(jsonb_build_object('item', item, 'category', category, 'lines', lines, 'last_seen', last_seen) order by lines desc)
                         from (select * from ln where via = 'rule' order by lines desc limit 60) u), '[]'::jsonb),
    'lines_phorest', (select coalesce(sum(lines), 0) from ln where via = 'phorest'),
    'lines_rule', (select coalesce(sum(lines), 0) from ln where via = 'rule'),
    'lines_none', (select coalesce(sum(lines), 0) from ln where via = 'none'),
    'catalog_count', (select count(*) from service_catalog),
    'catalog_updated', (select max(updated_at) from service_catalog)
  ) into out;
  return out;
end $function$;
revoke all on function public.service_roster() from public, anon;
grant execute on function public.service_roster() to authenticated;

create or replace function public.service_set_family(p_category text, p_family text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare who text;
begin
  select m.name into who from public.dashboard_me() m where m.level >= 4 limit 1;
  if who is null then raise exception 'Level 4 and above can change the service roster'; end if;
  if p_category is null or trim(p_category) = '' then raise exception 'No category'; end if;
  if p_family not in ('colour','treat','cut','nails','beauty','retail','extensions','consult','other','skip') then raise exception 'Unknown family %', p_family; end if;
  insert into service_families (category, family, updated_at, updated_by) values (p_category, p_family, now(), who)
  on conflict (category) do update set family = excluded.family, updated_at = now(), updated_by = excluded.updated_by;
  return jsonb_build_object('category', p_category, 'family', p_family);
end $function$;
revoke all on function public.service_set_family(text, text) from public, anon;
grant execute on function public.service_set_family(text, text) to authenticated;

-- Replaces the whole catalog from a Phorest "Export all services" (all four branches can be
-- sent together; duplicates collapse). Refuses a short list, so a wrong file cannot wipe it.
create or replace function public.service_catalog_replace(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare who text; n int; newc text[];
begin
  select m.name into who from public.dashboard_me() m where m.level >= 4 limit 1;
  if who is null then raise exception 'Level 4 and above can refresh the service roster'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 150 then
    raise exception 'That looks too short to be the Phorest services list (need at least 150 rows)';
  end if;
  create temp table _cm_in on commit drop as
    select distinct on (public.stl_name_key(r.service_name)) public.stl_name_key(r.service_name) as name_key,
           trim(r.service_name) as service_name, trim(r.category) as category
    from jsonb_to_recordset(p_rows) as r(service_name text, category text)
    where nullif(trim(r.service_name), '') is not null and nullif(trim(r.category), '') is not null
    order by public.stl_name_key(r.service_name), trim(r.category);
  select count(*) into n from _cm_in;
  if n < 150 then raise exception 'Only % usable rows, expected at least 150', n; end if;
  delete from service_catalog where true;
  insert into service_catalog (name_key, service_name, category, updated_at)
    select name_key, service_name, category, now() from _cm_in;
  select coalesce(array_agg(distinct category), array[]::text[]) into newc
    from _cm_in where category not in (select category from service_families);
  return jsonb_build_object('services', n, 'new_categories', to_jsonb(newc));
end $function$;
revoke all on function public.service_catalog_replace(jsonb) from public, anon;
grant execute on function public.service_catalog_replace(jsonb) to authenticated;
