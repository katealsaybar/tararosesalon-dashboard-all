-- Reception opens the dashboards (Kate, 1 Oct 2026).
--
-- Receptionists are Level 1 (their Front Desk SOPs and induction), and they also open
-- the Dashboards: the UAE front desks, and Jezzel at Bahrain (scope BAH, Bahrain rows
-- only, as before). Not Campaigns, not Marketing.
--
-- So they sit on dashboard_users at level 1. That list is what opens the dashboard
-- tables, which is the point here. Their department still comes from kb_staff
-- (Receptionist = Front Desk). Belle and Shiela are on kb_staff as receptionists too,
-- under personal emails; they are Level 2 under their salon emails, so their personal
-- ones are left off.
--
-- Names only in this file, no email addresses: the repo is public.

alter table public.dashboard_users drop constraint if exists dashboard_users_level_check;
alter table public.dashboard_users add constraint dashboard_users_level_check check (level between 1 and 5);

-- Jezzel: Bahrain reception. On the department list, and Level 1 with her Bahrain scope.
insert into public.kb_staff (email, name, category, active, note)
select d.email, 'Jezzel Postrero', 'Receptionist', true, 'Bahrain reception, 1 Oct 2026'
from public.dashboard_users d where d.name = 'Jezzel Postrero'
on conflict do nothing;
update public.dashboard_users set level = 1 where name = 'Jezzel Postrero';

-- The UAE front desks.
insert into public.dashboard_users (email, name, role, level)
select k.email, k.name, 'team', 1 from public.kb_staff k
where k.active and k.category = 'Receptionist' and k.name not in ('Belle Bustos', 'Shiela Avena')
on conflict (email) do nothing;

-- Level 1 opens its own department's sections; a receptionist on the dashboard list
-- also opens Dashboards.
create or replace function public.kb_can_read_for(p_email text, p_section text)
returns boolean language sql stable security definer set search_path = '' as $$
  with me as (select public.kb_level_for(p_email) lv,
                     (select d.scope from public.dashboard_users d where d.email = lower(p_email)) sc,
                     exists (select 1 from public.dashboard_users d where d.email = lower(p_email)) on_list)
  select coalesce((
    select case
      when me.lv = 5 then true
      when me.sc = 'BAH' and p_section = 'campaigns' then false
      when me.lv >= 2 then exists (select 1 from public.kb_sections s where s.key = p_section and s.min_level <= me.lv)
      when me.lv = 1 then (me.on_list and p_section = 'dashboards')
        or exists (select 1 from public.kb_sections s where s.key = p_section
                     and s.staff_dept = public.kb_staff_dept_for(p_email))
    end from me), false)
$$;
revoke execute on function public.kb_can_read_for(text, text) from public, anon, authenticated;

-- The dashboard learns the level too, so it can leave Campaigns out of the menu.
drop function if exists public.dashboard_me();
create function public.dashboard_me() returns table (name text, role text, scope text, level int)
language sql stable security definer set search_path = '' as $$
  select d.name, d.role, d.scope, d.level from public.dashboard_users d
  join auth.users u on lower(u.email) = d.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
revoke all on function public.dashboard_me() from public, anon;
grant execute on function public.dashboard_me() to authenticated;
