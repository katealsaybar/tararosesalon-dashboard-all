-- Clickable figures (Kate, 27 Oct 2026: "Requests and New clients figures should also be clickable"): the new clients behind a staff member's New clients figure.
-- The ledger's New clients is typed in and Phorest's staff report keeps only a count, so the names come from the same place door_new_clients.sql counts them:
-- door_first_visits (a client's first paid visit, with her Phorest profile date settling whether she is really new). A new client is listed under each staff
-- member who had a line for her on that first day, so the lists add up to the new clients through the door when every staff is asked for.
--
--   drill_staff_new_clients(p_from, p_to, p_branches, p_employees)
--       d first day, b branch, e staff, c client. p_employees null = every staff. Newest first, at most 5,000 rows.
--       total = rows that count. Same line rules as drill_staff_clients (not a deposit, balance payment or voucher, not BUSINESS TRS).
--
-- Client names, so: signed in, Level 3 or above, not a scoped login. Read only, additive.

create or replace function public.drill_staff_new_clients(p_from date, p_to date, p_branches text[] default null, p_employees text[] default null)
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
  ), hit as (
    select distinct fv.first_date as d, fv.first_branch as b, trim(l.employee_name) as e, min(l.client_name) over (partition by fv.cn) as c, fv.cn
    from fv
    join public.sales_transaction_lines l on l.branch = fv.first_branch and l.date = fv.first_date
         and lower(regexp_replace(trim(l.client_name), '\s+', ' ', 'g')) = fv.cn
    join k on k.ik = coalesce(l.item, '')
    where k.kind not in ('non_sale', 'voucher')
      and coalesce(trim(l.employee_name), '') <> '' and l.employee_name !~* '^\s*business\M'
      and (p_employees is null or trim(l.employee_name) = any(p_employees))
  ), shown as (
    select * from hit order by d desc, b, e, c limit 5000
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'b', b, 'e', e, 'c', c) order by d desc, b, e, c) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.drill_staff_new_clients(date, date, text[], text[]) from public, anon;
grant execute on function public.drill_staff_new_clients(date, date, text[], text[]) to authenticated;
