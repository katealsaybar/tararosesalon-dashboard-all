-- 19 Nov 2026 (Kate): the Shortlist WhatsApp must name whoever really shortlisted, not always "Coach Emma".
-- Jho shortlisted an applicant and all three messages (Jho, Frances, Emma) said "Coach Emma has shortlisted".
-- Wording now depends on who clicked Shortlist and who is reading:
--   reader = the person who shortlisted  -> "Hi Jhoana, you have shortlisted X for Hair Assistant, and we need you to interview them. ..."  (tr_recruit_interview_you)
--   shortlister is Coach Emma             -> the existing approved text "Coach Emma has shortlisted X ..."                                   (tr_recruit_interview)
--   anyone else (Jho, Frances, Kate ...)  -> "Hi Frances, Jhoana has shortlisted X for Hair Assistant, and we need you ..."                   (tr_recruit_interview_by)
-- The two new Meta templates must be approved first (approved=false until then). Until a template is approved the
-- person it is meant for is skipped with the reason "template pending"; nobody gets wrong wording.

insert into public.staff_wa_templates (key, kind, label, respond_name, language, body, footer, vars, approved, sort, header)
select 'recruit_interview_you', kind, 'Interview this applicant (you shortlisted)', 'tr_recruit_interview_you', language,
       E'Hi {{1}}, you have shortlisted {{2}} for {{3}}, and we need you to interview them. Their CV and all their details are here: {{4}}\n\nThank you.',
       footer, array['first_name','applicant','role','link'], false, 20, header
  from public.staff_wa_templates where key = 'recruit_interview'
on conflict (key) do nothing;

insert into public.staff_wa_templates (key, kind, label, respond_name, language, body, footer, vars, approved, sort, header)
select 'recruit_interview_by', kind, 'Interview this applicant (someone else shortlisted)', 'tr_recruit_interview_by', language,
       E'Hi {{1}}, {{2}} has shortlisted {{3}} for {{4}}, and we need you to interview them. Their CV and all their details are here: {{5}}\n\nThank you.',
       footer, array['first_name','shortlister','applicant','role','link'], false, 20, header
  from public.staff_wa_templates where key = 'recruit_interview'
on conflict (key) do nothing;

-- Which template and which values for one reader, given who shortlisted (p_email / p_who from the signed-in user).
create or replace function public.recruit_interview_pick(p_email text, p_who text, p_sid bigint, p_applicant text, p_role text, p_link text)
returns table (tkey text, params text[])
language plpgsql stable security definer set search_path to 'public'
as $f$
declare s public.staff_phones; a public.staff_phones; actor text; emma boolean := false; first text;
begin
  select * into s from public.staff_phones where id = p_sid;
  select * into a from public.staff_phones where lower(email) = lower(coalesce(p_email, '')) limit 1;
  first := public.staff_wa_first_name(s.name);
  if lower(coalesce(s.email, '')) = lower(coalesce(p_email, '')) and p_email is not null and p_email <> '' then
    tkey := 'recruit_interview_you'; params := array[first, p_applicant, p_role, p_link]; return next; return;
  end if;
  if a.id is not null and a.id in (select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'notify_emma_ids') then emma := true; end if;
  if emma then
    tkey := 'recruit_interview'; params := array[first, p_applicant, p_role, p_link]; return next; return;
  end if;
  actor := case when a.id is not null then public.staff_wa_first_name(a.name) else split_part(coalesce(p_who, 'The team'), ' ', 1) end;
  tkey := 'recruit_interview_by'; params := array[first, actor, p_applicant, p_role, p_link]; return next;
end $f$;

create or replace function public.recruit_shortlist_notify(p_id uuid, p_role text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  who text := public.recruit_guard(); em text := lower(coalesce(public.kb_me_email(), ''));
  a public.recruit_applicants; t public.staff_wa_templates; cfg public.staff_wa_config; s public.staff_phones;
  chan bigint; ids bigint[]; sid bigint; ph text; v_params text[]; v_batch text; link text; nm text; reason text; pk record;
  queued int := 0; skipped jsonb := '[]'::jsonb; names text[] := '{}'; hr int; roles jsonb; eroles jsonb; body text;
begin
  select * into a from public.recruit_applicants where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  select * into cfg from public.staff_wa_config where id = 1;
  chan := (select value #>> '{}' from public.recruit_settings where key = 'notify_channel_id')::bigint;
  link := coalesce((select value #>> '{}' from public.recruit_settings where key = 'notify_url'), 'https://trk-salon-os.com/?view=recruitment') || '&cand=' || a.id::text;
  nm := left(btrim(regexp_replace(coalesce(a.name, ''), '\s+', ' ', 'g')), 100);
  if nm = '' then nm := 'a new applicant'; end if;

  if a.is_test then
    if chan is null then return jsonb_build_object('queued', 0, 'reason', 'no_channel'); end if;
    if cfg.test_phone is null then return jsonb_build_object('queued', 0, 'reason', 'no_test_number'); end if;
    select * into s from public.staff_phones where phone = cfg.test_phone limit 1;
    if not found then return jsonb_build_object('queued', 0, 'reason', 'no_test_number'); end if;
    select * into pk from public.recruit_interview_pick(em, who, s.id, nm, coalesce(nullif(p_role, ''), 'a role'), link);
    select * into t from public.staff_wa_templates where key = pk.tkey;
    if t.approved then
      insert into public.staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by, is_test)
      values (s.id, t.kind, 'recruit-test-' || a.id::text, 'template', t.key, cfg.test_phone, chan, pk.params, public.staff_wa_render(t.body, pk.params), who, true);
    else
      body := '[TEST, not a real shortlist] ' || public.staff_wa_render(t.body, pk.params);
      insert into public.staff_wa_jobs (staff_id, kind, batch, msg_type, phone, channel_id, body_text, requested_by, is_test)
      values (s.id, 'test', 'recruit-test-' || a.id::text, 'text', cfg.test_phone, chan, left(body, 1000), who, true);
    end if;
    return jsonb_build_object('queued', 1, 'test', true, 'mode', case when t.approved then 'template' else 'text' end, 'names', to_jsonb(array[public.staff_wa_first_name(s.name)]));
  end if;

  roles := coalesce((select value from public.recruit_settings where key = 'notify_roles'), '["Front Desk / Reception", "Hair Assistant", "Other"]'::jsonb);
  eroles := coalesce((select value from public.recruit_settings where key = 'notify_emma_roles'), '[]'::jsonb);
  if p_role is null or not (roles ? p_role or eroles ? p_role) then
    return jsonb_build_object('queued', 0, 'reason', 'role');
  end if;
  if coalesce((select value from public.recruit_settings where key = 'notify_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  if chan is null then return jsonb_build_object('queued', 0, 'reason', 'no_channel'); end if;
  ids := '{}';
  if roles ? p_role then
    ids := ids || array(select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'notify_staff_ids');
  end if;
  if eroles ? p_role then
    ids := ids || array(select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'notify_emma_ids');
  end if;
  ids := array(select distinct x from unnest(ids) x order by x);
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('queued', 0, 'reason', 'no_interviewers'); end if;
  v_batch := 'recruit-' || a.id::text;

  foreach sid in array ids loop
    reason := null; v_params := '{}';
    select * into s from public.staff_phones where id = sid;
    if not found then reason := 'not on the staff list'; end if;
    if reason is null then
      ph := regexp_replace(coalesce(s.phone, ''), '\D', '', 'g');
      if length(ph) < 9 or length(ph) > 15 then reason := 'not a usable number'; else ph := '+' || ph; end if;
    end if;
    if reason is null and exists (select 1 from public.staff_wa_jobs j where not j.is_test and j.staff_id = sid and j.tkey like 'recruit_interview%' and j.batch = v_batch and j.status in ('queued', 'sending', 'sent')) then
      reason := 'already told';
    end if;
    if reason is null then
      select * into pk from public.recruit_interview_pick(em, who, sid, nm, p_role, link);
      select * into t from public.staff_wa_templates where key = pk.tkey;
      if not coalesce(t.approved, false) then reason := 'template pending (' || pk.tkey || ')'; end if;
    end if;
    if reason is null then
      begin
        insert into public.staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by)
        values (sid, t.kind, v_batch, 'template', t.key, ph, chan, pk.params, public.staff_wa_render(t.body, pk.params), who);
        queued := queued + 1; names := names || public.staff_wa_first_name(s.name);
      exception when unique_violation then reason := 'already told';
      end;
    end if;
    if reason is not null then skipped := skipped || jsonb_build_object('name', coalesce(public.staff_wa_first_name(s.name), 'unknown'), 'reason', reason); end if;
  end loop;

  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  return jsonb_build_object('queued', queued, 'names', to_jsonb(names), 'skipped', skipped,
    'sends_now', coalesce(cfg.enabled, false) and hr >= cfg.hour_from and hr < cfg.hour_to, 'hour_from', cfg.hour_from);
end $function$;
