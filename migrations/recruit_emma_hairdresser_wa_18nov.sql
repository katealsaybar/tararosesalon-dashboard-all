-- Kate, 18 Nov 2026 ("Add Emma to all", "add emma to all hairdresser applications tho"):
-- Coach Emma (staff_phones 28) now gets the Recruitment WhatsApps too.
--   * notify_staff_ids = [23, 26, 28]: the assign notice and the Shortlist WhatsApp for the support roles (notify_roles) go to ate Jho, ate Frances and Emma.
--   * notify_emma_roles / notify_emma_ids: a Shortlist on a Hairdresser / Hair Stylist applicant WhatsApps Emma ONLY (she interviews stylists herself; ate Jho and ate Frances do not get these).
-- recruit_shortlist_notify takes its people from the role: notify_roles -> notify_staff_ids, notify_emma_roles -> notify_emma_ids, both lists joined when a role is in both.
-- Applied live 18 Nov 2026 (execute_sql). The settings are plain rows; the page reads notify_emma_roles to decide whether to call the function (js/recruitment.js notifyShortlist).

insert into public.recruit_settings (key, value, updated_by) values
  ('notify_staff_ids', '[23,26,28]'::jsonb, 'Kate Alsaybar'),
  ('notify_emma_roles', '["Hairdresser / Hair Stylist"]'::jsonb, 'Kate Alsaybar'),
  ('notify_emma_ids', '[28]'::jsonb, 'Kate Alsaybar')
on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by;

CREATE OR REPLACE FUNCTION public.recruit_shortlist_notify(p_id uuid, p_role text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  who text := public.recruit_guard();
  a public.recruit_applicants; t public.staff_wa_templates; cfg public.staff_wa_config; s public.staff_phones;
  chan bigint; ids bigint[]; sid bigint; ph text; v_params text[]; v_batch text; link text; nm text; reason text;
  queued int := 0; skipped jsonb := '[]'::jsonb; names text[] := '{}'; hr int; roles jsonb; eroles jsonb; body text;
begin
  select * into a from public.recruit_applicants where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  select * into t from public.staff_wa_templates where key = 'recruit_interview';
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
    v_params := array[public.staff_wa_first_name(s.name), nm, coalesce(nullif(p_role, ''), 'a role'), link];
    if t.approved then
      insert into public.staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by, is_test)
      values (s.id, t.kind, 'recruit-test-' || a.id::text, 'template', t.key, cfg.test_phone, chan, v_params, public.staff_wa_render(t.body, v_params), who, true);
    else
      body := '[TEST, not a real shortlist] ' || public.staff_wa_render(coalesce(t.body, 'Hi {{1}}, Coach Emma has shortlisted {{2}} for {{3}}, and we would like you to interview them. Their CV and all their details are here: {{4}}'), v_params);
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
  if not t.approved then return jsonb_build_object('queued', 0, 'reason', 'template_not_approved'); end if;
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
    if reason is null and exists (select 1 from public.staff_wa_jobs j where not j.is_test and j.staff_id = sid and j.tkey = t.key and j.batch = v_batch and j.status in ('queued', 'sending', 'sent')) then
      reason := 'already told';
    end if;
    if reason is null then
      v_params := array[public.staff_wa_first_name(s.name), nm, p_role, link];
      begin
        insert into public.staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by)
        values (sid, t.kind, v_batch, 'template', t.key, ph, chan, v_params, public.staff_wa_render(t.body, v_params), who);
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
