-- Kate, 27 Oct 2026: the New client requests (NCR) figure opened every new client, not the ones who asked for the stylist ("if i click 3, here kay Tegan Skinner,
-- it shows 6 with no NCR distinction"). The list now marks each new client with Phorest's request flag (phorest_appt_requests: the appointment carried
-- staffRequested on her first-visit day) and, with p_requested = true, lists only those who asked.
--
--   drill_staff_new_clients(p_from, p_to, p_branches, p_employees, p_requested default false)
--       d first day, b branch, e staff, c client, q = she asked for her stylist (Phorest). total = rows listed, asked = how many of all the new clients asked.
--       p_requested = true lists only the ones who asked. No appointment row for her that day = not counted as a request.
--
-- The flag is per client and day, not per staff: a client seen by two staff on her first day shows under each. The ledger's NCR is typed in by reception
-- and does not have to match Phorest's flag; the window says both. Level 3 and above, read only. Replaces the 4-argument version.

drop function if exists public.drill_staff_new_clients(date, date, text[], text[]);

create or replace function public.drill_staff_new_clients(p_from date, p_to date, p_branches text[] default null, p_employees text[] default null, p_requested boolean default false)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;

  with fv as (
    select cn, first_date, first_branch
    from public.door_first_visits
    where new_ok and first_date between p_from and p_to and (p_branches is null or first_branch = any(p_branches))
  ), k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines where date between p_from and p_to) d
  ), hit0 as (
    select distinct fv.first_date as d, fv.first_branch as b, trim(l.employee_name) as e, min(l.client_name) over (partition by fv.cn) as c, fv.cn
    from fv
    join public.sales_transaction_lines l on l.branch = fv.first_branch and l.date = fv.first_date
         and lower(regexp_replace(trim(l.client_name), '\s+', ' ', 'g')) = fv.cn
    join k on k.ik = coalesce(l.item, '')
    where k.kind not in ('non_sale', 'voucher')
      and coalesce(trim(l.employee_name), '') <> '' and l.employee_name !~* '^\s*business\M'
      and (p_employees is null or trim(l.employee_name) = any(p_employees))
  ), hit1 as (
    select h.*, coalesce(r.requested, false) as q
    from hit0 h left join public.phorest_appt_requests r on r.branch = h.b and r.date = h.d and r.name_key = h.cn
  ), hit as (
    select * from hit1 where not p_requested or q
  ), shown as (
    select * from hit order by d desc, b, e, c limit 5000
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'asked', (select count(*) from hit1 where q),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'b', b, 'e', e, 'c', c, 'q', q) order by d desc, b, e, c) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.drill_staff_new_clients(date, date, text[], text[], boolean) from public, anon;
grant execute on function public.drill_staff_new_clients(date, date, text[], text[], boolean) to authenticated;
