-- The salon coordinators' payslip email carries their branch's month, Hair and Beauty, and Ate Belle (the call centre team lead) gets all four branches
-- (Kate, 30 Oct 2026). perf_branch_month(branch, month) returns, for each of Hair and Beauty, what the branch's stylists and beauticians took in the month
-- (services plus courses, ex VAT, no retail: the same basis as the targets) and the month's target (the sum of staff_targets.actual_target for that
-- branch and department, the Target Calculator's plan). Actuals are Phorest's per-staff rows (phorest_staff_daily) put on Hair or Beauty by perf_staff.dept;
-- for October 2026 they add up to the branch total within about AED 2,000 a branch (the rest is people who are not on the hair and beauty team).
-- Null where there is none (Motor City has no beauty team). Service role only: the mailer reads it, no page does.

create or replace function public.perf_branch_month(p_branch text, p_month date) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (select date_trunc('month', p_month)::date m1, (date_trunc('month', p_month) + interval '1 month - 1 day')::date m2),
  act as (
    select p.dept, sum(d.services_ex_vat + coalesce(d.courses_ex_vat, 0)) amt
      from phorest_staff_daily d
      join m on d.date between m.m1 and m.m2
      join perf_staff p on p.phorest_name = d.employee_name
     where not d.is_total and upper(d.branch) = upper(p_branch)
     group by p.dept),
  tg as (
    select upper(dept) dept, sum(actual_target) t
      from staff_targets
     where month = (select m1 from m) and upper(branch) = upper(p_branch)
     group by upper(dept))
  select jsonb_build_object(
    'branch', upper(p_branch), 'month', (select m1 from m),
    'hair',   jsonb_build_object('actual', (select round(amt) from act where dept = 'Hair'),   'target', (select t from tg where dept = 'HAIR')),
    'beauty', jsonb_build_object('actual', (select round(amt) from act where dept = 'Beauty'), 'target', (select t from tg where dept = 'BEAUTY')))
$$;

revoke all on function public.perf_branch_month(text, date) from public, anon, authenticated;
