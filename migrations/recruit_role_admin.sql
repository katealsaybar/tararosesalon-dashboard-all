-- Recruitment: Admin added to "Applying for" (Kate, 16 Nov 2026, from Supriya Gonsalves's CV: Admin/Manager). Additive.
--   recruit_set_role now accepts Admin as well as Hairdresser / Hair Stylist, Hair Assistant, Beautician, Front Desk / Reception, Other.
--   Applied live as the migration recruit_role_admin on 16 Nov 2026. The notify_roles setting is NOT changed (Front Desk / Reception, Hair Assistant, Other).
-- Undo: put the function back from recruit_role_override.sql (the list without 'Admin'); anyone already set to Admin should be set back to automatic first.
CREATE OR REPLACE FUNCTION public.recruit_set_role(p_id uuid, p_to text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text := public.recruit_guard(); v text;
begin
  if p_id is null then raise exception 'bad request'; end if;
  v := case when p_to is null or p_to in ('', 'auto') then null else p_to end;
  if v is not null and v not in ('Hairdresser / Hair Stylist', 'Hair Assistant', 'Beautician', 'Front Desk / Reception', 'Admin', 'Other') then raise exception 'unknown role'; end if;
  update public.recruit_applicants set role_override = v, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  return jsonb_build_object('ok', true);
end $function$;
