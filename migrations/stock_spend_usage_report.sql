-- Stock & Supplier Spend, step 4 (Kate, 22 Oct 2026): the page reads Phorest's own product category as the family, weekly bands from
-- what was actually used (product_usage_lines), and a suggested Priority A or B from spend. Builds on stock_spend_usage.sql.
--
-- spend_cat_family(): the family is Phorest's own Product Category (Cristine, 22 Oct: Phorest already has one per product, she removed
-- her own column). Shown title-cased when Phorest prints it in capitals (VIBRANCE -> Vibrance); BLOND ME is folded into BLONDE ME. A product
-- with no category yet falls back to the older brand rule, spend_family(). A name in spend_product_fam still overrides either.
--
-- spend_report() gains, beside the old keys:
--   fam_months  [branch, family, type, month, AED, units]   received in Phorest, all types (it was professional only)
--   use_weeks   [branch, family, type, Monday, AED, units]   used (Product Usage Details x the Stock List cost), 4 months to month end
--   use_through, use_cover  the last day loaded, and used vs received per branch over the window (to see how much a branch logs)
--   prio_sug    [brand, product, SAA, KCA, MC, AQ, ALL]      A = the products that make the first 80% of spend over the last 4 months
--                                                            in that branch, B = the next 15%; on usage where a branch has it, else on received

create or replace function public.spend_cat_family(p_cat text, p_brand text, p_product text) returns text
language sql immutable as $$
  select case
    when nullif(btrim(coalesce(p_cat, '')), '') is null then public.spend_family(p_brand, p_product)
    when upper(btrim(p_cat)) in ('BLOND ME', 'BLONDE ME') then 'Blonde Me'
    when btrim(p_cat) = upper(btrim(p_cat)) then initcap(lower(btrim(p_cat)))
    else btrim(p_cat)
  end
$$;

create or replace function public.spend_prio_suggest(p_from date, p_to date) returns jsonb
language sql stable set search_path = '' as $$
  with
  rec as (
    select branch, coalesce(brand, '') brand, product, sum(spend) s
      from public.stock_order_lines
     where status = 'arrived' and type <> 'unmatched' and spend is not null
       and branch in ('SAA','KCA','MC','AQ') and arrived_date >= p_from and arrived_date < p_to
     group by 1, 2, 3),
  ops as (
    select distinct branch, coalesce(brand, '') brand, product
      from public.stock_order_lines
     where branch in ('SAA','KCA','MC','AQ') and arrived_date >= (p_from - interval '9 months')::date),
  usp as (
    select branch, coalesce(list_brand, brand, '') lb, list_product lp, sum(spend) s
      from public.product_usage_lines
     where used_date >= p_from and used_date < p_to and spend is not null and list_product is not null
       and branch in ('SAA','KCA','MC','AQ')
     group by 1, 2, 3),
  usm as (
    select distinct on (u.branch, u.lb, u.lp) u.branch, o.brand, o.product, u.s
      from usp u
      join ops o on o.branch = u.branch and o.brand = u.lb
       and (lower(o.product) = lower(u.lp)
            or lower(o.product) like replace(replace(replace(lower(u.lp), '\', '\\'), '%', '\%'), '_', '\_') || ' %')
     order by u.branch, u.lb, u.lp, length(o.product)),
  ub as (
    select branch from public.product_usage_lines
     where used_date >= p_from and used_date < p_to and branch in ('SAA','KCA','MC','AQ')
     group by 1 having count(distinct source_month) >= 2),
  base as (
    select branch, brand, product, sum(s) s from (
      select branch, brand, product, s from usm where branch in (select branch from ub)
      union all
      select branch, brand, product, s from rec where branch not in (select branch from ub)) x
     group by 1, 2, 3),
  u2 as (
    select branch, brand, product, s from base
    union all
    select 'ALL', brand, product, sum(s) from base group by 2, 3),
  rk as (
    select branch, brand, product,
           coalesce(sum(s) over (partition by branch order by s desc, brand, product
                                 rows between unbounded preceding and 1 preceding), 0) cum_before,
           sum(s) over (partition by branch) tot
      from u2 where s > 0),
  pr as (
    select branch, brand, product,
           case when cum_before < 0.80 * tot then 'A' when cum_before < 0.95 * tot then 'B' end p
      from rk)
  select coalesce(jsonb_agg(jsonb_build_array(brand, product, saa, kca, mc, aq, al)), '[]'::jsonb)
    from (select brand, product,
                 max(p) filter (where branch = 'SAA') saa, max(p) filter (where branch = 'KCA') kca,
                 max(p) filter (where branch = 'MC') mc, max(p) filter (where branch = 'AQ') aq,
                 max(p) filter (where branch = 'ALL') al
            from pr where p is not null group by 1, 2) z
$$;
revoke all on function public.spend_prio_suggest(date, date) from public, anon, authenticated;

create or replace function public.spend_report(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a  jsonb := public.spend_access();
  m0 date;
  m1 date;
  w0 date;
begin
  if not coalesce((a->>'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  -- No month asked for: the newest month that is over (a month still running compares lumpy invoices with half a month of income).
  m0 := date_trunc('month', coalesce(p_month,
          (select max(month) from public.spend_invoiced where month < date_trunc('month', current_date)),
          (select max(month) from public.spend_invoiced), current_date))::date;
  m1 := (m0 + interval '1 month')::date;
  w0 := date_trunc('week', (m0 - interval '3 months')::date)::date;   -- the Monday on or before the window's first day
  return jsonb_build_object(
    'access', a,
    'month', m0,
    'partial', m0 = date_trunc('month', current_date)::date,
    'months', coalesce((select jsonb_agg(m order by m desc) from (select distinct month m from public.spend_invoiced) x), '[]'::jsonb),
    'invoiced_loaded', (select max(loaded_at) from public.spend_invoiced where month = m0),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('n', name, 'cat', cat) order by name) from public.spend_supplier), '[]'::jsonb),
    'invoiced', coalesce((select jsonb_agg(jsonb_build_object('s', supplier, 'b', branch, 'v', amount)) from public.spend_invoiced where month = m0), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_array(brand, product, type, dept, saa, kca, mc, aq, units))
        from (select coalesce(brand, '') brand, product, type, dept,
                     round(coalesce(sum(spend) filter (where branch = 'SAA'), 0)) saa,
                     round(coalesce(sum(spend) filter (where branch = 'KCA'), 0)) kca,
                     round(coalesce(sum(spend) filter (where branch = 'MC'), 0)) mc,
                     round(coalesce(sum(spend) filter (where branch = 'AQ'), 0)) aq,
                     round(sum(count)) units
                from public.stock_order_lines
               where status = 'arrived' and type <> 'unmatched' and spend is not null
                 and branch in ('SAA','KCA','MC','AQ') and arrived_date >= m0 and arrived_date < m1
               group by 1, 2, 3, 4) p), '[]'::jsonb),
    'brandsup', coalesce((select jsonb_object_agg(brand, supplier) from public.spend_brand_supplier), '{}'::jsonb),
    'prodcat', coalesce((select jsonb_agg(jsonb_build_array(brand, product, cat)) from public.spend_product_cat), '[]'::jsonb),
    'prodprio', coalesce((select jsonb_agg(jsonb_build_array(brand, product, prio)) from public.spend_product_prio), '[]'::jsonb),
    'prio_sug', public.spend_prio_suggest((m0 - interval '3 months')::date, m1),
    'prodfam', coalesce((select jsonb_agg(jsonb_build_array(brand, product, family)) from public.spend_product_fam), '[]'::jsonb),
    'fam_months', coalesce((
      select jsonb_agg(jsonb_build_array(branch, family, type, to_char(mo, 'YYYY-MM-DD'), round(spend), round(units)))
        from (select s.branch, coalesce(o.family, public.spend_cat_family(s.phorest_category, s.brand, s.product)) family, s.type,
                     date_trunc('month', s.arrived_date)::date mo, sum(s.spend) spend, sum(s.count) units
                from public.stock_order_lines s
                left join public.spend_product_fam o on o.brand = coalesce(s.brand, '') and o.product = s.product
               where s.status = 'arrived' and s.type in ('professional', 'retail') and s.spend is not null
                 and s.branch in ('SAA','KCA','MC','AQ')
                 and s.arrived_date >= (m0 - interval '3 months')::date and s.arrived_date < m1
               group by 1, 2, 3, 4) f), '[]'::jsonb),
    'use_weeks', coalesce((
      select jsonb_agg(jsonb_build_array(branch, family, type, to_char(wk, 'YYYY-MM-DD'), round(spend), round(units)))
        from (select u.branch,
                     coalesce(o.family, public.spend_cat_family(coalesce(u.list_category, u.category), coalesce(u.list_brand, u.brand), coalesce(u.list_product, u.product))) family,
                     case when u.type in ('professional', 'retail') then u.type when u.line_type = 'R' then 'retail' else 'professional' end type,
                     date_trunc('week', u.used_date)::date wk, sum(u.spend) spend, sum(-u.qty) units
                from public.product_usage_lines u
                left join public.spend_product_fam o on o.brand = coalesce(u.list_brand, '') and o.product = coalesce(u.list_product, u.product)
               where u.branch in ('SAA','KCA','MC','AQ') and u.used_date >= w0 and u.used_date < m1
               group by 1, 2, 3, 4) w), '[]'::jsonb),
    'use_through', (select max(used_date) from public.product_usage_lines where used_date < m1),
    'use_cover', coalesce((
      select jsonb_agg(jsonb_build_array(branch, round(used_u), round(rec_u), round(used_aed), round(rec_aed)))
        from (select b.branch,
                     (select coalesce(sum(-qty), 0) from public.product_usage_lines where branch = b.branch and used_date >= w0 and used_date < m1) used_u,
                     (select coalesce(sum(count), 0) from public.stock_order_lines where branch = b.branch and status = 'arrived' and arrived_date >= w0 and arrived_date < m1) rec_u,
                     (select coalesce(sum(spend), 0) from public.product_usage_lines where branch = b.branch and used_date >= w0 and used_date < m1) used_aed,
                     (select coalesce(sum(spend), 0) from public.stock_order_lines where branch = b.branch and status = 'arrived' and arrived_date >= w0 and arrived_date < m1) rec_aed
                from (values ('SAA'), ('KCA'), ('MC'), ('AQ')) b(branch)) c), '[]'::jsonb),
    'caps', coalesce((select jsonb_agg(jsonb_build_array(kind, key, value)) from public.spend_caps), '[]'::jsonb),
    'income', coalesce((select jsonb_object_agg(branch, inc) from (
        select branch, round(sum(total_ex_vat)) inc from public.phorest_staff_daily
         where is_total and branch in ('SAA','KCA','MC','AQ') and date >= m0 and date < m1 group by 1) i), '{}'::jsonb),
    'income_through', (select max(date) from public.phorest_staff_daily where is_total and date >= m0 and date < m1),
    'orders_through', (select max(arrived_date) from public.stock_order_lines where status = 'arrived' and arrived_date >= m0 and arrived_date < m1),
    'priced_on', (select max(priced_on) from public.stock_order_lines)
  );
end $$;
revoke all on function public.spend_report(date) from public, anon;
grant execute on function public.spend_report(date) to authenticated;
