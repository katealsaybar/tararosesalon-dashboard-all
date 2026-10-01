-- Phase 3 of the dashboard lock (Kate, 1 Oct 2026), applied live.
-- The Staff Benchmarks viewer key (perf_admins role 'viewer') was written into the public
-- index.html (SPF_VIEWER), so anyone could call perf_team / perf_weeks / perf_year_weeks
-- with it and read every stylist's numbers. The key was taken out of the page and then
-- replaced in perf_admins (update perf_admins set token = gen_random_uuid() where role =
-- 'viewer'), so the copy in git history is dead. The new one only ever reaches a
-- signed-in person on dashboard_users, through this function; a branch-scoped sign-in
-- (Bahrain) gets none, since it opens UAE stylists' numbers.
create or replace function public.dashboard_perf_key()
returns text language sql stable security definer set search_path to '' as $$
  select coalesce(
    (select a.token::text from public.dashboard_users d
       join auth.users u on lower(u.email) = d.email
       join public.perf_admins a on a.name = d.perf_admin and a.role in ('leader', 'payroll')
      where u.id = auth.uid() and u.email_confirmed_at is not null limit 1),
    (select a.token::text from public.perf_admins a
      where a.role = 'viewer' and public.is_dashboard_user() and public.dashboard_scope() is null limit 1))
$$;
