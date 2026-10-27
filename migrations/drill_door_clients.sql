-- Clickable figures (Kate, 27 Oct 2026, "every line that has figures should be clickable"): the clients behind a "through the door" number.
--
--   drill_door_clients(p_from, p_to, p_branches)   one row per client-day that door_clients counts, with her name, what she spent that day
--                                                  (the lines that make the day count: no deposit, balance payment, voucher sale or BUSINESS TRS line)
--                                                  and the staff who served her. Same rules as door_clients (migrations/door_clients_payment_entry.sql),
--                                                  copied line for line so the list adds up to the number on the card: a sale with an entry in Payment
--                                                  Type, one client one day one count, no Walk-in, no client name with Staff in it, no BUSINESS TRS.
--                                                  total = the number the card shows for the same branches and dates (checked against door_clients).
--                                                  Rows are newest first, at most 5,000; total says how many there are.
--
-- Client names, so: signed in, dashboard level 3 or above, and not a scoped login (a Bahrain-only login has no business reading UAE names).
-- security definer because sales_transaction_lines is read through row-level security that already limits a scoped login; the guard above does the rest.
-- Additive. door_clients itself is not touched.

create or replace function public.drill_door_clients(p_from date, p_to date, p_branches text[] default null)
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
    select l.branch, l.date, lower(trim(l.client_name)) as cn, l.client_name, l.employee_name, l.net,
           (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
  ), cd as (
    select branch, date, cn,
           min(client_name) as client,
           bool_or(is_real and sale_paid) as counts,
           coalesce(sum(net) filter (where is_real), 0) as spend,
           string_agg(distinct nullif(trim(employee_name), ''), ', ') filter (where is_real) as staff
    from ln group by branch, date, cn
  ), hit as (
    select * from cd where counts
  ), shown as (
    select * from hit order by date desc, branch, cn limit 5000
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'spend', (select coalesce(sum(spend), 0) from hit),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'c', client, 's', round(spend, 2), 'st', staff) order by date desc, branch, cn) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.drill_door_clients(date, date, text[]) from public, anon;
grant execute on function public.drill_door_clients(date, date, text[]) to authenticated;
