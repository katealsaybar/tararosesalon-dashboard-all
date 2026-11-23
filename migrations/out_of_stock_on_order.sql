-- Out of Stock, units ON ORDER and not yet arrived (Kate, 23 Nov 2026).
--
-- STATUS: APPLIED on 23 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_on_order), on Kate's word.
-- If the function is ever missing or refuses, the Out of Stock page still opens: it counts on order as 0 and says in one plain line
-- that the on-order counts are not loaded yet (js/out-of-stock.js).
--
-- Why a new function: spend_plan() (the Weekly Product Plan) carries the shelf count, Min, Max and cost, but nothing that says what is
-- already on the way. The orders sit in stock_order_lines (migrations/create_stock_order_lines.sql), whose table policies do not serve
-- the people who may see the Weekly Product Plan. This reads it behind the SAME gate as spend_plan(): public.spend_access() (Level 4 and up,
-- or a spend_viewers row), and refuses everyone else.
--
-- Read only. It changes no data and no table.
--
-- What it returns (jsonb):
--   { "denied": true }                                  when spend_access() says no
--   { "days": 60, "loaded": "<latest loaded_at of the lines it read>",
--     "rows": [ [branch, barcode12, product, units, order_no, order_date], ... ] }     one entry per order LINE, not a total, so the
--                                                       product window on the page can list the real order lines
--   branch   KCA | SAA | MC | AQ
--   barcode12 the first 12 digits only (the Phorest PDF clips it); may be null
--   units    the line's count
--   order_date ISO date (YYYY-MM-DD)
--
-- What counts as "on order": status = 'not_arrived' and no arrived_date, placed in the last 60 days (an older order that never arrived is
-- not on its way any more, it is a gap to chase with the supplier, not stock to count on).

create or replace function public.oos_on_order()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a     jsonb := public.spend_access();
  today date  := (now() at time zone 'Asia/Dubai')::date;
  res   jsonb;
begin
  if not coalesce((a->>'view')::boolean, false) then return jsonb_build_object('denied', true); end if;

  select jsonb_build_object(
    'days', 60,
    'loaded', max(l.loaded_at),
    'rows', coalesce(jsonb_agg(jsonb_build_array(l.branch, nullif(left(l.barcode, 12), ''), l.product, l.count, l.order_no, to_char(l.order_date, 'YYYY-MM-DD'))
                               order by l.branch, l.product, l.order_date, l.order_no), '[]'::jsonb)
  ) into res
  from public.stock_order_lines l
  where l.branch in ('KCA', 'SAA', 'MC', 'AQ')
    and l.status = 'not_arrived'
    and l.arrived_date is null
    and l.order_date >= today - 60
    and coalesce(l.count, 0) > 0;

  return coalesce(res, jsonb_build_object('days', 60, 'loaded', null, 'rows', '[]'::jsonb));
end $$;

revoke all on function public.oos_on_order() from public, anon;
grant execute on function public.oos_on_order() to authenticated;
