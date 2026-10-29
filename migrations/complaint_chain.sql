-- The form's side card "Where it goes" (Kate, 29 Oct 2026): who gets a complaint of this kind at this branch, first, then after each step, and who is always told.
-- Names and emails only (the emails match the online dots); no phone numbers. Same data as the worker uses (complaint_triage_routes).
create or replace function public.cmp_chain(p_type text, p_branch text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g text := public.cmp_group(p_type); cfg record; told jsonb;
begin
  if public.kb_me_email() is null or coalesce(public.kb_level(), 0) < 1 then return null; end if;
  select step_minutes, hours_from, hours_to into cfg from public.complaint_triage_config where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(r.short_name, r.name), 'email', lower(r.email)) order by o), '[]'::jsonb) into told from (
    select r.id, 1 as o from public.complaint_notify_recipients r where lower(r.email) = 'kate@tararosesalon.com'
    union all
    select r.id, 2 from public.complaint_triage_routes tr join public.complaint_notify_recipients r on r.id = tr.recipient_id
     where tr.grp = 'urgent' and tr.branch_code = p_branch) t join public.complaint_notify_recipients r on r.id = t.id;
  return jsonb_build_object(
    'grp', g, 'step_minutes', cfg.step_minutes, 'hours_from', cfg.hours_from, 'hours_to', cfg.hours_to, 'told', told,
    'steps', coalesce((select jsonb_agg(jsonb_build_object('step', s.step, 'people', s.people) order by s.step) from (
        select tr.step, jsonb_agg(jsonb_build_object('name', coalesce(r.short_name, r.name), 'email', lower(r.email)) order by r.id) as people
          from public.complaint_triage_routes tr join public.complaint_notify_recipients r on r.id = tr.recipient_id
         where tr.grp = g and (tr.branch_code is null or tr.branch_code = p_branch) group by tr.step) s), '[]'::jsonb));
end $$;
revoke all on function public.cmp_chain(text, text) from public, anon;
grant execute on function public.cmp_chain(text, text) to authenticated;
