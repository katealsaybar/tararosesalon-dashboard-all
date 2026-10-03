-- Staff Roster & Access, round 3 (Kate, 3 Oct 2026): full names and the rest of the
-- positions, taken from the org chart (org-chart.js). Applied in Supabase already.
--
-- kb_positions gets full_name (and position may now be empty), so the roster shows a
-- full name without touching dashboard_users.name, which the dashboard greets people by.
-- kb_roster() now shows coalesce(full_name, name), and Phorest's name for stylists
-- (perf_staff.phorest_name) instead of the short display name.
--
-- Names only in this file, no email addresses: the repo is public.

alter table public.kb_positions add column if not exists full_name text;
alter table public.kb_positions alter column position drop not null;

-- Positions from the org chart, matched on dashboard_users.name.
with v(n, pos) as (values
 ('Tara Rose Kidd','Founder & Managing Director'),
 ('Daisy Charlotte Cropper','Managing Director, Tara Rose Bahrain'),
 ('Mette Haxthausen','Executive Partner (Salon Consultant)'),
 ('Hanneh (Marketing)','Social Media Manager'),
 ('Belle Bustos','Call Centre Team Lead'),
 ('Jho Cairel','Salon Coordinator, Khalifa City Branch'),
 ('Cristine Bracamonte','Salon Coordinator, Saadiyat Branch'),
 ('Frances','Salon Coordinator, Al Quoz Branch'),
 ('Shiela','Salon Coordinator, Motor City Branch'),
 ('Jumera (Accounts)','Accounts and Admin Head'),
 ('Emma-Louise Usher','General Manager'),
 ('David Nagtzaam','Paid Media, Leaders in Digital Media'),
 ('Murray','Acquisition Team'),
 ('Accounts (general)','Shared accounts login'),
 ('Admin','Shared admin login'),
 ('HR','Shared HR login'),
 ('Payroll (Accounts)','Shared payroll login'),
 ('Mgmt','Shared management login'))
insert into public.kb_positions (email, position)
select d.email, v.pos from public.dashboard_users d join v on v.n = d.name
on conflict (email) do update set position = excluded.position, updated_at = now();
update public.kb_positions set position = 'Operations & Performance Manager, EA'
where email = (select email from public.dashboard_users where name = 'Kate Alsaybar');

-- Org chart titles for team members who are on the staff lists.
with s(n, pos) as (values
 ('Hazel Alcala','Call Centre Receptionist'),
 ('Emma Williamson','Treatments & Retail Educator'),
 ('Ashleigh Fairgrieve','Blondes & Extensions Educator'),
 ('Ruth Bocock','Salon Manager, Al Quoz Branch')),
src as (
 select k.email, s.pos from public.kb_staff k join s on s.n = k.name where k.active
 union all select lower(trim(p.email)), s.pos from public.perf_staff p join s on s.n = p.display_name where p.active and p.email is not null)
insert into public.kb_positions (email, position)
select distinct on (email) email, pos from src
on conflict (email) do update set position = excluded.position, updated_at = now();

-- Full names.
with v(n, fn) as (values
 ('Hanneh (Marketing)','Hanneh Rose Rejas'), ('Shiela','Shiela Avena'), ('Frances','Frances Pia Sergio'),
 ('Jumera (Accounts)','Jumera Chavenia'), ('Belle Bustos','Christabelle Bustos'), ('Jho Cairel','Jhoana Cairel'))
insert into public.kb_positions (email, full_name)
select d.email, v.fn from public.dashboard_users d join v on v.n = d.name
on conflict (email) do update set full_name = excluded.full_name, updated_at = now();

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
    -- Kate, 3 Oct 2026: full names, so Phorest's name rather than the short display name.
    select distinct on (lower(trim(p.email))) lower(trim(p.email)) email, coalesce(p.phorest_name, p.display_name) name, 1 level,
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
               'name', coalesce(kp.full_name, e.name), 'email', e.email,
               -- Kate, 3 Oct 2026: levels are Level 5's alone; below that the list is by team.
               'level', case when (select lv from me) = 5 then e.level end,
               'team', case when e.kind = 'dashboard' then 'Management & Office' else e.dept end,
               'position', coalesce(kp.position, e.pos),
               'scope', e.scope, 'dept', e.dept, 'branch', e.branch,
               'last_sign_in', u.last_sign_in_at)
             order by case when (select lv from me) = 5 then e.level end desc nulls last, coalesce(kp.full_name, e.name))
      from everyone e
      left join public.kb_positions kp on kp.email = e.email
      left join auth.users u on lower(u.email) = e.email and u.email_confirmed_at is not null
      where (select sc from me) is distinct from 'BAH' or e.scope = 'BAH'
    ), '[]'::jsonb)
  ) end
$$;
revoke all on function public.kb_roster() from public, anon;
grant execute on function public.kb_roster() to authenticated;
