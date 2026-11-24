-- Staff Roster & Access: Level 6 can be given here (Kate, 24 Nov 2026).
--
-- People see Level 6; inside the database it is still level 5 (the owner level, see
-- KB.lvNo in hub/hub.js). kb_add_user() and kb_set_user_level() took Levels 3 to 5 as
-- people see them (2 to 4 inside) and left the owner level to a manual change in the
-- Supabase table editor. They now take 2 to 5, so a second Level 6 can be added from
-- /hub/roster by someone who is already Level 6 (both still check kb_level() = 5, the
-- real account, so "View as" changes nothing).
--
-- dashboard_users.role follows the level, because the Upload Portal and the dashboard
-- write policies read it: 5 -> owner, 4 -> payroll (+ perf_admin 'Accounts'), 2 and 3 -> team.
-- Level 6 has no perf_admin of its own; an existing one is left as it is.
--
-- Kept on purpose: an existing Level 6 row cannot be changed or demoted from the page
-- ("the owner row cannot be changed here"), and nobody can change their own row, so one
-- slip on the page can never lock the owner out or strip a second owner. Taking Level 6
-- away stays a manual change in Supabase.
-- No email addresses in this file: the repo is public.

create or replace function public.kb_add_user(p_email text, p_name text, p_level int, p_scope text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email));
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that is not an email address'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name is needed'; end if;
  if p_level not between 2 and 5 then raise exception 'level must be 3, 4, 5 or 6 as people see it'; end if;
  if p_scope is not null and p_scope <> 'BAH' then raise exception 'scope must be empty or BAH'; end if;
  if p_level = 5 and p_scope is not null then raise exception 'Level 6 is for every branch, leave the region empty'; end if;
  if exists (select 1 from public.dashboard_users d where d.email = v_email) then
    raise exception 'already on the list';
  end if;
  delete from public.kb_access_blocked where email = v_email;   -- as kb_roster_revoke.sql left it
  insert into public.dashboard_users (email, name, role, level, scope, perf_admin)
  values (v_email, trim(p_name),
          case p_level when 5 then 'owner' when 4 then 'payroll' else 'team' end,
          p_level, p_scope,
          case when p_level = 4 then 'Accounts' end);
end $$;
revoke all on function public.kb_add_user(text, text, int, text) from public, anon;
grant execute on function public.kb_add_user(text, text, int, text) to authenticated;

create or replace function public.kb_set_user_level(p_email text, p_level int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_cur int; v_scope text;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  if p_level not between 2 and 5 then raise exception 'level must be 3, 4, 5 or 6 as people see it'; end if;
  select d.level, d.scope into v_cur, v_scope from public.dashboard_users d where d.email = v_email;
  if not found then raise exception 'not on the dashboard list'; end if;
  if v_cur = 5 or v_email = public.kb_me_email() then raise exception 'the owner row cannot be changed here'; end if;
  if p_level = 5 and v_scope is not null then raise exception 'Level 6 is for every branch, clear the Bahrain-only region first'; end if;
  update public.dashboard_users d set
    level = p_level,
    role = case p_level when 5 then 'owner' when 4 then 'payroll' else 'team' end,
    perf_admin = case when p_level = 4 then 'Accounts'
                      when d.perf_admin = 'Accounts' then null
                      else d.perf_admin end
  where d.email = v_email;
end $$;
revoke all on function public.kb_set_user_level(text, int) from public, anon;
grant execute on function public.kb_set_user_level(text, int) to authenticated;
