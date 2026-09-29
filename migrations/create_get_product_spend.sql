-- get_product_spend: the Products page in one call. 29 Sep 2026.
-- Reads stock_order_lines (see create_stock_order_lines.sql). Spend is dated
-- by arrived_date, the day the stock landed, and only arrived lines count;
-- what is still on order is reported separately, as it stands today.
-- Security invoker, same as get_top_clients: the table's own policies apply.
--
-- Returns jsonb:
--   weeks     [{week_start, branch, retail, professional, lines}]   Monday-start
--   products  top 15 by spend in the window [{product, brand, type, units, spend}]
--   unmatched [{product, branch, units, lines}] arrived lines with no cost
--   on_order  {lines, spend} not yet arrived, ordered in the last 90 days
--             (older ones are orders that never came, 24 lines at backfill)
--   priced_on the Stock List date the costs come from

CREATE OR REPLACE FUNCTION public.get_product_spend(p_branches text[], p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  with w as (
    select * from stock_order_lines
     where branch = any(p_branches) and status = 'arrived'
       and arrived_date between p_from and p_to
  )
  select jsonb_build_object(
    'weeks', coalesce((
      select jsonb_agg(x order by x.week_start, x.branch) from (
        select date_trunc('week', arrived_date)::date as week_start, branch,
               round(coalesce(sum(spend) filter (where type = 'retail'), 0), 2) as retail,
               round(coalesce(sum(spend) filter (where type = 'professional'), 0), 2) as professional,
               count(*) as lines
          from w group by 1, 2) x), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(x order by x.spend desc) from (
        select product, max(brand) as brand, max(type) as type,
               sum(count) as units, round(sum(spend), 2) as spend
          from w where spend is not null
         group by product order by 5 desc limit 15) x), '[]'::jsonb),
    'unmatched', coalesce((
      select jsonb_agg(x order by x.lines desc) from (
        select product, branch, sum(count) as units, count(*) as lines
          from w where type = 'unmatched' group by 1, 2) x), '[]'::jsonb),
    'on_order', (
      select jsonb_build_object('lines', count(*), 'spend', round(coalesce(sum(spend), 0), 2))
        from stock_order_lines where branch = any(p_branches) and status = 'not_arrived'
           and order_date >= current_date - 90),
    'priced_on', (select max(priced_on) from stock_order_lines)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_product_spend(text[], date, date) TO anon, authenticated;
