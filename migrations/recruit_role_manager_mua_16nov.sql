-- Recruitment: "Applying for" gets Manager and Make Up Artist (Kate, 16 Nov 2026). Additive, replaces the function only.
-- recruit_set_role now also accepts 'Manager' and 'Make Up Artist' (the list was Hairdresser / Hair Stylist, Hair Assistant, Beautician, Front Desk / Reception, Admin, Other).
-- Undo: put the function back with the old list.
create or replace function public.recruit_set_role(p_id uuid, p_to text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare who text := public.recruit_guard(); v text;
begin
  if p_id is null then raise exception 'bad request'; end if;
  v := case when p_to is null or p_to in ('', 'auto') then null else p_to end;
  if v is not null and v not in ('Hairdresser / Hair Stylist', 'Hair Assistant', 'Beautician', 'Make Up Artist', 'Front Desk / Reception', 'Manager', 'Admin', 'Other') then raise exception 'unknown role'; end if;
  update public.recruit_applicants set role_override = v, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  return jsonb_build_object('ok', true);
end $function$;
