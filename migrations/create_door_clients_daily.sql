-- SUPERSEDED 8 Oct 2026 by door_and_last_visit_no_deposit_days.sql (deposit, balance-payment and voucher-only days and walk-in names no longer count). Do not re-run this file.
-- Clients through the door, per branch per day (Kate, 1 Oct 2026).
--
-- door_clients() (create_door_clients.sql) gives one count per branch for a whole
-- window, which is what the Clients card needs. The Pulse's Revenue vs Clients
-- chart draws a line a day (or a week), so it needs the same count cut by day.
-- Same rule: one client, one visit a day, however many staff she saw, retail-only
-- buyers included. A week's door count is the sum of its days, which is right,
-- because a client who came on Monday and again on Friday came through the door
-- twice.
--
-- SECURITY INVOKER, like door_clients(): the caller's own RLS applies.
create or replace function public.door_clients_daily(p_from date, p_to date)
returns table (branch text, date date, clients bigint)
language sql stable security invoker
set search_path = public
as $$
  select l.branch, l.date,
         count(distinct lower(trim(l.client_name))) as clients
  from sales_transaction_lines l
  where l.date between p_from and p_to
    and coalesce(trim(l.client_name), '') <> ''
  group by l.branch, l.date
$$;

grant execute on function public.door_clients_daily(date, date) to authenticated, anon;
