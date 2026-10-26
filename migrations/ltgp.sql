-- LTGP : CAC (Kate, 26 Oct 2026, after Murray Kidd's WhatsApp). The Marketing Spend page moves from LTV : CAC to LTGP : CAC, where
-- LTGP (Lifetime Gross Profit) = revenue minus COGS, COGS = cost of labour (COS), POS charges, consumables, cost of retail products sold
-- and cost of professional products. Target 10 to 1.
--
-- What each cost is read from:
--   professional products  Phorest Product Usage Details (product_usage_lines, line_type P and C), priced from the Stock Lists
--   retail products sold   same table, line_type R
--   labour, POS, consumables   NOT in the database: Accounts send them and Kate uploads the file on the page (cogs_costs)
-- A cost Accounts upload for pro_products or retail_cogs wins over the Phorest figure for that month.
-- Additive only: a new table and four new functions. marketing_spend_report and its cache are not touched.
create table if not exists public.cogs_costs (
  month       date not null,
  branch      text not null check (branch in ('SAA', 'KCA', 'MC', 'AQ', 'BAH', 'ALL')),
  category    text not null check (category in ('labour', 'pos', 'consumables', 'retail_cogs', 'pro_products')),
  amount_aed  numeric not null check (amount_aed >= 0),
  source      text,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  primary key (month, branch, category)
);
alter table public.cogs_costs enable row level security;   -- no policies: read through ltgp_report, written through cogs_costs_save

-- Save a file's rows. p_rows = [{month:'2026-01-01', branch:'SAA'|'KCA'|'MC'|'AQ'|'BAH'|'ALL', category:'labour'|..., amount:123.4}].
-- A row for a month, branch and category that is already there replaces it. Level 4 and above.
create or replace function public.cogs_costs_save(p_rows jsonb, p_source text)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  if coalesce(public.kb_level(), 0) < 4 then raise exception 'Only Level 4 and above can add costs'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send between 1 and 2000 rows';
  end if;
  insert into public.cogs_costs (month, branch, category, amount_aed, source, uploaded_by)
  select date_trunc('month', (r->>'month')::date)::date, upper(r->>'branch'), r->>'category', round((r->>'amount')::numeric, 2),
         left(p_source, 200), (select m.name from public.dashboard_me() m limit 1)
  from jsonb_array_elements(p_rows) r
  on conflict (month, branch, category) do update
    set amount_aed = excluded.amount_aed, source = excluded.source, uploaded_by = excluded.uploaded_by, uploaded_at = now();
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke all on function public.cogs_costs_save(jsonb, text) from public, anon;
grant execute on function public.cogs_costs_save(jsonb, text) to authenticated;

-- Take back one upload (every row that came from that file name).
create or replace function public.cogs_costs_remove(p_source text)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  if coalesce(public.kb_level(), 0) < 4 then raise exception 'Only Level 4 and above can remove costs'; end if;
  delete from public.cogs_costs where source = p_source;
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke all on function public.cogs_costs_remove(text) from public, anon;
grant execute on function public.cogs_costs_remove(text) to authenticated;

-- The numbers the page needs, one call. Revenue is the four UAE salons' net sales (financial_totals, before VAT); Fratelli (closed May
-- 2026) and Bahrain (opened Aug 2026, no usage report) are left out of the margin so every cost has the same base.
-- A month's Accounts cost is "complete" when there is an ALL row or a row for each of SAA, KCA, MC and AQ.
create or replace function public.ltgp_report()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Marketing Spend is for Level 3 and above';
  end if;
  with months as (
    select generate_series(date '2026-01-01', date_trunc('month', current_date)::date, interval '1 month')::date mo
  ), rev as (
    select date_trunc('month', date)::date mo, sum(sales_net) sales, sum(services_net) svc, sum(products_net) prod, sum(courses_net) crs
    from financial_totals where branch in ('SAA', 'KCA', 'MC', 'AQ') and date >= date '2026-01-01' group by 1
  ), u as (
    select date_trunc('month', used_date)::date mo,
           sum(spend) filter (where line_type in ('P', 'C')) pro, sum(spend) filter (where line_type = 'R') retail
    from product_usage_lines where branch in ('SAA', 'KCA', 'MC', 'AQ') and used_date >= date '2026-01-01' group by 1
  ), rows as (
    select months.mo, round(coalesce(rev.sales, 0)) sales, round(coalesce(rev.svc, 0)) services, round(coalesce(rev.prod, 0)) products,
           round(coalesce(rev.crs, 0)) courses, round(coalesce(u.pro, 0)) pro_phorest, round(coalesce(u.retail, 0)) retail_phorest
    from months left join rev using (mo) left join u using (mo)
  ), acc as (
    select month mo, category,
           coalesce(max(amount_aed) filter (where branch = 'ALL'), sum(amount_aed) filter (where branch in ('SAA', 'KCA', 'MC', 'AQ'))) amt,
           (bool_or(branch = 'ALL') or count(*) filter (where branch in ('SAA', 'KCA', 'MC', 'AQ')) = 4) complete
    from cogs_costs where month >= date '2026-01-01' group by month, category
  )
  select jsonb_build_object(
    'months', (select coalesce(jsonb_agg(to_jsonb(r) order by r.mo), '[]') from rows r),
    'costs', (select coalesce(jsonb_agg(jsonb_build_object('mo', a.mo, 'category', a.category, 'amt', round(a.amt), 'complete', a.complete) order by a.mo), '[]') from acc a),
    'uploads', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
        select jsonb_build_object('source', source, 'rows', count(*), 'from', min(month), 'to', max(month), 'by', max(uploaded_by), 'at', max(uploaded_at)) x
        from cogs_costs group by source) s),
    'can_upload', coalesce(public.kb_level(), 0) >= 4,
    'usage_last_day', (select max(used_date) from product_usage_lines where used_date >= date '2026-01-01')
  ) into out;
  return out;
end;
$function$;
revoke all on function public.ltgp_report() from public, anon;
grant execute on function public.ltgp_report() to authenticated;
