-- Kate, 27 Oct 2026: the clients behind the ledger's New client requests (NCR) figure. The ledger names them (first name only, typed by reception, Type NCR under
-- the stylist) and ledger_ncr_clients holds those lines (ledger_ncr_clients_table.sql). KCA, September: Tegan Skinner's ledger NCR is 3 (Mariam and Sarah on 4 Sep,
-- Mariam on 27 Sep), but Phorest has all three as existing clients and not new to the salon, so the ledger's NCR is wider than "new client" and the list is built from
-- the ledger's own names, not from Phorest's new clients.
--
--   drill_ledger_ncr(p_from, p_to, p_branches, p_employees)
--       d day, b branch, e staff (as the ledger heads her column), c the client's full name when exactly one client with that first name had a paid line with that staff
--       that day (else the first name as typed), m = c is a full name, nw = she was new to the salon that day (door_first_visits). p_employees = Phorest staff names,
--       matched on the first name; null = every staff. total = lines listed. Newest first, at most 5,000.
--
-- Level 3 and above, not a scoped login, read only.

create or replace function public.drill_ledger_ncr(p_from date, p_to date, p_branches text[] default null, p_employees text[] default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;

  with emp as (
    select distinct split_part(lower(trim(x)), ' ', 1) as f from unnest(coalesce(p_employees, '{}'::text[])) x
  ), n as (
    select l.id, l.branch, l.date, l.staff, l.client_first, l.client_key, split_part(lower(l.staff), ' ', 1) as sf
    from public.ledger_ncr_clients l
    where l.date between p_from and p_to and (p_branches is null or l.branch = any(p_branches))
      and (p_employees is null or split_part(lower(l.staff), ' ', 1) in (select f from emp))
  ), k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines where date between p_from and p_to) d
  ), served as (
    select distinct n.id, lower(regexp_replace(trim(s.client_name), '\s+', ' ', 'g')) as cn, min(s.client_name) over (partition by n.id, lower(regexp_replace(trim(s.client_name), '\s+', ' ', 'g'))) as shown
    from n
    join public.sales_transaction_lines s on s.branch = n.branch and s.date = n.date
         and split_part(lower(trim(s.employee_name)), ' ', 1) = n.sf
         and split_part(lower(trim(s.client_name)), ' ', 1) = n.client_key
    join k on k.ik = coalesce(s.item, '')
    where k.kind not in ('non_sale', 'voucher') and s.employee_name !~* '^\s*business\M'
  ), one as (
    select id, min(cn) as cn, min(shown) as shown from served group by id having count(distinct cn) = 1
  ), rows as (
    select n.date as d, n.branch as b, initcap(trim(n.staff)) as e, coalesce(o.shown, n.client_first) as c, (o.id is not null) as m,
           coalesce((select fv.new_ok and fv.first_date = n.date from public.door_first_visits fv where fv.cn = o.cn limit 1), false) as nw
    from n left join one o on o.id = n.id
  ), shown as (
    select * from rows order by d desc, b, e, c limit 5000
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'b', b, 'e', e, 'c', c, 'm', m, 'nw', nw) order by d desc, b, e, c) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.drill_ledger_ncr(date, date, text[], text[]) from public, anon;
grant execute on function public.drill_ledger_ncr(date, date, text[], text[]) to authenticated;
