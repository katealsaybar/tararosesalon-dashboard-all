-- Staff Roster & Access, add people and set levels (Kate, 15 Oct 2026): Level 5 can add
-- someone to the dashboard list and change their level from /hub/roster, instead of
-- editing dashboard_users in the Supabase table editor.
--
-- Both functions check kb_level() = 5 (the real account, so "View as" changes nothing).
-- Only Levels 2 to 4 can be given here: Level 5 (owner) stays a manual change, and Level 1
-- must never sit on dashboard_users (that list opens every dashboard table).
-- dashboard_users.role follows the level, because the Upload Portal reads the role:
--   4 -> payroll (+ perf_admin 'Accounts', the payslip key), 2 and 3 -> team.
-- Adding a row fires the dashboard_users_invite trigger, which emails the invite.
-- The owner row and your own row cannot be changed here.
-- No email addresses in this file: the repo is public.

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
  insert into public.dashboard_users (email, name, role, level, scope, perf_admin)
  values (v_email, trim(p_name), case when p_level = 4 then 'payroll' else 'team' end, p_level, p_scope,
          case when p_level = 4 then 'Accounts' end);
end $$;
revoke all on function public.kb_add_user(text, text, int, text) from public, anon;
grant execute on function public.kb_add_user(text, text, int, text) to authenticated;

create or replace function public.kb_set_user_level(p_email text, p_level int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_cur int;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  if p_level not between 2 and 4 then raise exception 'level must be 2, 3 or 4'; end if;
  select d.level into v_cur from public.dashboard_users d where d.email = v_email;
  if not found then raise exception 'not on the dashboard list'; end if;
  if v_cur = 5 or v_email = public.kb_me_email() then raise exception 'the owner row cannot be changed here'; end if;
  update public.dashboard_users d set
    level = p_level,
    role = case when p_level = 4 then 'payroll' else 'team' end,
    perf_admin = case when p_level = 4 then 'Accounts'
                      when d.perf_admin = 'Accounts' then null
                      else d.perf_admin end
  where d.email = v_email;
end $$;
revoke all on function public.kb_set_user_level(text, int) from public, anon;
grant execute on function public.kb_set_user_level(text, int) to authenticated;
