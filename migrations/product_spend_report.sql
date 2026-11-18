-- Kate, 18 Nov 2026: Products, "Top products by spend" rebuilt from the local mockup (docs/mockups/top-products-by-spend.html in the cowork repo).
-- Three read-only functions over stock_order_lines (the table get_product_spend already reads) and sales_transaction_lines:
--   product_spend_rows    every product that arrived in the window, biggest spend first, with units, order lines, months bought, spend per salon, and the
--                         total of ALL stock by team and type (so a share is a true share even when the list is cut at p_limit).
--   product_stock_lines   the order lines of ONE product (order no, ordered, arrived, units, cost a unit, spend): the Deliveries window and the last step under it.
--   product_sales_lines   the till lines of ONE product by item name, with the client: the Clients window. Client names are Level 3 and up (database level 2),
--                         like drill_service_clients; below that the call raises and the page shows a plain note.
-- Same rules as get_product_spend: only stock that has ARRIVED counts, dated by the day it arrived, priced at the Stock List cost, lines with no cost are left out.
-- Sales lines: refunds and negative lines are left out, like drill_service_clients. One sales line is one item sold.
-- Security invoker, so the table's own policies apply (stock_order_lines: dashboard users read). Nothing is written.
-- NOT APPLIED when this file was written: the page keeps the old top 15 note until it is (Kate's word first).

create or replace function public.product_spend_rows(p_branches text[], p_from date, p_to date, p_limit int default 2000)
returns jsonb
language sql stable
set search_path to 'public'
as $function$
  with w as (
    select product, brand, type, dept, branch, arrived_date, count as units, spend
      from stock_order_lines
     where branch = any(p_branches) and status = 'arrived' and arrived_date between p_from and p_to and spend is not null
  ), p as (
    select product, max(brand) as brand, max(type) as type, max(dept) as dept, sum(units) as units, round(sum(spend), 2) as spend,
           count(*)::int as lines, count(distinct date_trunc('month', arrived_date))::int as months,
           jsonb_build_object('SAA', round(coalesce(sum(spend) filter (where branch = 'SAA'), 0), 2), 'KCA', round(coalesce(sum(spend) filter (where branch = 'KCA'), 0), 2),
                              'MC',  round(coalesce(sum(spend) filter (where branch = 'MC'), 0), 2),  'AQ',  round(coalesce(sum(spend) filter (where branch = 'AQ'), 0), 2)) as br
      from w group by product
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.spend desc) from (select * from p order by spend desc limit greatest(p_limit, 1)) x), '[]'::jsonb),
    'n_products', (select count(*) from p),
    'totals', coalesce((select jsonb_agg(jsonb_build_object('dept', dept, 'type', type, 'spend', s)) from (select dept, type, round(sum(spend), 2) as s from w group by 1, 2) t), '[]'::jsonb),
    'priced_on', (select max(priced_on) from stock_order_lines)
  );
$function$;

create or replace function public.product_stock_lines(p_branches text[], p_from date, p_to date, p_product text, p_limit int default 3000)
returns jsonb
language sql stable
set search_path to 'public'
as $function$
  with w as (
    select branch, order_no, order_date, arrived_date, count as units, unit_cost, spend
      from stock_order_lines
     where branch = any(p_branches) and status = 'arrived' and arrived_date between p_from and p_to and spend is not null and product = p_product
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.arrived_date desc, x.order_no) from (select * from w order by arrived_date desc, order_no limit greatest(p_limit, 1)) x), '[]'::jsonb),
    'n', (select count(*) from w)
  );
$function$;

create or replace function public.product_sales_lines(p_branches text[], p_from date, p_to date, p_item text, p_limit int default 3000)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Client lists are for Level 3 and up';
  end if;
  with l as (
    select s.client_name, s.client_id, s.branch, s.date, coalesce(s.net, 0) as net
      from sales_transaction_lines s
     where s.branch = any(p_branches) and s.date between p_from and p_to
       and lower(trim(s.item)) = lower(trim(p_item))
       and coalesce(s.net, 0) >= 0 and coalesce(s.item, '') !~* '\(Refund\)\s*$'
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.date desc) from (select client_name, client_id, branch, date, round(net, 2) as net from l order by date desc limit greatest(p_limit, 1)) x), '[]'::jsonb),
    'n', (select count(*) from l)
  ) into out;
  return out;
end $function$;

revoke all on function public.product_spend_rows(text[], date, date, int) from public, anon;
revoke all on function public.product_stock_lines(text[], date, date, text, int) from public, anon;
revoke all on function public.product_sales_lines(text[], date, date, text, int) from public, anon;
grant execute on function public.product_spend_rows(text[], date, date, int) to authenticated;
grant execute on function public.product_stock_lines(text[], date, date, text, int) to authenticated;
grant execute on function public.product_sales_lines(text[], date, date, text, int) to authenticated;
