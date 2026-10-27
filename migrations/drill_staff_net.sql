-- Clickable figures (Kate, 27 Oct 2026: "net take should also be clickable ... basta lahat ng may values"): the lines behind a staff member's Net take.
-- Net take is services plus retail, so this is every sales line that is not a deposit, balance payment or voucher sale, on a sale with an entry in
-- Payment Type, rung to a named staff member (not BUSINESS TRS), refunds netted off. Same shape as drill_staff_services / drill_staff_retail:
-- d date, b branch, e staff, c client, i item, r refund, n net; total = lines, net = the sum. The ledger's net take is typed by reception, so the window
-- shows both. p_employees null = every staff (a whole day), and then the lines rung to BUSINESS TRS (the retail with no stylist) count too, as the day's Net take does. Level 3 and above, not a scoped login, read only. Additive.

create or replace function public.drill_staff_net(p_from date, p_to date, p_branches text[] default null, p_employees text[] default null)
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
    select l.branch, l.date, case when coalesce(l.employee_name, '') ~* '^\s*business\M' or coalesce(trim(l.employee_name), '') = '' then 'Retail with no stylist' else trim(l.employee_name) end as emp, coalesce(nullif(trim(l.client_name), ''), 'No name') as client, l.item, l.net,
           (k.kind not in ('non_sale', 'voucher')) as is_service,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and (p_employees is null or (coalesce(trim(l.employee_name), '') <> '' and coalesce(l.employee_name, '') !~* '^\s*business\M'))   -- a whole day (no one named) also counts what was rung to nobody
      and (p_employees is null or trim(l.employee_name) = any(p_employees))
  ), hit as (
    select * from ln where is_service and sale_paid
  ), shown as (
    select * from hit order by date desc, branch, emp, client, item limit 5000
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'net', (select coalesce(sum(net), 0) from hit),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'e', emp, 'c', client, 'i', regexp_replace(coalesce(item, ''), '\s*\(Refund\)\s*$', '', 'i'), 'r', coalesce(item, '') ~* '\(Refund\)\s*$', 'n', round(net, 2)) order by date desc, branch, emp, client, item) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.drill_staff_net(date, date, text[], text[]) from public, anon;
grant execute on function public.drill_staff_net(date, date, text[], text[]) to authenticated;
