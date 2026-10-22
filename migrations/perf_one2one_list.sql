-- Kate, 22 Oct 2026: the 1-to-1s & Goals list (dashboard > Numbers > Team Performance). One row per active staff member whose 1-to-1 is switched on
-- (perf_staff.one2one_on): the status and date of the latest monthly 1-to-1, whether they have sent their own part for it, and this year's Goals.
-- Statuses and dates only, never what was written: the content stays behind perf_one2one_get. Leaders only (perf_admins.role = 'leader':
-- Emma, Kate, Tara), the same gate as perf_one2one_get, so the viewer and payroll keys get null. Staff drafts are not shown (a draft of their own part
-- is private to them until they press Send, as perf_one2one_get already hides it).
create or replace function public.perf_one2one_list(p_admin uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  who text;
  m1 date := date_trunc('month', current_date)::date;
  y1 date := date_trunc('year', current_date)::date;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  if who is null then return null; end if;
  return jsonb_build_object(
    'who', who, 'month', m1, 'year', y1,
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', s.display_name, 'slug', s.slug, 'branch', s.branch, 'dept', s.dept, 'level', s.level,
        'monthly', (select jsonb_build_object('status', o.status, 'period', o.period, 'signed_at', o.signed_at, 'updated_at', o.updated_at)
                      from perf_one2one o where o.staff_id = s.id and o.kind = 'monthly' order by o.period desc limit 1),
        'prep', (select jsonb_build_object('period', o.period, 'submitted_at', o.submitted_at)
                   from perf_one2one o where o.staff_id = s.id and o.kind = 'prep' and o.status <> 'draft' and o.period = m1 limit 1),
        'goals', (select jsonb_build_object('status', o.status, 'period', o.period, 'signed_at', o.signed_at, 'submitted_at', o.submitted_at, 'updated_at', o.updated_at)
                    from perf_one2one o where o.staff_id = s.id and o.kind = 'goals' and o.period = y1 limit 1)
      ) order by s.display_name)
      from perf_staff s where s.active and s.one2one_on), '[]'::jsonb));
end $function$;
