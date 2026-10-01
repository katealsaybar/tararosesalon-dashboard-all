-- Team Home access levels (Kate, 1 Oct 2026).
--
--   Level 1  staff (stylists, beauticians, reception, assistants): their own
--            department's SOPs and induction, and their own My Numbers link
--   Level 2  leadership: everything except the Upload Portal and Marketing
--   Level 3  executives and marketing: everything except the Upload Portal
--   Level 4  accounts and admin: everything, plus the Upload Portal's Payslips tab
--   Level 5  owner (Kate): everything
--
-- Levels 2 to 5 live on dashboard_users.level. Staff are never on dashboard_users
-- (is_dashboard_user() opens every dashboard table); they come from perf_staff (hair,
-- beauty) or kb_staff (reception, assistants), and only while kb_settings.staff_open
-- is on, exactly as before.
--
-- Which section is open to whom sits in kb_sections, so the kb_pages policy reads it
-- and the database itself refuses a page to anyone below it. The front end only
-- draws what kb_access() says, it decides nothing.
--
-- No email addresses in this file: the repo is public.

-- ── 1. Levels for the dashboard list ──────────────────────────────────────
alter table public.dashboard_users add column if not exists level int;
alter table public.dashboard_users drop constraint if exists dashboard_users_level_check;
alter table public.dashboard_users add constraint dashboard_users_level_check check (level between 2 and 5);

update public.dashboard_users set level = case
  when role = 'owner'   then 5
  when role = 'payroll' then 4
  when name in ('Tara Rose Kidd', 'Emma-Louise Usher', 'Mette Haxthausen', 'David Nagtzaam') then 3
  else 2 end
where level is null;
-- Kate is placing the shared and unlisted accounts one by one; until then they sit on
-- Level 2, which is what they could already open.

-- ── 2. The sections ──────────────────────────────────────────────────────
create table if not exists public.kb_sections (
  key        text primary key,
  dept       text not null,          -- the Team Home group it sits under
  min_level  int  not null,          -- lowest dashboard level that opens it (2-5)
  staff_dept text,                   -- the staff department that also opens it, or null
  sort       int  not null default 0
);
alter table public.kb_sections enable row level security;   -- read only through the functions below

insert into public.kb_sections (key, dept, min_level, staff_dept, sort) values
  ('hair-sop',             'Hair',             2, 'Hair',       10),
  ('hair-induction',       'Hair',             2, 'Hair',       20),
  ('beauty-sop',           'Beauty',           2, 'Beauty',     30),
  ('beauty-induction',     'Beauty',           2, 'Beauty',     40),
  ('front-desk',           'Front Desk',       2, 'Front Desk', 50),
  ('front-desk-induction', 'Front Desk',       2, 'Front Desk', 60),
  ('dashboards',           'Management',       2, null,         70),
  ('campaigns',            'Management',       2, null,         80),
  ('marketing',            'Marketing',        3, null,         90),
  ('hr-forms',             'Accounts & Admin', 2, null,        100),
  ('uploads',              'Accounts & Admin', 4, null,        110)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level,
  staff_dept = excluded.staff_dept, sort = excluded.sort;

-- ── 3. Who is asking ─────────────────────────────────────────────────────
-- By email, so each can be tested on its own; the no-argument versions below read
-- the signed-in person.
create or replace function public.kb_staff_dept_for(p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case p.dept when 'Hair' then 'Hair' when 'Beauty' then 'Beauty' end
       from public.perf_staff p where p.active and lower(trim(p.email)) = lower(p_email) limit 1),
    (select case k.category when 'Receptionist' then 'Front Desk' when 'Assistant' then 'Hair' end
       from public.kb_staff k where k.active and k.email = lower(p_email) limit 1))
$$;

create or replace function public.kb_level_for(p_email text)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select d.level from public.dashboard_users d where d.email = lower(p_email)),
    case when coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false)
              and public.kb_staff_dept_for(p_email) is not null then 1 end)
$$;

create or replace function public.kb_me_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

create or replace function public.kb_level()
returns int language sql stable security definer set search_path = '' as $$
  select public.kb_level_for(public.kb_me_email())
$$;

-- ── 4. May this person open this section? ────────────────────────────────
create or replace function public.kb_can_read_for(p_email text, p_section text)
returns boolean language sql stable security definer set search_path = '' as $$
  with me as (select public.kb_level_for(p_email) lv)
  select coalesce((
    select case
      when me.lv = 5 then true
      when me.lv >= 2 then exists (select 1 from public.kb_sections s where s.key = p_section and s.min_level <= me.lv)
      when me.lv = 1 then exists (select 1 from public.kb_sections s where s.key = p_section
                                    and s.staff_dept = public.kb_staff_dept_for(p_email))
    end from me), false)
$$;

create or replace function public.kb_can_read(p_section text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.kb_can_read_for(public.kb_me_email(), p_section)
$$;

-- The page text: one rule for reading it, the section's. Staff still only see pages
-- marked for staff, as before.
drop policy if exists kb_pages_read on public.kb_pages;
create policy kb_pages_read on public.kb_pages for select
  using ((select public.kb_can_read(section)) and (audience = 'staff' or (select public.kb_level()) >= 2));

-- ── 5. What Team Home draws ──────────────────────────────────────────────
-- Level, staff department, the sections this person may open, and for a stylist her
-- own My Numbers address. Nothing about anyone else.
create or replace function public.kb_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  with e as (select public.kb_me_email() em), me as (select em, public.kb_level_for(em) lv from e)
  select case when me.lv is null then null else jsonb_build_object(
    'level', me.lv,
    'dept', case when me.lv = 1 then public.kb_staff_dept_for(me.em) end,
    'sections', coalesce((select jsonb_agg(s.key order by s.sort) from public.kb_sections s
                          where public.kb_can_read_for(me.em, s.key)), '[]'::jsonb),
    'my_link', (select '/me/' || p.slug from public.perf_staff p
                 where p.active and p.slug is not null and lower(trim(p.email)) = me.em limit 1)
  ) end from me
$$;
grant execute on function public.kb_access() to authenticated;
grant execute on function public.kb_level() to authenticated;
grant execute on function public.kb_can_read(text) to authenticated;
revoke execute on function public.kb_level_for(text) from public, anon, authenticated;
revoke execute on function public.kb_staff_dept_for(text) from public, anon, authenticated;
revoke execute on function public.kb_can_read_for(text, text) from public, anon, authenticated;

-- ── 6. Favourites ────────────────────────────────────────────────────────
-- A star on a card. Each person sees and changes only their own.
create table if not exists public.kb_favourites (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  section    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, section)
);
alter table public.kb_favourites enable row level security;
drop policy if exists kb_favourites_own on public.kb_favourites;
create policy kb_favourites_own on public.kb_favourites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.kb_level()) is not null);
grant select, insert, delete on public.kb_favourites to authenticated;

-- ── 7. Bahrain-only sign-ins (applied live as kb_access_bahrain_scope) ─────
-- dashboard_users.scope = 'BAH' (dashboard_branch_scope.sql) already limits the
-- dashboard to Bahrain rows. On Team Home the same person does not get Campaigns,
-- which is the UAE Wellness Voucher; kb_access() also hands the scope to the page.
create or replace function public.kb_can_read_for(p_email text, p_section text)
returns boolean language sql stable security definer set search_path = '' as $$
  with me as (select public.kb_level_for(p_email) lv,
                     (select d.scope from public.dashboard_users d where d.email = lower(p_email)) sc)
  select coalesce((
    select case
      when me.lv = 5 then true
      when me.sc = 'BAH' and p_section = 'campaigns' then false
      when me.lv >= 2 then exists (select 1 from public.kb_sections s where s.key = p_section and s.min_level <= me.lv)
      when me.lv = 1 then exists (select 1 from public.kb_sections s where s.key = p_section
                                    and s.staff_dept = public.kb_staff_dept_for(p_email))
    end from me), false)
$$;
revoke execute on function public.kb_can_read_for(text, text) from public, anon, authenticated;

create or replace function public.kb_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  with e as (select public.kb_me_email() em), me as (select em, public.kb_level_for(em) lv from e)
  select case when me.lv is null then null else jsonb_build_object(
    'level', me.lv,
    'dept', case when me.lv = 1 then public.kb_staff_dept_for(me.em) end,
    'scope', (select d.scope from public.dashboard_users d where d.email = me.em),
    'sections', coalesce((select jsonb_agg(s.key order by s.sort) from public.kb_sections s
                          where public.kb_can_read_for(me.em, s.key)), '[]'::jsonb),
    'my_link', (select '/me/' || p.slug from public.perf_staff p
                 where p.active and p.slug is not null and lower(trim(p.email)) = me.em limit 1)
  ) end from me
$$;
