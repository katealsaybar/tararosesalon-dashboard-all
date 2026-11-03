-- Kate, 3 Nov 2026: the figures on the dashboard's Staff Dashboards (a leader's or the dashboard key's view of one person, and the team grid) open her rows.
-- The same three lists as perf_my_days / perf_my_reviews / perf_my_socials (migrations/perf_my_drill.sql), asked by staff id with a team key instead of
-- by her own token, the way perf_dashboard_by_id is. The team key must be a perf_admins row (leader, viewer or payroll, the roles perf_dashboard_by_id
-- already lets read a person's page); the staff id must be an active person; then the token function answers, so the sign-in lock and every rule in it
-- apply unchanged. No tokens, emails or ids come back, only her own days, reviews and posts. Read only.
create or replace function public.perf_my_days_by_id(p_admin uuid, p_staff_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader', 'viewer', 'payroll')) then return null; end if;
  select token into t from perf_staff where id = p_staff_id and active;
  if t is null then return null; end if;
  return public.perf_my_days(t, p_from, p_to);
end $$;

create or replace function public.perf_my_reviews_by_id(p_admin uuid, p_staff_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader', 'viewer', 'payroll')) then return null; end if;
  select token into t from perf_staff where id = p_staff_id and active;
  if t is null then return null; end if;
  return public.perf_my_reviews(t, p_from, p_to);
end $$;

create or replace function public.perf_my_socials_by_id(p_admin uuid, p_staff_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t uuid;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader', 'viewer', 'payroll')) then return null; end if;
  select token into t from perf_staff where id = p_staff_id and active;
  if t is null then return null; end if;
  return public.perf_my_socials(t, p_from, p_to);
end $$;

revoke all on function public.perf_my_days_by_id(uuid, uuid, date, date) from public;
revoke all on function public.perf_my_reviews_by_id(uuid, uuid, date, date) from public;
revoke all on function public.perf_my_socials_by_id(uuid, uuid, date, date) from public;
grant execute on function public.perf_my_days_by_id(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.perf_my_reviews_by_id(uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.perf_my_socials_by_id(uuid, uuid, date, date) to anon, authenticated;
