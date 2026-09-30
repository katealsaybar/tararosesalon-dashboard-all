-- stock_order_lines.dept: Hair or Beauty, for the Products page's All / Hair /
-- Beauty toggle. Kate, 30 Sep 2026.
--
-- Phorest's stock reports carry no department, so it is read off the brand
-- (the Stock List's Brand heading the parser copies on to each line). The
-- product name is read only for unmatched lines with no brand (the Matis "REP"
-- range, sheet masks, peels): on a branded line it misfiled Schwarzkopf's
-- Skin Protect and Viart's hyaluronic hair range as Beauty. Beauty is
-- skin (Matis, Image, PCA, Xitronix), lashes (Nouveau, IOlite), nails (OPI,
-- Kinetics, Alessandro) and LUK lip balm; everything else is Hair, including
-- the Pure Blue shower filters and the Cloud Nine irons. Madi International is
-- OPI's distributor, Madi Cloudnine is the irons, so only the first is Beauty.
--
-- A generated column, so push_stock_orders.py needs no change and a new beauty
-- brand is one edit here: rerun the drop and add below with it in the list.

ALTER TABLE stock_order_lines DROP COLUMN IF EXISTS dept;
ALTER TABLE stock_order_lines ADD COLUMN dept text
  GENERATED ALWAYS AS (
    CASE WHEN brand ~* '(matis|image skin|pca skin|xitronix|nouveau|iolite|kinetics|alessandro|madi international|^luk\M|luke''s food)'
           OR (brand IS NULL AND product ~* '(\mopi\M|\mlash|\mnail|cuticle|facial|^rep\M|sheet mask|\mpeel\M|nutrient toner|\mspf|ormedic|prevention\+|hyaluronic|\mskin\M|\meyes\M|papaya mask|hydrating mask)')
         THEN 'Beauty' ELSE 'Hair' END
  ) STORED;

-- The page now passes p_dept; drop the three-argument version so the call
-- can't resolve to it.
DROP FUNCTION IF EXISTS public.get_product_spend(text[], date, date);

CREATE OR REPLACE FUNCTION public.get_product_spend(p_branches text[], p_from date, p_to date, p_dept text DEFAULT 'all')
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  with w as (
    select * from stock_order_lines
     where branch = any(p_branches) and status = 'arrived'
       and arrived_date between p_from and p_to
       and (p_dept = 'all' or dept = p_dept)
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
           and order_date >= current_date - 90
           and (p_dept = 'all' or dept = p_dept)),
    'priced_on', (select max(priced_on) from stock_order_lines)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_product_spend(text[], date, date, text) TO anon, authenticated;
