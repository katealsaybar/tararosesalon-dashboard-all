-- Kate, 27 Oct 2026: stylist conversion, retention and colour share (the 1:1 numbers, perf_clients and the
-- perf_client_cache it feeds) follow the same visit rule as clients through the door
-- (door_clients_payment_entry.sql, last_visit_count_rules.sql).
--
--   A visit is a client-day with a sale that has an entry in Payment Type, on a line that is not a deposit,
--   balance payment or voucher sale and was not rung to BUSINESS TRS. Client names with the word Staff in them
--   and Walk-in names are left out. A client who saw two stylists still counts for each of them (handled per
--   staff), and her "next visit" is her next visit with anyone.
--
-- perf_clients keeps its signature, security and settings. The cache is not refreshed here: the next
-- refresh_perf_client_cache() run (or the nightly job) writes the new numbers.
-- Run this file as it is; it replaces the live definition.

create or replace function public.perf_clients(s perf_staff, d1 date, d2 date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with asof as (
    select least(d2, (select max(date) from sales_transaction_lines)) as d
  ), cl as materialized (   -- the clients this stylist has handled
    select distinct client_name from sales_transaction_lines
    where employee_name = s.phorest_name and client_name is not null and client_name <> ''
      and client_name !~* '\mstaff\M' and client_name !~* '^\s*walk[\s-]*in\M'
      and date <= (select d from asof)
  ), b as materialized (
    select l.client_name, l.date, l.employee_name, l.item,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as paid
    from sales_transaction_lines l
    where l.client_name in (select client_name from cl) and l.date <= (select d from asof)
  ), kinds as materialized (   -- the kind is worked out once per distinct item, not once per line
    select it, public.stl_item_kind(it) as kind from (select distinct coalesce(item, '') as it from b) d
  ), vl as materialized (   -- visit lines
    select b.client_name, b.date, b.employee_name, b.item
    from b join kinds k on k.it = coalesce(b.item, '')
    where b.paid and coalesce(b.employee_name, '') !~* '^\s*business\M'
      and k.kind not in ('non_sale', 'voucher')
  ), mine as (   -- this stylist's visit days
    select client_name, date, bool_or(perf_is_colour(item)) is_col
    from vl
    where employee_name = s.phorest_name
    group by client_name, date
  ), days as (   -- every visit day of her clients (with anyone), with that client's next visit day
    select client_name, date,
           lead(date) over (partition by client_name order by date) next_date,
           row_number() over (partition by client_name order by date) visit_no
    from (select distinct client_name, date from vl) x
  ), colour as (
    select count(*) visits, count(*) filter (where is_col) col
    from mine where date between d1 and d2
  ), cohort as (   -- brand-new clients whose first visit was with this stylist
    select d.client_name, d.date first_date, d.next_date
    from days d join mine m on m.client_name = d.client_name and m.date = d.date
    where d.visit_no = 1
      and d.date between (select d from asof) - 179 and (select d from asof) - 90
  ), conv as (
    select count(*) n,
           count(*) filter (where next_date <= first_date + 84) back12,
           count(*) filter (where next_date - first_date <= 28) w4,
           count(*) filter (where next_date - first_date between 29 and 42) w6,
           count(*) filter (where next_date - first_date between 43 and 56) w8,
           count(*) filter (where next_date - first_date between 57 and 84) w12,
           count(*) filter (where next_date is null or next_date - first_date > 84) not_yet
    from cohort
  ), earlier as (   -- existing clients she saw in the earlier window
    select distinct m.client_name
    from mine m join days d on d.client_name = m.client_name and d.date = m.date
    where d.visit_no > 1
      and m.date between (select d from asof) - 179 and (select d from asof) - 90
  ), ret as (
    select count(*) n,
           count(*) filter (where exists (
             select 1 from mine m2 where m2.client_name = e.client_name
               and m2.date > (select d from asof) - 90 and m2.date <= (select d from asof))) back
    from earlier e
  )
  select jsonb_build_object(
    'colour_pct',       case when colour.visits > 0 then round(100.0 * colour.col / colour.visits, 1) end,
    'colour_visits',    colour.col,
    'conversion_pct',   case when conv.n > 0 then round(100.0 * conv.back12 / conv.n, 1) end,
    'conversion_n',     conv.n,
    'conversion_weeks', jsonb_build_object('w4', conv.w4, 'w6', conv.w6, 'w8', conv.w8, 'w12', conv.w12, 'not_yet', conv.not_yet),
    'retention_pct',    case when ret.n > 0 then round(100.0 * ret.back / ret.n, 1) end,
    'retention_n',      ret.n,
    'asof',             (select d from asof)
  )
  from colour, conv, ret
$function$;
