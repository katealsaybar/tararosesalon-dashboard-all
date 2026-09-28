-- ============================================================
-- Top Clients + Service Rankings read sales_transaction_lines
-- Kate, 28 Sep 2026: "i need that data for the top clients" / "kaya rin bang
-- dyan na mag base ang top services?"
--
-- Both RPCs used to read service_data, the Service Performance upload, which
-- only ever held Jan–May 2026. Past May the pages came up empty and Service
-- Rankings fell back to the whole-period top_services aggregate. The Sales
-- Transactions feed (sales_transaction_lines, one row per sale line, pushed
-- daily by /daily-reports) runs Jan 2025 to date, so both now read that.
-- service_data and top_services are untouched; get_top_services_agg is
-- still the fallback when a window has no lines at all.
--
-- Checked before switching against one branch-month (SAA, March 2026):
-- service-only clients and service totals both match the old feed to the dirham.
--
-- Signatures are unchanged, so dashboard.js needs no edit and the existing
-- grants carry over through CREATE OR REPLACE.
-- ============================================================

-- What kind of line this is. The Sales Transactions report has no item type
-- column, so it's read off the name. A "(Refund)" suffix is stripped first so
-- a refund lands in the same bucket as the sale it reverses.
--   non_sale  money moving, not a sale: a Deposit is counted again on the
--             service it pays for, a balance payment on the day it was owed
--   voucher   a voucher being sold. Its redemption shows up later as an
--             ordinary service line for whoever redeems it, so counting the
--             sale as well would count the same money twice
--   prepaid   course / membership sales and their AED 0 redemption lines
--   product   retail: a size in the name (250ml, 161g, 16oz) or a set/kit.
--             Not a bare "set": "Russian Full set" is a lash service
--   service   everything else
-- The regexes cost ~45µs a call, so the RPCs below classify each distinct item
-- once and join, instead of calling this per line (a year of lines took 3.6s).
create or replace function public.stl_item_kind(p_item text)
returns text language sql immutable parallel safe as $$
  select case
    when n ~* '^\s*(deposit|outstanding balance payment)\s*$'                        then 'non_sale'
    when n ~* '^\s*voucher\M'                                                         then 'voucher'
    when n ~* '(glow club|buy \d+ (and|&) get|\mcourse\M|membership|memnership)'      then 'prepaid'
    when n ~* '\d+(\.\d+)?\s?(ml|g|gm|oz|kg)\M' or n ~* '\m(gift set|purifier set|kit)\M' then 'product'
    else 'service' end
  from (select regexp_replace(coalesce(p_item, ''), '\s*\(Refund\)\s*$', '', 'i') as n) b;
$$;

-- One client, however Phorest spaced or cased the name that day
-- (a double space in a name used to split one client into two).
create or replace function public.stl_client_key(p_name text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
$$;

-- ── Top Clients ──────────────────────────────────────────────
-- Revenue = everything the client paid for (services, retail, courses and
-- memberships, refunds netted off), less the non-sale and voucher lines above.
-- Visits = days she came in, per branch. The old version counted lines, so a
-- cut, toner and blow-dry on one day read as three visits.
-- Favourite service = the service she had most often, services only.
create or replace function public.get_top_clients(p_year integer, p_branches text[], p_from date, p_to date, p_limit integer default 25)
returns table(client_name text, total_revenue numeric, visit_count bigint, top_service text)
language sql stable as $$
  with base as (
    select public.stl_client_key(s.client_name) as ckey,
           regexp_replace(trim(s.client_name), '\s+', ' ', 'g') as cname,
           s.branch, s.date, s.total,
           regexp_replace(s.item, '\s*\(Refund\)\s*$', '', 'i') as item,
           s.item ~* '\(Refund\)\s*$' as is_refund,
           coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.year   = p_year
      and s.branch = any(p_branches)
      and s.date between p_from and p_to
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
  ),
  -- MATERIALIZED so the planner can't push the kind filter below the
  -- DISTINCT, which puts the regexes back on every line.
  kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind
    from (select distinct raw_item from base) d
  ),
  kept as (
    select b.*, k.kind from base b
    join kinds k on k.raw_item = b.raw_item
    where k.kind not in ('non_sale', 'voucher')
  ),
  client_stats as (
    select ckey, max(cname) as cname, sum(total) as total_revenue,
           count(distinct (branch, date)) as visit_count
    from kept group by ckey
  ),
  svc_counts as (
    select ckey, item,
           row_number() over (partition by ckey order by count(*) desc, sum(total) desc) as rn
    from kept
    where kind = 'service' and not is_refund
    group by ckey, item
  )
  select cs.cname, cs.total_revenue, cs.visit_count, sc.item
  from client_stats cs
  left join svc_counts sc on sc.ckey = cs.ckey and sc.rn = 1
  order by cs.total_revenue desc
  limit p_limit;
$$;

-- ── Service Rankings ─────────────────────────────────────────
-- Services only. Refunds net against the service they reverse, both in revenue
-- and in the count. Category comes from the old service_data upload (its most
-- common category per name); a package line ("Full Blonde Package - Cut and
-- Finish 1 HR") borrows the category of the service after the " - ". Names the
-- old upload never saw (services added after May, renamed menu items) show as
-- Uncategorised rather than dropping out.
create or replace function public.get_top_services(p_year integer, p_branches text[], p_from date, p_to date, p_limit integer default 10)
returns table(service_name text, category text, total_revenue numeric, visit_count bigint)
language sql stable as $$
  with raw as (
    select s.item as raw_item, s.total
    from sales_transaction_lines s
    where s.year   = p_year
      and s.branch = any(p_branches)
      and s.date between p_from and p_to
      and nullif(trim(s.item), '') is not null
  ),
  svc_items as materialized (
    select raw_item from (
      select raw_item, public.stl_item_kind(raw_item) as kind
      from (select distinct raw_item from raw offset 0) d  -- offset 0: keeps the filter above the DISTINCT
    ) k
    where kind = 'service'
  ),
  lines as (
    select regexp_replace(r.raw_item, '\s*\(Refund\)\s*$', '', 'i') as item,
           r.raw_item ~* '\(Refund\)\s*$' as is_refund,
           r.total
    from raw r join svc_items i on i.raw_item = r.raw_item
  ),
  ranked as (
    select item, sum(total) as total_revenue,
           sum(case when is_refund then -1 else 1 end) as visit_count
    from lines group by item
    order by total_revenue desc
    limit p_limit
  ),
  cat as (
    select distinct on (service_name) service_name, category
    from service_data
    where category is not null
    group by service_name, category
    order by service_name, count(*) desc
  )
  select r.item,
         coalesce(c1.category, c2.category, 'Uncategorised'),
         r.total_revenue, r.visit_count
  from ranked r
  left join cat c1 on c1.service_name = r.item
  left join cat c2 on c2.service_name = substring(r.item from ' - (.+)$')
  order by r.total_revenue desc;
$$;

-- The Year dropdown now offers 2025 as well.
create or replace function public.get_service_years()
returns table(year smallint)
language sql as $$
  select distinct y from (
    select sd.year::smallint as y from service_data sd
    union
    select ts.year::smallint as y from top_services ts
    union
    select distinct stl.year::smallint as y from sales_transaction_lines stl
  ) u order by y desc;
$$;
