-- Staff Roster & Access (Kate, 3 Oct 2026).
--
-- A Team Home card for Level 3 and up: everyone who can sign in to the site, with
-- their level, department or branch, and when they last signed in. View only; the
-- list itself is still changed by Kate in Supabase.
--
-- Two kinds of row:
--   dashboard_users  Levels 2-5, as set there.
--   staff            Level 1: active perf_staff (Hair, Beauty) and active kb_staff
--                    whose category gives them a department (Receptionist, Assistant).
--                    Office/Admin get no department, so no access, so no row. A staff
--                    email already on dashboard_users is shown once, at that level.
-- Staff only get in once kb_settings.staff_open is on; the roster says so.
-- A Bahrain-scoped viewer sees Bahrain rows only.
--
-- Names only in this file, no email addresses: the repo is public.

insert into public.kb_sections (key, dept, min_level, staff_dept, sort)
values ('access', 'Management', 3, null, 85)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level, staff_dept = excluded.staff_dept;

create or replace function public.kb_roster()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (
    select public.kb_level() lv,
           (select d.scope from public.dashboard_users d where d.email = public.kb_me_email()) sc
  ),
  dash as (
    select d.email, d.name, d.level, d.scope, null::text dept, null::text branch, 'dashboard' kind
    from public.dashboard_users d
  ),
  perf as (
    select distinct on (lower(trim(p.email))) lower(trim(p.email)) email, p.display_name name, 1 level,
           null::text scope, p.dept, p.branch, 'staff' kind
    from public.perf_staff p
    where p.active and p.email is not null and p.dept in ('Hair', 'Beauty')
    order by lower(trim(p.email)), p.created_at desc
  ),
  kbs as (
    select k.email, k.name, 1 level,
           case when k.note ilike '%bahrain%' then 'BAH' end scope,
           case k.category when 'Receptionist' then 'Front Desk' when 'Assistant' then 'Hair' end dept,
           null::text branch, 'staff' kind
    from public.kb_staff k
    where k.active and k.category in ('Receptionist', 'Assistant')
  ),
  everyone as (
    select * from dash
    union all select * from perf where email not in (select email from dash)
    union all select * from kbs where email not in (select email from dash)
                                  and email not in (select email from perf)
  )
  select case when (select lv from me) is null or (select lv from me) < 3 then null else jsonb_build_object(
    'staff_open', coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', e.name, 'email', e.email, 'level', e.level, 'scope', e.scope,
               'dept', e.dept, 'branch', e.branch, 'kind', e.kind,
               'last_sign_in', u.last_sign_in_at)
             order by e.level desc, e.name)
      from everyone e
      left join auth.users u on lower(u.email) = e.email and u.email_confirmed_at is not null
      where (select sc from me) is distinct from 'BAH' or e.scope = 'BAH'
    ), '[]'::jsonb)
  ) end
$$;
revoke all on function public.kb_roster() from public, anon;
grant execute on function public.kb_roster() to authenticated;
