-- Kate, 28 Oct 2026: "says 109 but when you open it says 121 clients" (Pulse > Clients by staff, Mona Soba, Saadiyat, September 2026).
-- The figure on a staff row is the branch ledger (typed by reception, the card's number and the targets'), the window behind it lists Phorest's sales lines, and no list can ever
-- equal a typed count. The row now keeps the ledger figure plain and gets a second column, Phorest clients, that opens the list and always equals it.
-- staff_clients_counts is drill_staff_clients (same rules, same ckey grouping, same guards: signed in, Level 3 and above, not a scoped login) counted instead of listed:
-- one row per branch and staff name (grain 'none'), per day ('day') or per month ('month'). pulse-drill.js (addPhClients) sums the rows that belong to each list row.
-- If drill_staff_clients ever changes its rules, change this function the same way: a Phorest clients figure must equal its list.

create or replace function public.staff_clients_counts(p_from date, p_to date, p_branches text[] default null, p_grain text default 'none')
returns table(ob text, oe text, od date, n bigint)
language plpgsql stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  return query
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  ), ln as (
    select l.branch, l.date, trim(l.employee_name) as emp, l.ckey as cn,
           (k.kind not in ('non_sale', 'voucher')) as is_real,
           (bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id)  and l.day_spend_ok) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
      and coalesce(l.employee_name, '') !~* '^\s*business\M'
      and coalesce(trim(l.employee_name), '') <> ''
  ), cd as (
    select ln.branch, ln.date, ln.emp, ln.cn, bool_or(ln.is_real and ln.sale_paid) as counts
    from ln group by ln.branch, ln.date, ln.emp, ln.cn
  )
  select cd.branch, cd.emp,
         case p_grain when 'day' then cd.date when 'month' then date_trunc('month', cd.date)::date end,
         count(*)::bigint
  from cd where cd.counts
  group by 1, 2, 3;
end $function$;
revoke all on function public.staff_clients_counts(date, date, text[], text) from public, anon;
grant execute on function public.staff_clients_counts(date, date, text[], text) to authenticated;
