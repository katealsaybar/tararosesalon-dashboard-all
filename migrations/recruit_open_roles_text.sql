-- Recruitment: the roles we are hiring for are typed (Kate, 10 Nov 2026). Applied live 10 Nov. Additive.
-- recruit_settings_set now also accepts the key open_roles_text (a plain string, "Hair stylist, Receptionist"). The page reads it; until it is set the page
-- starts from the old open_roles switches. Undo: remove 'open_roles_text' from the key list below and delete its row in recruit_settings.
create or replace function public.recruit_settings_set(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_key is null or p_key not in ('open_roles', 'open_roles_text', 'booking_link', 'invite_template', 'decline_template', 'decline_subject', 'decline_confirmed', 'templates_confirmed', 'wait_days') then
    raise exception 'unknown setting';
  end if;
  if p_value is null then raise exception 'a value is needed'; end if;
  insert into public.recruit_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), who)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = who;
end $$;
