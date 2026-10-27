-- Clickable figures (Kate, 27 Oct 2026): what a client spent. The Spent figure on a client row (Clients handled, Clients through the door) opens the
-- sales lines behind it, so the amount can be read as a receipt: date, branch, who rang it, what it was, what it came to.
--
--   drill_client_lines(p_from, p_to, p_branches, p_client, p_employees)
--       the lines of one client (matched on the name, case and spacing ignored) between two dates. A line counts the way Spent does: not a deposit,
--       balance payment or voucher sale, not rung to BUSINESS TRS, on a client-day that has a sale with an entry in Payment Type. When p_employees is
--       given (a staff list) the client-day is judged per staff member, as drill_staff_clients does; when it is null (through the door) it is judged
--       across all staff, as drill_door_clients does, so the total here is the Spent on the row that opened it.
--       Each line: d date, b branch, e staff, i item (refund marker removed), r is a refund, k kind (service, product, prepaid), n net.
--       total = the sum of the net of the lines shown. Newest first, at most 500 lines.
--
-- Client names, so: signed in, Level 3 or above, not a scoped login. Additive, read only.

create or replace function public.drill_client_lines(p_from date, p_to date, p_branches text[] default null, p_client text default null, p_employees text[] default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  if coalesce(trim(p_client), '') = '' then raise exception 'Which client?'; end if;

  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  ), ln as (
    select l.branch, l.date, trim(l.employee_name) as emp, l.item, l.net, k.kind,
           (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and lower(trim(l.client_name)) = lower(trim(p_client))
      and (p_employees is null or trim(l.employee_name) = any(p_employees))
  ), cd as (
    select *,
           case when p_employees is null
                then bool_or(is_real and sale_paid) over (partition by branch, date)
                else bool_or(is_real and sale_paid) over (partition by branch, date, emp) end as counts
    from ln
  ), hit as (
    select * from cd where counts and is_real
  ), shown as (
    select * from hit order by date desc, branch, emp, item limit 500
  )
  select jsonb_build_object(
    'total', (select coalesce(sum(net), 0) from hit),
    'lines', (select count(*) from hit),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'e', emp, 'i', regexp_replace(coalesce(item, ''), '\s*\(Refund\)\s*$', '', 'i'), 'r', coalesce(item, '') ~* '\(Refund\)\s*$', 'k', kind, 'n', round(net, 2)) order by date desc, branch, emp, item) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.drill_client_lines(date, date, text[], text, text[]) from public, anon;
grant execute on function public.drill_client_lines(date, date, text[], text, text[]) to authenticated;
