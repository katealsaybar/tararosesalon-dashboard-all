-- Out of Stock: Reset one salon's order (Kate, 27 Nov 2026: "walang reset ng order per branch?", "kasama lang ang qty at ticks").
--
-- oos_order_reset(p_branch)  deletes, for the CURRENT order day (oos_order_day(), the Monday the order goes out) and ONE salon, every row of oos_order_edits: the quantities typed in and
--                            the products ticked off. The page then shows the calculated order again for that salon. Nothing else is touched: the shelf counts and Verified (oos_stock_counts),
--                            the other salons, other order days, the confirmed supplier orders (they have to be cancelled on their own) and the bulk order batch (the page rewrites its locked numbers).
-- Whoever may edit the Weekly Product Plan (spend_access edit), the same gate as the amounts and ticks themselves. A row key starts with the salon code in lower case: saa|brand|product|barcode.
-- Returns { ok, day, cleared } so the page can say how many were put back.
--
-- Not applied until Kate says so.

create or replace function public.oos_order_reset(p_branch text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dy date := public.oos_order_day(); b text := upper(btrim(coalesce(p_branch, ''))); n int;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if b not in ('KCA', 'SAA', 'MC', 'AQ') then raise exception 'branch must be KCA, SAA, MC or AQ'; end if;
  delete from public.oos_order_edits where order_day = dy and row_key like lower(b) || '|%';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'day', dy, 'cleared', n);
end $$;
revoke all on function public.oos_order_reset(text) from public, anon;
grant execute on function public.oos_order_reset(text) to authenticated;
