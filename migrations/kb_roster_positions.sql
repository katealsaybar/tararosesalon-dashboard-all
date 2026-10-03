-- Staff Roster & Access, round 2 (Kate, 3 Oct 2026): job positions, and levels for
-- Level 5 only. Replaces kb_roster() from kb_roster.sql.
--
-- Position: kb_positions first (Supabase only; RLS on and no grants, so only the
-- security-definer function reads it), then perf_staff.level for stylists, then the
-- kb_staff category (Receptionist, Assistant). The beauty and nail team's positions
-- were copied in from their staff cards (staff-profiles.js); Kate's and Tara's were
-- added by hand. The rest of the dashboard list has none until Kate fills them in.
-- Level: returned to Level 5 only. Everyone else gets a team instead
-- (Management & Office for the dashboard list, else Hair, Beauty or Front Desk).
--
-- Names only in this file, no email addresses: the repo is public.

create table if not exists public.kb_positions (email text primary key, position text not null, updated_at timestamptz default now());
alter table public.kb_positions enable row level security;
revoke all on public.kb_positions from anon, authenticated;

-- The beauty and nail team, by name (the emails are looked up, never written here).
insert into public.kb_positions (email, position)
select lower(trim(p.email)), v.pos from public.perf_staff p
join (values ('Galina Spierling','Beauty Therapist'),('Mary Joy Galos','Nail Technician'),('Shine Castillo','Beauty Therapist'),
  ('Grace Sarmiento','Senior Beauty Therapist'),('Kim Casas','Senior Nail Technician'),('Mimi Vertudes','Senior Beauty Therapist'),
  ('Shila Mandal','Senior Beauty Therapist'),('Arnalyn Salisi','Nail Technician'),('Judy Barias','Nail Technician'),
  ('Mona Soba','Senior Beauty Therapist'),('Reda Ramirez','Senior Beauty Therapist'),('Sania Ayaz','Senior Beauty Therapist')) v(n, pos)
  on v.n = p.display_name
where p.active and p.email is not null
on conflict (email) do update set position = excluded.position, updated_at = now();

insert into public.kb_positions (email, position)
select d.email, v.pos from public.dashboard_users d
join (values ('Kate Alsaybar', 'Operations & Performance Manager'), ('Tara Rose Kidd', 'Founder')) v(n, pos) on v.n = d.name
on conflict (email) do update set position = excluded.position, updated_at = now();

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
    select distinct on (lower(trim(p.email))) lower(trim(p.email)) email, p.display_name name, 1 level,
           null::text scope, p.dept, p.branch, 'staff' kind, p.level pos
    from public.perf_staff p
    where p.active and p.email is not null and p.dept in ('Hair', 'Beauty')
    order by lower(trim(p.email)), p.created_at desc
  ),
  kbs as (
    select k.email, k.name, 1 level,
           case when k.note ilike '%bahrain%' then 'BAH' end scope,
           case k.category when 'Receptionist' then 'Front Desk' when 'Assistant' then 'Hair' end dept,
           null::text branch, 'staff' kind, k.category pos
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
               'name', e.name, 'email', e.email,
               -- Kate, 3 Oct 2026: levels are Level 5's alone; below that the list is by team.
               'level', case when (select lv from me) = 5 then e.level end,
               'team', case when e.kind = 'dashboard' then 'Management & Office' else e.dept end,
               'position', coalesce(kp.position, e.pos),
               'scope', e.scope, 'dept', e.dept, 'branch', e.branch,
               'last_sign_in', u.last_sign_in_at)
             order by case when (select lv from me) = 5 then e.level end desc nulls last, e.name)
      from everyone e
      left join public.kb_positions kp on kp.email = e.email
      left join auth.users u on lower(u.email) = e.email and u.email_confirmed_at is not null
      where (select sc from me) is distinct from 'BAH' or e.scope = 'BAH'
    ), '[]'::jsonb)
  ) end
$$;
revoke all on function public.kb_roster() from public, anon;
grant execute on function public.kb_roster() to authenticated;

