-- Kate, 30 Sep 2026: aims follow the days a stylist actually worked, for everyone and
-- every month. Ashleigh (MC) went on leave on 17 Sep; her page read 45 clients against
-- a full-month aim of 124-130 and said "data up to 16 Sept".
-- Leave = four or more calendar days in a row with no clients, no services and no
-- rostered hours, between her start (or the 1st) and the branch's last day of data.
-- perf_dashboard merges this into numbers: data_to, leave_days, leave [{from,to}].
-- Already applied live.
create or replace function perf_leave(s perf_staff, m1 date, m2 date) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with lim as (
    select coalesce((select max(date) from phorest_staff_daily where branch = s.branch and date between m1 and m2),
                    (select max(date) from phorest_staff_daily where date between m1 and m2)) d_to,
           greatest(m1, coalesce(perf_start_date(s), m1)) d_from
  ), cal as (
    select g::date d from lim, generate_series(lim.d_from, lim.d_to, interval '1 day') g
  ), worked as (
    select date d from phorest_staff_daily where employee_name = s.phorest_name and not is_total
      and date between m1 and m2 and (coalesce(visits,0) > 0 or coalesce(services_ex_vat,0) > 0)
    union select date from branch_staff_daily where upper(trim(staff_name)) = any(s.ledger_names)
      and dept = s.dept and date between m1 and m2 and coalesce(total,0) > 0
    union select date_from from staff_utilisation where staff_name = s.phorest_name
      and not coalesce(is_archived,false) and date_from = date_to and date_from between m1 and m2 and available_hours > 0
  ), off as (
    select d, d - (row_number() over (order by d))::int grp from cal where d not in (select d from worked)
  ), runs as (
    select min(d) a, max(d) b, count(*) n from off group by grp
  )
  select jsonb_build_object(
    'data_to', (select d_to from lim),
    'leave_days', coalesce((select sum(n) from runs where n >= 4), 0),
    'leave', coalesce((select jsonb_agg(jsonb_build_object('from', a, 'to', b) order by a) from runs where n >= 4), '[]'))
$$;

-- perf_dashboard's numbers now end: || perf_reputation(s, m2) || perf_leave(s, m1, m2)
