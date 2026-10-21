-- Kate, 21 Oct 2026: pages opened for one person alone.
-- Levels now give Level 2 (coordinators) and Level 4 (accounts) their own page lists (pages.js, lv). When one person in a level needs
-- a page that is not on their level's list, it goes in their row here, as the page ids from pages.js. First use: the accounts lead
-- gets the two staff target pages, Daily Stylist Target and Actuals vs Targets, on top of Level 4's own list.
--
-- This changes what is drawn. The data is still protected by row-level security as before (membership of dashboard_users).
-- Undo: set extra_pages to null on every row, then re-create dashboard_me() without the extra_pages column.

alter table public.dashboard_users add column if not exists extra_pages text[];

drop function if exists public.dashboard_me();
create function public.dashboard_me() returns table (name text, role text, scope text, level integer, extra_pages text[])
  language sql stable security definer set search_path = ''
as $$
  select d.name, d.role, d.scope, d.level, d.extra_pages from public.dashboard_users d
  join auth.users u on lower(u.email) = d.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
revoke all on function public.dashboard_me() from public;
grant execute on function public.dashboard_me() to authenticated, service_role;

-- Given to a person by hand, never by email in this file (the repo is public). Example:
--   update public.dashboard_users set extra_pages = array['ledgerStylist', 'ledgerActuals'] where email = '<her email>' and level = 4;
