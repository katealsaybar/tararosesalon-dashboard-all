-- Clickable figures (Kate, 27 Oct 2026): the retail behind a staff member's Retail figure on the Net take list ("retail should be clickable as well").
-- Same shape and rules as drill_staff_services, for products: a line counts when it is a product (stl_item_kind = 'product') on a sale with an entry in
-- Payment Type, rung to a named staff member (not BUSINESS TRS), refunds netted off. One row per line: d date, b branch, e staff, c client, i item, r refund, n net.
-- The ledger's retail is typed by reception and keeps no lines, so these come from Phorest's sales lines and can differ. Level 3 and above, not a scoped
-- login, read only. Additive.

create or replace function public.drill_staff_retail(p_from date, p_to date, p_branches text[] default null, p_employees text[] default null)
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
    select l.branch, l.date, trim(l.employee_name) as emp, coalesce(nullif(trim(l.client_name), ''), 'No name') as client, l.item, l.net,
           (k.kind = 'product') as is_service,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and coalesce(l.employee_name, '') !~* '^\s*business\M'
      and coalesce(trim(l.employee_name), '') <> ''
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
revoke all on function public.drill_staff_retail(date, date, text[], text[]) from public, anon;
grant execute on function public.drill_staff_retail(date, date, text[], text[]) to authenticated;
