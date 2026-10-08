-- Kate, 8 Oct 2026: Service Rankings rebuilt on the Client Mix footing (migrations/client_mix.sql).
-- Every sales line is sorted by Phorest's own service categories (item_classes), so the sizes of
-- one service (MD, L/T, F/S, the old "(Med)") are one row, a keratin's Application and Ironing
-- are one treatment, and package lines ("Polish & Pamper - Pedicure") count as the service.
-- Read-only over sales_transaction_lines from Jan 2025, security invoker. Revenue is net (ex VAT)
-- like Top Clients; refunds, negative lines, deposits, vouchers, prepaid courses, retail and
-- skipped categories are left out. Units are sales lines (Ironing counts 0). Clients are distinct
-- names (walk-ins left out). One call returns the ranking, the previous window for the change
-- column, the per-branch units, the sizes behind each row, and the family and category totals
-- the pills need. Replaces get_top_services for the page (the old function stays, unused).
create or replace function public.service_rankings(
  p_from date, p_to date, p_pfrom date default null, p_pto date default null,
  p_branch text default null, p_fam text default null, p_cat text default null, p_limit int default 400)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb; scope text[];
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 1 then
    raise exception 'Sign in to see Service Rankings';
  end if;
  scope := case when p_branch is null then array['SAA','KCA','MC','AQ'] else array[p_branch] end;
  with b as materialized (
    select s.branch, s.date, s.client_name as cn, coalesce(s.item, '') as raw_item, coalesce(s.net, 0) as net
    from sales_transaction_lines s
    where s.branch = any(scope)
      and s.date between least(p_from, coalesce(p_pfrom, p_from)) and p_to
      and coalesce(s.net, 0) >= 0 and coalesce(s.item, '') !~* '\(Refund\)\s*$'
  ), nm as materialized (
    select cn, case when cn ~* '^\s*walk[\s-]*in\M' or trim(cn) = '' then null
                    else lower(regexp_replace(trim(cn), '\s+', ' ', 'g')) end as k
    from (select distinct cn from b where cn is not null) d
  ), ic as materialized (
    select item, family, category, stem from public.item_classes(array(select distinct raw_item from b))
  ), p0 as materialized (
    select b.branch, b.date, nm.k, ic.family, ic.category, ic.stem, b.net, b.raw_item,
           case when b.raw_item ~* '\s-\s*ironing\s*$' then 0 else 1 end as u
    from b left join nm using (cn) join ic on ic.item = b.raw_item
    where ic.family not in ('skip', 'retail')
  ), cur0 as materialized (
    select * from p0 where date between p_from and p_to
  ), cur as materialized (
    select * from cur0 where (p_fam is null or family = p_fam) and (p_cat is null or category = p_cat)
  ), prv as materialized (
    select * from p0 where p_pfrom is not null and date between p_pfrom and p_pto
      and (p_fam is null or family = p_fam) and (p_cat is null or category = p_cat)
  ), agg as (
    select stem, category, family, round(sum(net), 2) as rev, sum(u)::int as units, count(distinct k)::int as clients
    from cur group by stem, category, family
  ), pagg as (
    select stem, category, round(sum(net), 2) as rev, sum(u)::int as units from prv group by stem, category
  ), brn as (
    select stem, category, jsonb_object_agg(branch, units) as bu
    from (select stem, category, branch, sum(u)::int as units from cur group by stem, category, branch) x
    group by stem, category
  ), vr as (
    select stem, category, raw_item, round(sum(net), 2) as rev, sum(u)::int as units,
           row_number() over (partition by stem, category order by sum(u) desc, sum(net) desc) as rn
    from cur group by stem, category, raw_item
  ), vars as (
    select stem, category,
           jsonb_agg(jsonb_build_object('item', raw_item, 'units', units, 'rev', rev) order by rn) as v
    from vr where rn <= 12 group by stem, category
  ), top as (
    select agg.*, pagg.rev as prev_rev, pagg.units as prev_units, brn.bu, vars.v
    from agg
    left join pagg on pagg.stem = agg.stem and pagg.category = agg.category
    left join brn on brn.stem = agg.stem and brn.category = agg.category
    left join vars on vars.stem = agg.stem and vars.category = agg.category
    order by agg.rev desc limit greatest(p_limit, 1)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(top) order by top.rev desc) from top), '[]'::jsonb),
    'total_rev', (select coalesce(round(sum(net), 2), 0) from cur),
    'total_units', (select coalesce(sum(u), 0) from cur),
    'total_clients', (select count(distinct k) from cur),
    'prev_rev', (select coalesce(round(sum(net), 2), 0) from prv),
    'prev_units', (select coalesce(sum(u), 0) from prv),
    'fams', coalesce((select jsonb_agg(jsonb_build_object('family', family, 'rev', rev, 'units', units) order by rev desc)
                      from (select family, round(sum(net), 2) as rev, sum(u)::int as units from cur0 group by family) f), '[]'::jsonb),
    'cats', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'rev', rev, 'units', units) order by rev desc)
                      from (select category, round(sum(net), 2) as rev, sum(u)::int as units from cur0
                            where p_fam is null or family = p_fam group by category) c), '[]'::jsonb)
  ) into out;
  return out;
end $function$;
revoke all on function public.service_rankings(date, date, date, date, text, text, text, int) from public, anon;
grant execute on function public.service_rankings(date, date, date, date, text, text, text, int) to authenticated;

-- Timed under the authenticated role (Sept 2026: 0.9s; a year with the year before: 5s, so the page asks
-- for the previous window in a separate parallel call, 2s each). Nested loops made it slower.
alter function public.service_rankings(date, date, date, date, text, text, text, int) set enable_nestloop = off;
