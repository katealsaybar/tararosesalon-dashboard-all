-- Kate, 28 Oct 2026: "says 109 but when you open it says 121 clients" (Pulse > Clients by staff, Mona Soba, Saadiyat, September 2026).
-- The figure on a staff row is the branch ledger (typed by reception, the card's number and the targets'), the window behind it lists Phorest's sales lines, and no list can ever
-- equal a typed count. The row now keeps the ledger figure plain and gets a second column, Phorest clients, that opens the list and always equals it.
-- staff_clients_counts is drill_staff_clients (same rules, same ckey grouping, same guards: signed in, Level 3 and above, not a scoped login) counted instead of listed:
-- one row per branch and staff name (grain 'none'), per day ('day') or per month ('month'). pulse-drill.js (addPhClients) sums the rows that belong to each list row.
-- Kate, 28 Oct 2026 (later the same day): "nagsama ka nanaman ng 0". A client-day worth AED 0 to that staff member (redo, a consultation, a complimentary service) is not a visit,
-- the rule clients through the door already follows, with the AED 0 days kept on their own tab. drill_staff_clients now returns total and spend for the days above AED 0,
-- 'zero' (how many days are AED 0) and 'z' on each row; staff_clients_counts counts only the days above AED 0. The window has an AED 0 spend tab.
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
    select l.branch, l.date, trim(l.employee_name) as emp, l.ckey as cn, l.net,
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
    select ln.branch, ln.date, ln.emp, ln.cn, bool_or(ln.is_real and ln.sale_paid) as counts, coalesce(sum(ln.net) filter (where ln.is_real), 0) as spend
    from ln group by ln.branch, ln.date, ln.emp, ln.cn
  )
  select cd.branch, cd.emp,
         case p_grain when 'day' then cd.date when 'month' then date_trunc('month', cd.date)::date end,
         count(*)::bigint
  from cd where cd.counts and cd.spend > 0
  group by 1, 2, 3;
end $function$;
revoke all on function public.staff_clients_counts(date, date, text[], text) from public, anon;
grant execute on function public.staff_clients_counts(date, date, text[], text) to authenticated;

-- drill_staff_clients, guarded replace on the live definition:
do $do$
declare d text;
begin
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'drill_staff_clients' and pronamespace = 'public'::regnamespace;
  if position('''total'', (select count(*) from hit),' in d) = 0
     or position('''spend'', (select coalesce(sum(spend), 0) from hit),' in d) = 0
     or position('''k'', cn, ''s'', round(spend, 2))' in d) = 0 then raise exception 'pattern not found in drill_staff_clients'; end if;
  d := replace(d, '''total'', (select count(*) from hit),', '''total'', (select count(*) from hit where spend > 0), ''zero'', (select count(*) from hit where spend <= 0),');
  d := replace(d, '''spend'', (select coalesce(sum(spend), 0) from hit),', '''spend'', (select coalesce(sum(spend), 0) from hit where spend > 0),');
  d := replace(d, '''k'', cn, ''s'', round(spend, 2))', '''k'', cn, ''s'', round(spend, 2), ''z'', spend <= 0)');
  execute d;
end $do$;
