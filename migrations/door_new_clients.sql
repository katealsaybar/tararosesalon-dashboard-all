-- Kate, 27 Oct 2026: new clients through the door.
--
-- A new client is counted on the day of her first visit, by the same visit rule as clients through the door
-- (a sale with an entry in Payment Type, not a deposit, balance payment or voucher, not rung to BUSINESS TRS,
-- no walk-ins, no names with the word Staff). She counts once, on her first such day, at the branch she came to.
--
-- The sales lines start on 23 May 2021, so a client who is in the lines for the first time may simply be
-- returning after a long gap. Her Phorest profile settles it (Clients > clientSince, phorest_client_since,
-- pulled by "phorest data export/new clients/pull_client_since.py"): a profile created before the first sales
-- line means she is not new. No profile found for the name counts as new.
--
--   door_first_visits    materialized view, one row per client name: first_date, first_branch, new_ok. Holds names,
--                        so nothing but the functions below can read it. Refreshed hourly at minute 20.
--   door_new_daily       new clients by branch and day (security definer, no names leave it).
--   door_clients         gets a new_clients column; door_clients_daily gets new_clients too.
--
-- 17-23 Oct 2026 new through the door: AQ 14, KCA 18, MC 13, SAA 24 (first visit in the week and a profile
-- created within 90 days; see the notes in the project log for the other readings tried).
-- Run this file as it is, then select refresh materialized view public.door_first_visits (the cron does it hourly).

create materialized view if not exists public.door_first_visits as
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
), fv as (
  select cn, min(date) as first_date from cd group by cn
), fb as (
  select distinct on (cd.cn) cd.cn, cd.branch as first_branch
  from cd join fv on fv.cn = cd.cn and fv.first_date = cd.date
  order by cd.cn, cd.branch
), cs as (
  select name_key, min(since_date) as since_date from public.phorest_client_since group by name_key
)
select fv.cn, fv.first_date, fb.first_branch,
       (cs.since_date is null or cs.since_date >= (select min(date) from public.sales_transaction_lines)) as new_ok
from fv
join fb using (cn)
left join cs on cs.name_key = fv.cn;

create unique index if not exists door_first_visits_cn on public.door_first_visits (cn);
create index if not exists door_first_visits_date on public.door_first_visits (first_date, first_branch);
revoke all on public.door_first_visits from public, anon, authenticated;

create or replace function public.door_new_daily(p_from date, p_to date)
returns table (branch text, date date, new_clients bigint)
language sql stable security definer
set search_path = public
as $$
  select f.first_branch, f.first_date, count(*)
  from public.door_first_visits f
  where f.new_ok and f.first_date between p_from and p_to
  group by f.first_branch, f.first_date
$$;
grant execute on function public.door_new_daily(date, date) to authenticated, anon;

drop function if exists public.door_clients(date, date);
create function public.door_clients(p_from date, p_to date)
returns table (branch text, clients bigint, days bigint, new_clients bigint)
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
  )
  select cd.branch,
         count(*) filter (where cd.counts) as clients,
         count(distinct cd.date) as days,
         coalesce(max(nw.new_clients), 0)::bigint as new_clients
  from cd
  left join nw on nw.branch = cd.branch
  group by cd.branch
$$;
grant execute on function public.door_clients(date, date) to authenticated, anon;

drop function if exists public.door_clients_daily(date, date);
create function public.door_clients_daily(p_from date, p_to date)
returns table (branch text, date date, clients bigint, new_clients bigint)
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
         coalesce(max(n.new_clients), 0)::bigint as new_clients
  from cd
  left join public.door_new_daily(p_from, p_to) n on n.branch = cd.branch and n.date = cd.date
  group by cd.branch, cd.date
$$;
grant execute on function public.door_clients_daily(date, date) to authenticated, anon;

-- Hourly refresh, at minute 20 (after lv_refresh at 14):
-- select cron.schedule('door-first-visits-hourly', '20 * * * *', 'refresh materialized view concurrently public.door_first_visits');
