-- Kate, 27 Oct 2026: Phorest counts a client when a sale has an entry in Payment Type. The report prints the
-- Payment Type once, on the first line of each sale, so a sale with nothing there took no payment: a new client
-- consultation at AED 0, a service rung through at AED 0 (staff and complimentary bookings).
--
--   door_clients, door_clients_daily  Replace the "net above 0" rule of door_clients_no_zero_value_days.sql.
--                                     A client-day counts when she has at least one sale that day with a Payment
--                                     Type entry and at least one line that is not a deposit, balance payment or
--                                     voucher sale. One client, one day, one count, however many sales or staff.
--                                     "Walk-in" names are still left out. Lines rung to the BUSINESS TRS house
--                                     account (retail with no stylist) do not make a client-day on their own:
--                                     Kate, 27 Oct 2026, BUSINESS TRS is not needed in client counts. A client
--                                     who also had a service with a named stylist still counts once.
--                                     A client name with the word Staff in it ("Emma Staff", "Mona Staff") is a
--                                     staff booking, left out (Kate, 27 Oct 2026).
--
-- 17-23 Oct 2026: AQ 57 (Ate Christa 59), KCA 199 (206), MC 68 (69), SAA 212 (213).
-- Run this file as it is; it replaces the live definitions.

create or replace function public.door_clients(p_from date, p_to date)
returns table (branch text, clients bigint, days bigint)
language sql stable security invoker
set search_path = public
as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  ), ln as (
    select l.branch, l.date, lower(trim(l.client_name)) as cn,
           (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
  ), cd as (
    select branch, date, cn, bool_or(is_real and sale_paid) as counts
    from ln group by branch, date, cn
  )
  select cd.branch,
         count(*) filter (where cd.counts) as clients,
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
  ), ln as (
    select l.branch, l.date, lower(trim(l.client_name)) as cn,
           (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
  ), cd as (
    select branch, date, cn, bool_or(is_real and sale_paid) as counts
    from ln group by branch, date, cn
  )
  select cd.branch, cd.date, count(*) filter (where cd.counts) as clients
  from cd
  group by cd.branch, cd.date
$$;
grant execute on function public.door_clients_daily(date, date) to authenticated, anon;
