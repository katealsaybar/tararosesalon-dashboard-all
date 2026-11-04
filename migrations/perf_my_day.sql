-- Kate, 4 Nov 2026: a day's row in a figure's by-day list opens the rows behind that day ("also not clickable", Staff's 13 Week).
-- perf_my_day returns, for ONE day, everything perf_my_days adds up for her, in its own rows: the till lines (item, kind and amount before VAT, services and products only: deposits, vouchers and course or package sales are not in Phorest's day figure; grouped
-- into visit 1, 2, 3, no client names), Phorest's staff daily row per branch (services, retail, courses, visits, requests, new clients), Phorest's
-- rebooking row per branch, the branch sheet rows (clients, asked for you, salon, new, new client requests, rebooked, treatments) and the
-- utilisation hours per branch. The same filters perf_my_days uses, so the rows add up to the day's figure. Token only, with the same sign-in lock; the
-- by_id twin asks with a team key and a staff id exactly as perf_my_days_by_id does. Read only. No tokens, emails, ids or client names come back.
create or replace function public.perf_my_day(p_token uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  out jsonb;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;
  if p_date is null then return '{}'::jsonb; end if;
  select jsonb_build_object(
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('visit', z.visit, 'branch', z.branch, 'item', z.item, 'net', round(z.net, 2), 'kind', z.kind) order by z.visit, z.id)
        from (select x.id, x.branch, x.item, x.net, x.kind, dense_rank() over (order by x.branch, x.first_id) visit
                from (select l.id, l.branch, l.item, l.net, public.stl_item_kind(l.item) kind, min(l.id) over (partition by l.branch, l.sale_id) first_id
                        from sales_transaction_lines l
                       where l.employee_name = s.phorest_name and l.date = p_date
                         and public.stl_item_kind(l.item) in ('service', 'product')) x) z), '[]'::jsonb),
    'phorest', coalesce((
      select jsonb_agg(jsonb_build_object('branch', d.branch, 'svc', round(d.services_ex_vat, 2), 'retail', round(d.products_ex_vat, 2), 'courses', round(d.courses_ex_vat, 2),
                                          'visits', d.visits, 'rqs', d.rqs, 'new', d.new_clients) order by d.branch)
        from phorest_staff_daily d where d.employee_name = s.phorest_name and not d.is_total and d.date = p_date), '[]'::jsonb),
    'rebook', coalesce((
      select jsonb_agg(jsonb_build_object('branch', r.branch, 'visits', r.visits, 'rebooked', r.rebooked) order by r.branch)
        from phorest_staff_rebooking r where r.employee_name = s.phorest_name and r.date = p_date), '[]'::jsonb),
    'sheet', coalesce((
      select jsonb_agg(jsonb_build_object('branch', b.branch, 'clients', b.total, 'req', b.req, 'salon', b.salon, 'new', b.new_client, 'ncr', b.ncr,
                                          'rebooked', b.rebooked, 'treat', round(b.treatment_aed, 2)) order by b.branch)
        from branch_staff_daily b where upper(trim(b.staff_name)) = any(s.ledger_names) and b.dept = s.dept and b.date = p_date), '[]'::jsonb),
    'util', coalesce((
      select jsonb_agg(jsonb_build_object('branch', u.branch, 'booked', round(u.utilisation_hours, 4), 'available', round(u.available_hours, 4)) order by u.branch)
        from staff_utilisation u where u.staff_name = s.phorest_name and not coalesce(u.is_archived, false) and u.date_from = u.date_to and u.date_from = p_date), '[]'::jsonb)
  ) into out;
  return out;
end $$;

create or replace function public.perf_my_day_by_id(p_admin uuid, p_staff_id uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader', 'viewer', 'payroll')) then return null; end if;
  select token into t from perf_staff where id = p_staff_id and active;
  if t is null then return null; end if;
  return public.perf_my_day(t, p_date);
end $$;

revoke all on function public.perf_my_day(uuid, date) from public;
revoke all on function public.perf_my_day_by_id(uuid, uuid, date) from public;
grant execute on function public.perf_my_day(uuid, date) to anon, authenticated;
grant execute on function public.perf_my_day_by_id(uuid, uuid, date) to anon, authenticated;
