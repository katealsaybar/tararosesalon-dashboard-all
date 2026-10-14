-- Team Home: map the call centre team to the 'Call Centre' staff department (Kate, 14 Oct 2026).
-- Until now kb_staff_dept_for() knew only Hair, Beauty and Front Desk, so a call centre
-- Level 1 login opened nothing under Call Centre (call-centre, call-centre-induction and
-- card-links all carry staff_dept 'Call Centre', see kb_call_centre.sql / kb_card_links.sql).
--
-- 1. kb_staff.category 'Call Centre' now maps to the 'Call Centre' staff department.
-- 2. kb_roster() lists those people (team 'Call Centre'), as it does Receptionist and Assistant.
-- 3. Hazel Alcala (Call Centre Receptionist on the org chart) moves from Receptionist to Call
--    Centre. Belle Bustos, the team lead, is Level 2 and already opens everything at that level.
--    Everything else in kb_roster() is unchanged from kb_roster_positions.sql.

create or replace function public.kb_staff_dept_for(p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case p.dept when 'Hair' then 'Hair' when 'Beauty' then 'Beauty' end
       from public.perf_staff p where p.active and lower(trim(p.email)) = lower(p_email) limit 1),
    (select case k.category when 'Receptionist' then 'Front Desk' when 'Assistant' then 'Hair'
                            when 'Call Centre' then 'Call Centre' end
       from public.kb_staff k where k.active and k.email = lower(p_email) limit 1))
$$;

create or replace function public.kb_roster()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (
    select public.kb_level() lv,
           (select d.scope from public.dashboard_users d where d.email = public.kb_me_email()) sc
  ),
  dash as (
    select d.email, d.name, d.level, d.scope, null::text dept, null::text branch, 'dashboard' kind, null::text pos
    from public.dashboard_users d
  ),
  perf as (
    select distinct on (lower(trim(p.email)))
           lower(trim(p.email)) email, coalesce(p.phorest_name, p.display_name) name, 1 level, null::text scope,
           p.dept, p.branch, 'staff' kind, p.level pos
    from public.perf_staff p
    where p.active and p.email is not null and p.dept in ('Hair', 'Beauty')
    order by lower(trim(p.email)), p.created_at desc
  ),
  kbs as (
    select k.email, k.name, 1 level, case when k.note ilike '%bahrain%' then 'BAH' end scope,
           case k.category when 'Receptionist' then 'Front Desk' when 'Assistant' then 'Hair'
                           when 'Call Centre' then 'Call Centre' end dept,
           null::text branch, 'staff' kind, k.category pos
    from public.kb_staff k
    where k.active and k.category in ('Receptionist', 'Assistant', 'Call Centre')
  ),
  everyone as (
    select * from dash
    union all select * from perf where email not in (select email from dash)
    union all select * from kbs where email not in (select email from dash) and email not in (select email from perf)
  )
  select case when (select lv from me) is null or (select lv from me) < 3 then null else
    jsonb_build_object(
      'staff_open', coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', coalesce(kp.full_name, e.name), 'email', e.email,
          'level', case when (select lv from me) = 5 then e.level end,
          'team', case when e.kind = 'dashboard' then 'Management & Office' else e.dept end,
          'position', coalesce(kp.position, e.pos), 'photo', kp.photo, 'scope', e.scope, 'dept', e.dept, 'branch', e.branch,
          'last_sign_in', u.last_sign_in_at,
          'invited', case when (select lv from me) = 5 and e.kind = 'dashboard' then iu.invited_at end)
          order by case when (select lv from me) = 5 then e.level end desc nulls last, coalesce(kp.full_name, e.name))
        from everyone e
        left join public.kb_positions kp on kp.email = e.email
        left join auth.users u on lower(u.email) = e.email and u.email_confirmed_at is not null
        left join auth.users iu on lower(iu.email) = lower(e.email)
        where (select sc from me) is distinct from 'BAH' or e.scope = 'BAH'
      ), '[]'::jsonb)
    ) end
$$;

update public.kb_staff
set category = 'Call Centre',
    note = coalesce(note || '; ', '') || 'moved to Call Centre 14 Oct 2026 (org chart: Call Centre Receptionist)'
where email = 'hazel.alcala@outlook.com' and category = 'Receptionist';
