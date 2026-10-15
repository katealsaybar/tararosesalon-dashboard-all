-- Staff Roster & Access, Change email (Kate, 15 Oct 2026): Level 5 can change the
-- registered email of anyone on /hub/roster, at any level.
--
-- Where a person's email lives:
--   dashboard_users.email   Levels 2-4 (the list that opens the dashboard)
--   perf_staff.email        stylists and beauticians (also where their monthly emails go)
--   kb_staff.email          reception, assistants, call centre
--   kb_positions.email      their job title and photo on the roster
-- kb_change_email(old, new) updates all of them in one go, refuses an address that
-- already belongs to someone or is on the revoked list, and refuses the owner row and
-- your own. Their old sign-in account is deleted (it belonged to the old address and
-- would otherwise stay open); a dashboard-list person is invited at the new address,
-- staff sign in themselves as before. Payslip send history keeps the address it was
-- sent to. Returns 'invited' or 'changed'.
-- No email addresses in this file: the repo is public.

create or replace function public.kb_change_email(p_old text, p_new text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_old text := lower(trim(p_old)); v_new text := lower(trim(p_new)); v_dash boolean; v_found boolean;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  if v_new !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that is not an email address'; end if;
  if v_new = v_old then raise exception 'that is already their email'; end if;
  if v_old = public.kb_me_email()
     or exists (select 1 from public.dashboard_users d where d.email = v_old and d.level = 5) then
    raise exception 'the owner email cannot be changed here';
  end if;
  select exists (select 1 from public.dashboard_users where email = v_old) into v_dash;
  v_found := v_dash
    or exists (select 1 from public.perf_staff p where lower(trim(p.email)) = v_old)
    or exists (select 1 from public.kb_staff k where k.email = v_old);
  if not v_found then raise exception 'that email is not on the roster'; end if;
  if public.kb_is_blocked(v_new) then raise exception 'that address is on the revoked list'; end if;
  if exists (select 1 from public.dashboard_users d where d.email = v_new)
     or exists (select 1 from public.perf_staff p where lower(trim(p.email)) = v_new)
     or exists (select 1 from public.kb_staff k where k.email = v_new)
     or exists (select 1 from public.kb_positions q where q.email = v_new) then
    raise exception 'that address already belongs to someone on the roster';
  end if;

  update public.dashboard_users set email = v_new where email = v_old;
  update public.kb_staff set email = v_new where email = v_old;
  update public.kb_positions set email = v_new where email = v_old;
  update public.perf_staff set email = v_new where lower(trim(email)) = v_old;
  delete from auth.users where lower(email) = v_old;

  if v_dash then
    begin
      perform public.dashboard_invite(v_new);
    exception when others then
      raise warning 'invite for the new address failed: %', sqlerrm;   -- the change stands; Resend invite works
    end;
    return 'invited';
  end if;
  return 'changed';
end $$;
revoke all on function public.kb_change_email(text, text) from public, anon;
grant execute on function public.kb_change_email(text, text) to authenticated;
