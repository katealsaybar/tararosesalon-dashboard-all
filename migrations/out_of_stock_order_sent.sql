-- APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_order_sent). Checked in a rolled-back run: confirm, mark sent, mark sent again (already), cancel after sent (refused).
-- Out of Stock: Mark as sent (Kate, 26 Nov 2026, step 3 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md).
-- The page opens the standard email as a Gmail draft and a person presses Send; they then press Mark as sent, which turns the order from confirmed to sent
-- (sent_by, sent_at, one line in history). A sent order can no longer be cancelled on the page (oos_order_cancel already refuses anything but confirmed).
-- oos_orders_get() now also returns sent_by and sent_at.

alter table public.oos_supplier_orders add column if not exists sent_by text, add column if not exists sent_at timestamptz;

create or replace function public.oos_order_mark_sent(p_order_no text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare who text := coalesce(auth.jwt() ->> 'email', 'unknown'); st text;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  select status into st from public.oos_supplier_orders where order_no = p_order_no;
  if st is null then raise exception 'no such order'; end if;
  if st = 'sent' then return jsonb_build_object('ok', true, 'order_no', p_order_no, 'already', true); end if;
  if st <> 'confirmed' then return jsonb_build_object('refused', true, 'status', st); end if;
  update public.oos_supplier_orders
     set status = 'sent', sent_by = who, sent_at = now(),
         history = history || jsonb_build_array(jsonb_build_object('status', 'sent', 'by', who, 'at', now()))
   where order_no = p_order_no;
  return jsonb_build_object('ok', true, 'order_no', p_order_no);
end $$;
revoke all on function public.oos_order_mark_sent(text) from public, anon;
grant execute on function public.oos_order_mark_sent(text) to authenticated;

create or replace function public.oos_orders_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('day', public.oos_order_day(),
    'can_edit', coalesce((public.spend_access() ->> 'edit')::boolean, false),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('order_no', o.order_no, 'supplier', o.supplier, 'branch', o.branch, 'day', o.order_day, 'status', o.status,
                        'n_lines', o.n_lines, 'n_units', o.n_units, 'total_aed', o.total_aed, 'by', o.confirmed_by, 'at', o.confirmed_at,
                        'sent_by', o.sent_by, 'sent_at', o.sent_at) order by o.confirmed_at desc)
                        from public.oos_supplier_orders o where o.confirmed_at > now() - interval '45 days'), '[]'::jsonb));
end $$;
revoke all on function public.oos_orders_get() from public, anon;
grant execute on function public.oos_orders_get() to authenticated;
