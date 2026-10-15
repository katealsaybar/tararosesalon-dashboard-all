-- Staff Roster & Access, Revoke access (Kate, 15 Oct 2026): Level 5 can shut someone out
-- altogether (resigned, left), whatever their level or position, from /hub/roster.
-- Replaces kb_remove_user from kb_roster_remove.sql, which only handled the dashboard list.
--
-- Two kinds of person can sign in: dashboard_users (Levels 2-4) and staff (Level 1, who
-- get in through perf_staff / kb_staff while kb_settings.staff_open is on). Taking a
-- staff member off those lists means editing HR records, so instead there is a block list:
--   kb_access_blocked   email, name, when, by whom, note. RLS on, no policies.
-- kb_level_for() and kb_email_allowed() answer "no" for a blocked email, so Team Home,
-- every section, the dashboard sign-in card and My Numbers' Team Home links all close,
-- at any level. kb_revoke_access() also takes them off dashboard_users (copy kept in
-- dashboard_users_removed) and deletes their sign-in account, which ends open sessions.
-- kb_restore_access() lifts the block; adding someone again with kb_add_user() also does.
-- Not covered: a stylist's own performance link (/me/<name>, ?t=) is a token link on
-- public RPCs, separate from sign-in.
-- No email addresses in this file: the repo is public.

drop function if exists public.kb_remove_user(text);

create table if not exists public.kb_access_blocked (
  email      text primary key check (email = lower(email)),
  name       text,
  note       text,
  blocked_at timestamptz not null default now(),
  blocked_by text
);
alter table public.kb_access_blocked enable row level security;   -- read through the functions only

create or replace function public.kb_is_blocked(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.kb_access_blocked b where b.email = lower(trim(p_email)))
$$;
revoke all on function public.kb_is_blocked(text) from public, anon, authenticated;

create or replace function public.kb_level_for(p_email text)
returns integer language sql stable security definer set search_path = '' as $$
  select case when public.kb_is_blocked(p_email) then null else coalesce(
    (select d.level from public.dashboard_users d where d.email = lower(p_email)),
    case when coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false)
              and public.kb_staff_dept_for(p_email) is not null then 1 end) end
$$;

create or replace function public.kb_email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not public.kb_is_blocked(p_email) and (
         public.dashboard_email_allowed(p_email)
      or (coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false)
          and (exists (select 1 from public.perf_staff p
                       where p.active and lower(trim(p.email)) = lower(trim(p_email)))
            or exists (select 1 from public.kb_staff k
                       where k.active and k.email = lower(trim(p_email))))))
$$;

create or replace function public.kb_revoke_access(p_email text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_lv int; v_name text;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  select d.level, d.name into v_lv, v_name from public.dashboard_users d where d.email = v_email;
  if v_lv = 5 or v_email = public.kb_me_email() then raise exception 'the owner cannot be revoked here'; end if;
  if v_name is null then
    select coalesce(p.phorest_name, p.display_name) into v_name from public.perf_staff p
      where lower(trim(p.email)) = v_email order by p.active desc, p.created_at desc limit 1;
  end if;
  if v_name is null then select k.name into v_name from public.kb_staff k where k.email = v_email limit 1; end if;
  if v_lv is not null then
    insert into public.dashboard_users_removed (email, name, role, added_at, perf_admin, scope, level, removed_by)
      select d.email, d.name, d.role, d.added_at, d.perf_admin, d.scope, d.level, public.kb_me_email()
      from public.dashboard_users d where d.email = v_email;
    delete from public.dashboard_users where email = v_email;
  end if;
  insert into public.kb_access_blocked (email, name, note, blocked_by)
    values (v_email, v_name, nullif(trim(p_note), ''), public.kb_me_email())
    on conflict (email) do update set note = excluded.note, blocked_at = now(), blocked_by = excluded.blocked_by;
  delete from auth.users where lower(email) = v_email;
end $$;
revoke all on function public.kb_revoke_access(text, text) from public, anon;
grant execute on function public.kb_revoke_access(text, text) to authenticated;

create or replace function public.kb_restore_access(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  delete from public.kb_access_blocked where email = lower(trim(p_email));
end $$;
revoke all on function public.kb_restore_access(text) from public, anon;
grant execute on function public.kb_restore_access(text) to authenticated;

-- Adding someone on purpose lifts an old block.
create or replace function public.kb_add_user(p_email text, p_name text, p_level int, p_scope text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email));
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that is not an email address'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name is needed'; end if;
  if p_level not between 2 and 4 then raise exception 'level must be 2, 3 or 4'; end if;
  if p_scope is not null and p_scope <> 'BAH' then raise exception 'scope must be empty or BAH'; end if;
  if exists (select 1 from public.dashboard_users d where d.email = v_email) then
    raise exception 'already on the list';
  end if;
  delete from public.kb_access_blocked where email = v_email;
  insert into public.dashboard_users (email, name, role, level, scope, perf_admin)
  values (v_email, trim(p_name), case when p_level = 4 then 'payroll' else 'team' end, p_level, p_scope,
          case when p_level = 4 then 'Accounts' end);
end $$;

-- kb_roster(): blocked people drop out of the list; Level 5 also gets 'revoked'.
create or replace function public.kb_roster()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
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
        where ((select sc from me) is distinct from 'BAH' or e.scope = 'BAH')
          and not public.kb_is_blocked(e.email)
      ), '[]'::jsonb),
      'revoked', case when (select lv from me) = 5 then coalesce((
        select jsonb_agg(jsonb_build_object('email', b.email, 'name', coalesce(b.name, b.email),
                 'note', b.note, 'blocked_at', b.blocked_at) order by b.blocked_at desc)
        from public.kb_access_blocked b), '[]'::jsonb) end
    ) end
$function$;
