-- Staff Roster & Access, add Level 1 and Level 2 people (Kate, 9 Nov 2026): Level 5 can add
-- someone at Level 1 (Hair, Beauty) or Level 2 (Front Desk, Call Centre) from /hub/roster.
--
-- Levels 1 and 2 never go on dashboard_users (that list opens every dashboard table, see
-- create_kb_hub.sql). They go on kb_staff, which only the Team Home functions read, and they
-- sign in themselves once kb_settings.staff_open is on. No invite email is sent for them.
--   Hair -> category 'Assistant', Beauty -> 'Beauty', Front Desk -> 'Receptionist',
--   Call Centre -> 'Call Centre'. Bahrain only is noted in kb_staff.note.
-- 1. kb_staff_dept_for() and kb_roster() learn the 'Beauty' category.
-- 2. kb_add_staff(email, name, team, scope): Level 5 only (kb_level(), the real account).
--    An inactive kb_staff row for the same email is switched back on with the new team.
--    Refused when the email is already on dashboard_users, active in perf_staff or active on
--    kb_staff. A block (kb_access_blocked) is lifted, as kb_add_user does.
-- Everything else in kb_roster() is unchanged from kb_call_centre_staff.sql.
-- No email addresses in this file: the repo is public.

create or replace function public.kb_staff_dept_for(p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case p.dept when 'Hair' then 'Hair' when 'Beauty' then 'Beauty' end
       from public.perf_staff p where p.active and lower(trim(p.email)) = lower(p_email) limit 1),
    (select case k.category when 'Receptionist' then 'Front Desk' when 'Assistant' then 'Hair'
                            when 'Beauty' then 'Beauty' when 'Call Centre' then 'Call Centre' end
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
                           when 'Beauty' then 'Beauty' when 'Call Centre' then 'Call Centre' end dept,
           null::text branch, 'staff' kind, k.category pos
    from public.kb_staff k
    where k.active and k.category in ('Receptionist', 'Assistant', 'Beauty', 'Call Centre')
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
          'invited', case when (select lv from me) = 5 then iu.invited_at end)
          order by case when (select lv from me) = 5 then e.level end desc nulls last, coalesce(kp.full_name, e.name))
        from everyone e
        left join public.kb_positions kp on kp.email = e.email
        left join auth.users u on lower(u.email) = e.email and u.email_confirmed_at is not null
        left join auth.users iu on lower(iu.email) = lower(e.email)
        where ((select sc from me) is distinct from 'BAH' or e.scope = 'BAH')
          and not public.kb_is_blocked(e.email)
      ), '[]'::jsonb),
      'revoked', case when (select lv from me) = 5 then coalesce((
        select jsonb_agg(jsonb_build_object('email', b.email, 'name', coalesce(b.name, b.email),
                 'note', b.note, 'blocked_at', b.blocked_at) order by b.blocked_at desc)
        from public.kb_access_blocked b), '[]'::jsonb) end
    ) end
$$;

create or replace function public.kb_add_staff(p_email text, p_name text, p_team text, p_scope text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_cat text;
  v_note text := case when p_scope = 'BAH' then 'Bahrain' end;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that is not an email address'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name is needed'; end if;
  v_cat := case p_team when 'Hair' then 'Assistant' when 'Beauty' then 'Beauty'
                       when 'Front Desk' then 'Receptionist' when 'Call Centre' then 'Call Centre' end;
  if v_cat is null then raise exception 'team must be Hair, Beauty, Front Desk or Call Centre'; end if;
  if p_scope is not null and p_scope <> 'BAH' then raise exception 'scope must be empty or BAH'; end if;
  if exists (select 1 from public.dashboard_users d where lower(d.email) = v_email)
     or exists (select 1 from public.perf_staff p where p.active and lower(trim(p.email)) = v_email)
     or exists (select 1 from public.kb_staff k where k.active and k.email = v_email) then
    raise exception 'already on the list';
  end if;
  delete from public.kb_access_blocked where email = v_email;
  insert into public.kb_staff (email, name, category, active, note)
  values (v_email, trim(p_name), v_cat, true, v_note)
  on conflict (email) do update
    set name = excluded.name, category = excluded.category, active = true, note = excluded.note;
end $$;
revoke all on function public.kb_add_staff(text, text, text, text) from public, anon;
grant execute on function public.kb_add_staff(text, text, text, text) to authenticated;
