-- Clickable figures (Kate, 27 Oct 2026): the clients behind a "clients by staff" number. In the Clients by staff list on the Pulse the ledger count per
-- staff is typed in by reception, so no names are kept with it; the sales lines are the only place a client and the staff who served her sit together.
--
--   drill_staff_clients(p_from, p_to, p_branches, p_employees)
--       one row per client per staff member per day: "clients handled per staff, every client each staff handled, even if she also saw others"
--       (Kate, 27 Oct 2026). A client-day counts for a staff member when that staff member has a line for her on a sale with an entry in Payment
--       Type and the line is not a deposit, balance payment or voucher sale. Walk-in names, any client name with Staff in it and the BUSINESS TRS
--       / BUSINESS (unassigned) house accounts are left out, the same rules as door_clients.
--       p_employees: the staff's Phorest names (null = every staff, for a whole day). p_branches null = every branch.
--       total = rows that count; spend = what she took for those clients on those days. Newest first, at most 5,000 rows.
--   The ledger count and this count are two different counts (typed by reception, against Phorest's lines), so they can differ; the page shows both.
--
-- Client names, so: signed in, Level 3 or above, not a scoped login. Additive.

create or replace function public.drill_staff_clients(p_from date, p_to date, p_branches text[] default null, p_employees text[] default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;

  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  ), ln as (
    select l.branch, l.date, trim(l.employee_name) as emp, lower(trim(l.client_name)) as cn, l.client_name, l.net,
           (k.kind not in ('non_sale', 'voucher')) as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
      and coalesce(l.employee_name, '') !~* '^\s*business\M'
      and coalesce(trim(l.employee_name), '') <> ''
      and (p_employees is null or trim(l.employee_name) = any(p_employees))
  ), cd as (
    select branch, date, emp, cn, min(client_name) as client,
           bool_or(is_real and sale_paid) as counts,
           coalesce(sum(net) filter (where is_real), 0) as spend
    from ln group by branch, date, emp, cn
  ), hit as (
    select * from cd where counts
  ), shown as (
    select * from hit order by date desc, branch, emp, cn limit 5000
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'spend', (select coalesce(sum(spend), 0) from hit),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'e', emp, 'c', client, 's', round(spend, 2)) order by date desc, branch, emp, cn) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.drill_staff_clients(date, date, text[], text[]) from public, anon;
grant execute on function public.drill_staff_clients(date, date, text[], text[]) to authenticated;
