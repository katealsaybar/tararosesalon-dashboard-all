-- Kate, 27 Oct 2026: a client-day worth AED 0 is not a visit. Ate Christa's weekly management report
-- (17-23 Oct) counts 59 clients at Al Quoz; clients through the door said 70. The 11 extra are client-days
-- whose lines (after deposits, balance payments and vouchers are left out) add up to net 0 or less: new
-- client consultations at 0, and services rung through at 0 (staff and complimentary bookings).
--
--   door_clients, door_clients_daily  A client-day now counts only when her lines (deposit, balance payment
--                                     and voucher-sale lines still left out, "Walk-in" names still left out)
--                                     add up to a net above zero. A retail-only buyer still counts.
--
-- 17-23 Oct 2026, Al Quoz: 70 to 59 (Ate Christa 59). Khalifa City A 215 to 197, Motor City 76 to 67,
-- Saadiyat 233 to 211. Khalifa City A and Saadiyat are still 9 and 2 under Ate Christa's sheet: traced
-- separately.
--
-- Run this file as it is; it replaces the live definitions.

create or replace function public.door_clients(p_from date, p_to date)
returns table (branch text, clients bigint, days bigint)
language sql stable security invoker
set search_path = public
as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  ), cd as (
    select l.branch, l.date, lower(trim(l.client_name)) as cn, sum(coalesce(l.net, 0)) as net
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and k.kind not in ('non_sale', 'voucher')
    group by l.branch, l.date, lower(trim(l.client_name))
  )
  select cd.branch,
         count(*) filter (where cd.net > 0) as clients,
         count(distinct cd.date) as days
  from cd
  group by cd.branch
$$;
grant execute on function public.door_clients(date, date) to authenticated, anon;

create or replace function public.door_clients_daily(p_from date, p_to date)
returns table (branch text, date date, clients bigint)
language sql stable security invoker
set search_path = public
as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  ), cd as (
    select l.branch, l.date, lower(trim(l.client_name)) as cn, sum(coalesce(l.net, 0)) as net
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and k.kind not in ('non_sale', 'voucher')
    group by l.branch, l.date, lower(trim(l.client_name))
  )
  select cd.branch, cd.date, count(*) filter (where cd.net > 0) as clients
  from cd
  group by cd.branch, cd.date
$$;
grant execute on function public.door_clients_daily(date, date) to authenticated, anon;
