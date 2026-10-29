-- Client Mix on the global header filter (Kate, 29 Oct 2026): p_branch may now be one code ('SAA') or a comma list ('SAA,KCA'),
-- because the header's Branch chips can have several picked. null (or empty) is still the four open UAE branches, and one code
-- behaves exactly as before. The cards also return visits per family (a client's day at a branch, counted once however many lines).
-- Revenue (net of discount, refunds left out, AED) comes back per family on the cards and per item, client and total on the detail.
-- p_cat is likewise one Phorest category or several joined with '|'. Same two functions as client_mix.sql, only the scope, category and visits lines changed.
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
  scope := case when p_branch is null or btrim(p_branch) = '' then array['SAA','KCA','MC','AQ'] else string_to_array(p_branch, ',') end;
  with b as materialized (
    select s.client_name as cn, s.branch, s.date, coalesce(s.net, 0) as net, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch = any(scope) and s.date between p_from and p_to and s.client_name is not null
      and coalesce(s.net, 0) >= 0 and coalesce(s.item, '') !~* '\(Refund\)\s*$'
  ), nm as materialized (
    select cn, lower(regexp_replace(trim(cn), '\s+', ' ', 'g')) as k
    from (select distinct cn from b) d
    where trim(cn) <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), ic as materialized (select item, family, stem from public.item_classes(array(select distinct raw_item from b))),
  p as materialized (
    select nm.k, b.branch, b.date, b.net, ic.family, ic.stem,
           case when b.raw_item ~* '\s-\s*ironing\s*$' then 0 else 1 end as u
    from b join nm using (cn) join ic on ic.item = b.raw_item
    where ic.family <> 'skip'
  ), fam as (
    select family, count(distinct k)::int as clients, count(distinct (k, branch, date))::int as visits, round(sum(net))::bigint as revenue, sum(u)::int as units from p group by family
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
  scope := case when p_branch is null or btrim(p_branch) = '' then array['SAA','KCA','MC','AQ'] else string_to_array(p_branch, ',') end;
  with b as materialized (
    select s.client_name as cn, s.branch, s.date, coalesce(s.net, 0) as net, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch = any(scope) and s.date between p_from and p_to and s.client_name is not null
      and coalesce(s.net, 0) >= 0 and coalesce(s.item, '') !~* '\(Refund\)\s*$'
  ), nm as materialized (
    select cn, lower(regexp_replace(trim(cn), '\s+', ' ', 'g')) as k, regexp_replace(trim(cn), '\s+', ' ', 'g') as name
    from (select distinct cn from b) d
    where trim(cn) <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), ic as materialized (select item, family, category, stem from public.item_classes(array(select distinct raw_item from b))),
  p as materialized (
    select nm.k, nm.name, b.branch, b.date, b.net, ic.family, ic.category, ic.stem,
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
    select distinct k from sl0 where p_cat is null or category = any(string_to_array(p_cat, '|'))
  ), sl as materialized (
    select sl0.* from sl0 join pop using (k) where p_cat is null or sl0.category = any(string_to_array(p_cat, '|'))
  ), sel as materialized (
    select k, sum(u)::int as units, round(sum(net))::bigint as revenue from sl where p_item is null or stem = p_item group by k
  ), lim as materialized (
    select k, units, revenue from sel order by units desc, k limit greatest(p_limit, 1)
  ), vis as (
    select p.k, max(p.name) as client_name, mode() within group (order by p.branch) as branch,
           count(distinct ((p.date - date '2000-01-01') * 8 + array_position(array['SAA','KCA','MC','AQ'], p.branch)))::int as visits
    from p join lim using (k) group by p.k
  ), bg0 as (
    select p.k, p.family, p.stem, sum(p.u)::int as u from p join lim using (k) group by p.k, p.family, p.stem
  ), bg as (
    select k, family, stem, u, row_number() over (partition by k order by (family = p_fam) desc, u desc, stem) as rn from bg0
  ), r as (
    select vis.client_name, vis.branch, vis.visits, lim.units, lim.revenue,
           (select jsonb_agg(jsonb_build_object('s', bg.stem, 'f', bg.family, 'u', bg.u) order by bg.rn)
            from bg where bg.k = lim.k and bg.rn <= 10) as bought
    from lim join vis on vis.k = lim.k
  )
  select jsonb_build_object(
    'clients', (select count(*) from pop),
    'units', (select coalesce(sum(u), 0) from sl), 'revenue', (select coalesce(round(sum(net)), 0) from sl),
    'matched', (select count(*) from sel),
    'cats', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'clients', clients, 'units', units) order by clients desc)
                      from (select category, count(distinct k)::int as clients, sum(u)::int as units from sl0 group by category) c), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'stem', stem, 'clients', clients, 'units', units, 'revenue', revenue) order by clients desc, units desc)
                       from (select category, stem, count(distinct k)::int as clients, sum(u)::int as units, round(sum(net))::bigint as revenue from sl group by category, stem order by 3 desc, 4 desc limit 80) i), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.units desc, r.visits desc, r.client_name) from r), '[]'::jsonb)
  ) into out;
  return out;
end $function$;
revoke all on function public.client_mix_detail(date, date, text, text, text[], text[], text, text, int) from public, anon;
grant execute on function public.client_mix_detail(date, date, text, text, text[], text[], text, text, int) to authenticated;

-- Selection totals (Kate, 29 Oct 2026, applied live as client_mix_selection_totals): when p_with is not empty, client_mix_detail also returns
-- 'sel': visits, units and revenue over ALL the picked families (p_fam + p_with) for the clients who had them all, and the same per family.
-- It sits just before 'rows' in the final jsonb_build_object:
--   'sel', case when cardinality(coalesce(p_with, '{}'::text[])) = 0 then null else (select jsonb_build_object(
--       'visits',  count(distinct (k, branch, date)) over p rows of the picked families for the clients in pop,
--       'units',   sum(u) of the same rows,   'revenue', round(sum(net)) of the same rows,
--       'fams',    the same three figures per family)) end,

-- All the picked cards in the lists (Kate, 29 Oct 2026, applied live as client_mix_all_picked_in_lists): a CTE sla holds the lines of every
-- picked family (p_fam + p_with) for the clients in pop, the category pick narrowing only the lead family's lines. The items table, the
-- per-client units and revenue and the item pick read sla, items carry 'family', and a client's tags list the picked families first.

-- Overlap (Kate, 29 Oct 2026, applied live as client_mix_overlap): client_mix_detail also returns 'overlap', for the clients in view, how many
-- also had each other family and what those lines came to: [{family, clients, revenue}], ordered by clients. Sits just before 'sel'.

-- Any of them (Kate, 29 Oct 2026, applied live as client_mix_any_of_picked): client_mix_detail takes p_any boolean default false (the old
-- nine-argument function was dropped; calls that leave p_any out still work). false = the clients who had EVERY picked family, as before;
-- true = the clients who had AT LEAST ONE of p_fam + p_with. In that mode the lead-only reads (sl0, the category pick) cover every picked
-- family, and sel.fams carries 'clients' per family (how many of them had that one).
