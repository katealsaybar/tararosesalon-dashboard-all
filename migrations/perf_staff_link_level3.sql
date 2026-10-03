-- Kate, 3 Oct 2026: the staff link for Level 3 and above.
-- Staff Benchmarks showed "Open <name>'s view ↗" only on a leader key (Kate, Tara,
-- Emma). The other Level 3 sign-ins got the viewer key and no link, and Level 4's
-- payroll key was turned away by Staff Benchmarks altogether. Level 2 and below
-- still never get the link.

-- 1. The link itself: her /me/ slug, for a signed-in dashboard user at Level 3+ with
--    no branch scope (Bahrain's sign-in doesn't see UAE stylists). Anyone else: null.
create or replace function public.perf_staff_link(p_staff_id uuid)
returns text
language sql
stable security definer
set search_path to ''
as $function$
  select s.slug from public.perf_staff s
   where s.id = p_staff_id and s.active
     and exists (select 1 from public.dashboard_users d
                   join auth.users u on lower(u.email) = d.email
                  where u.id = auth.uid() and u.email_confirmed_at is not null
                    and d.level >= 3 and d.scope is null)
$function$;
revoke all on function public.perf_staff_link(uuid) from public, anon;
grant execute on function public.perf_staff_link(uuid) to authenticated;

-- 2. The payroll key opens Staff Benchmarks as a viewer: numbers and notes, no
--    tokens, no emails, no note writing.
CREATE OR REPLACE FUNCTION public.perf_dashboard_by_id(p_admin uuid, p_staff_id uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t uuid; r text;
begin
  select case when role = 'payroll' then 'viewer' else role end into r
    from perf_admins where token = p_admin and role in ('leader','viewer','payroll');
  if r is null then return null; end if;
  select token into t from perf_staff where id = p_staff_id and active;
  if t is null then return null; end if;
  return perf_dashboard(t, p_month) || jsonb_build_object('staff_id', p_staff_id, 'role', r);
end $function$;

CREATE OR REPLACE FUNCTION public.perf_team(p_admin uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  m2 date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month - 1 day')::date;
  r text;
begin
  select case when role = 'payroll' then 'viewer' else role end into r
    from perf_admins where token = p_admin and role in ('leader','viewer','payroll');
  if r is null then return null; end if;
  return jsonb_build_object(
    'admin', (select name from perf_admins where token = p_admin),
    'role', r,
    'month', m1,
    'staff', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id,
                'token', case when r = 'leader' then s.token end,
                'name', s.display_name, 'branch', s.branch, 'dept', s.dept,
                'level', s.level,
                'email', case when r = 'leader' then s.email end,
                'has_email', s.email is not null, 'send_email', s.send_email, 'keys', s.ledger_names,
                'numbers', perf_core(s, m1, m2),
                'notes', (select count(*) from perf_notes n where n.staff_id = s.id and n.month = m1))
                order by s.branch, s.dept desc, s.display_name), '[]')
              from perf_staff s where s.active)
  );
end $function$;
