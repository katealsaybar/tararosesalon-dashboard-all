-- Staff Roster & Access, Remove person (Kate, 15 Oct 2026): Level 5 can take someone off
-- the dashboard list from /hub/roster. Companion to kb_roster_manage.sql.
--
-- kb_remove_user(email): Level 5 only (kb_level(), the real account). Refuses the owner row
-- and your own row. The row is copied to dashboard_users_removed first (who, when), so a
-- removal can be undone by inserting it back. Removing the dashboard_users row is what
-- closes access: every dashboard table and Team Home level reads that list. Their sign-in
-- account stays but opens nothing. Staff (Level 1) are not on dashboard_users and are not
-- removed here.
-- No email addresses in this file: the repo is public.

create table if not exists public.dashboard_users_removed (like public.dashboard_users);
alter table public.dashboard_users_removed add column if not exists removed_at timestamptz not null default now();
alter table public.dashboard_users_removed add column if not exists removed_by text;
alter table public.dashboard_users_removed enable row level security;   -- no policies: read in the SQL editor only

create or replace function public.kb_remove_user(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_cur int;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  select d.level into v_cur from public.dashboard_users d where d.email = v_email;
  if not found then raise exception 'not on the dashboard list'; end if;
  if v_cur = 5 or v_email = public.kb_me_email() then raise exception 'the owner row cannot be removed here'; end if;
  insert into public.dashboard_users_removed (email, name, role, added_at, perf_admin, scope, level, removed_by)
    select d.email, d.name, d.role, d.added_at, d.perf_admin, d.scope, d.level, public.kb_me_email()
    from public.dashboard_users d where d.email = v_email;
  delete from public.dashboard_users where email = v_email;
end $$;
revoke all on function public.kb_remove_user(text) from public, anon;
grant execute on function public.kb_remove_user(text) to authenticated;
