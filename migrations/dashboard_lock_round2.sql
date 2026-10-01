-- Round 2 of the dashboard lock (Kate, 1 Oct 2026), applied live. The Phorest pushers now
-- write through push_delete / push_insert with their own pass (push_passes.sql), so the
-- public key comes off the last six tables. Each keeps dashboard_users_read + the owner's
-- write rules. After this only the MediCube page's event_allocations / event_allocation_log
-- answer to the public key, on purpose.
do $$
declare t text;
begin
  foreach t in array array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
                           'staff_utilisation','financial_totals','stock_order_lines']
  loop
    execute format('drop policy if exists anon_all on public.%I', t);
  end loop;
end $$;
