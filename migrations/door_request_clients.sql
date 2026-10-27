-- Kate, 27 Oct 2026: request clients through the door.
--
-- A counted door client (same visit rule as door_clients_payment_entry.sql: a paid sale, no deposit, voucher,
-- BUSINESS TRS, walk-in or Staff name; one per client per day) is a request client when she asked for her stylist
-- on that visit: Phorest's appointment carries staffRequested. phorest_appt_requests holds that flag per branch, day
-- and client name (PAID appointments only), pulled by "phorest data export/new clients/pull_appt_requests.py"
-- (daily, Step 11 of daily-reports, and backfilled from 2021).
--
--   door_request_days     materialized view: the counted client-days that have a requested appointment (names, so
--                         nothing but the function below can read it). Refreshed hourly at minute 25.
--   door_request_daily    request clients by branch and day (security definer, no names leave it).
--   door_clients          gets a request_clients column; door_clients_daily gets request_clients too.
--
-- A day counts only once its appointments are pulled, so today and yesterday read low until the daily pull has run.
-- Run this file as it is, after phorest_appt_requests has data.

create materialized view if not exists public.door_request_days as
with k as materialized (
  select ik, public.stl_item_kind(ik) as kind
  from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines) d
), ln as (
  select l.branch, l.date, lower(regexp_replace(trim(l.client_name), '\s+', ' ', 'g')) as cn,
         (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
         bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
  from public.sales_transaction_lines l
  join k on k.ik = coalesce(l.item, '')
  where coalesce(trim(l.client_name), '') <> ''
    and l.client_name !~* '^\s*walk[\s-]*in\M'
    and l.client_name !~* '\mstaff\M'
), cd as (
  select branch, date, cn from ln group by branch, date, cn having bool_or(is_real and sale_paid)
)
select cd.branch, cd.date, cd.cn
from cd
join public.phorest_appt_requests r on r.branch = cd.branch and r.date = cd.date and r.name_key = cd.cn and r.requested;

create unique index if not exists door_request_days_key on public.door_request_days (branch, date, cn);
revoke all on public.door_request_days from public, anon, authenticated;

create or replace function public.door_request_daily(p_from date, p_to date)
returns table (branch text, date date, request_clients bigint)
language sql stable security definer
set search_path = public
as $$
  select d.branch, d.date, count(*)
  from public.door_request_days d
  where d.date between p_from and p_to
  group by d.branch, d.date
$$;
grant execute on function public.door_request_daily(date, date) to authenticated, anon;

drop function if exists public.door_clients(date, date);
create function public.door_clients(p_from date, p_to date)
returns table (branch text, clients bigint, days bigint, new_clients bigint, request_clients bigint)
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
  ), nw as (
    select n.branch, sum(n.new_clients)::bigint as new_clients from public.door_new_daily(p_from, p_to) n group by n.branch
  ), rq as (
    select q.branch, sum(q.request_clients)::bigint as request_clients from public.door_request_daily(p_from, p_to) q group by q.branch
  )
  select cd.branch,
         count(*) filter (where cd.counts) as clients,
         count(distinct cd.date) as days,
         coalesce(max(nw.new_clients), 0)::bigint as new_clients,
         coalesce(max(rq.request_clients), 0)::bigint as request_clients
  from cd
  left join nw on nw.branch = cd.branch
  left join rq on rq.branch = cd.branch
  group by cd.branch
$$;
grant execute on function public.door_clients(date, date) to authenticated, anon;

drop function if exists public.door_clients_daily(date, date);
create function public.door_clients_daily(p_from date, p_to date)
returns table (branch text, date date, clients bigint, new_clients bigint, request_clients bigint)
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
  select cd.branch, cd.date, count(*) filter (where cd.counts) as clients,
         coalesce(max(n.new_clients), 0)::bigint as new_clients,
         coalesce(max(q.request_clients), 0)::bigint as request_clients
  from cd
  left join public.door_new_daily(p_from, p_to) n on n.branch = cd.branch and n.date = cd.date
  left join public.door_request_daily(p_from, p_to) q on q.branch = cd.branch and q.date = cd.date
  group by cd.branch, cd.date
$$;
grant execute on function public.door_clients_daily(date, date) to authenticated, anon;

-- Hourly refresh, at minute 25:
-- select cron.schedule('door-request-days-hourly', '25 * * * *', 'refresh materialized view concurrently public.door_request_days');
