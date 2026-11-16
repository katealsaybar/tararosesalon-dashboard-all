-- Recruitment: Shortlist tells the interviewers on WhatsApp (Kate, 16 Nov 2026).
-- "pag click sa shortlist button ni Coach Emma sa front desk / reception / assistant applications, automatic masend kila ate Jho and ate Frans
--  (through the main whatsapp number ng salon, to their personal numbers) saying they have to interview this applicant, this is their resume, details at the link".
--
-- It reuses the staff WhatsApp queue (migrations/staff_wa.sql): this function only QUEUES one message per interviewer into staff_wa_jobs, and the existing
-- worker (supabase/functions/staff-wa-worker, cron every minute 09:00 to 20:59 Dubai) sends it through respond.io. The sender is the MAIN number,
-- respond.io channel 572200 "WhatsApp Brand Account" (WABA "Tara Rose Salon - respond.io"), NOT the Backup number the payroll messages use.
-- The channel is a setting (notify_channel_id), so changing the sender later is one row.
--
-- What it does, in order (anything that does not hold returns a reason and queues nothing; Shortlist itself always works):
--   1. only the roles in the setting notify_roles: Front Desk / Reception, Hair Assistant and Other (any other staff type). Stylists and beauticians are Coach Emma's own interviews,
--      so they get no WhatsApp; Not stated is left out too. (Kate, 16 Nov 2026: 'pag assistant / recep / front desk / any other type of staff: ate Frans and ate Jho; pag stylist beautician etc Coach Emma'.)
--      The page decides the role from the form text and sends the label.
--   2. notify_enabled must be true (starts FALSE: it goes live only when Kate flips it, after Meta has approved the template)
--   3. the template recruit_interview must be approved in staff_wa_templates (starts FALSE)
--   4. one message per interviewer in notify_staff_ids (staff_phones ids, starts with Jhoana Cairel 23 and Frances Pia Sergio 26), once per applicant:
--      the batch name is 'recruit-<applicant id>', and staff_wa_jobs already refuses a second live message per person, template and batch, so a second
--      click on Shortlist (or Invite again) never sends twice.
-- The message carries: the interviewer's first name, the applicant's name, the role, and the link (the Recruitment page opened on that person, where the CV button is).
-- The WhatsApp template cannot attach the private CV file, so the CV is one click on that page. Ate Jho and ate Frans need the Recruitment page (see the end of this file).
--
-- The staff kill switch (staff_wa_config.enabled), the send window and the daily cap still apply in staff_wa_claim(): outside 09:00 to 20:59 Dubai the message waits for the morning.
-- Who may call it: recruit_guard() (Level 5, or the recruitment extra page, so Coach Emma). Undo: drop the function, delete the recruit_interview template and the three settings.

insert into public.recruit_settings (key, value) values
  ('notify_enabled',    'false'::jsonb),
  ('notify_channel_id', '572200'::jsonb),
  ('notify_staff_ids',  '[23, 26]'::jsonb),
  ('notify_url',        '"https://trk-salon-os.com/?view=recruitment"'::jsonb),
  ('notify_roles',      '["Front Desk / Reception", "Hair Assistant", "Other"]'::jsonb)
on conflict (key) do nothing;

-- The Meta template, to be created in respond.io on the main number (Settings, Channels, WhatsApp Brand Account, Templates), category Utility, English (UK).
-- Brand review before it goes to Meta. Sample values for the Meta form: Jhoana, Aisha Khan, Front Desk / Reception, https://trk-salon-os.com/?view=recruitment&cand=0000
-- A variable may not start or end the body in Meta, hence the closing line.
insert into public.staff_wa_templates (key, kind, label, respond_name, language, body, footer, vars, sort) values
('recruit_interview', 'campaign', 'Interview this applicant', 'tr_recruit_interview', 'en_GB',
$b$Hi {{1}}, Coach Emma has shortlisted {{2}} for {{3}}, and we need you to interview them. Their resume and all their details are here: {{4}}

Thank you.$b$, 'Tara Rose Salons', array['first_name', 'applicant', 'role', 'link'], 20)
on conflict (key) do nothing;

create or replace function public.recruit_shortlist_notify(p_id uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  who text := public.recruit_guard();
  a public.recruit_applicants; t public.staff_wa_templates; cfg public.staff_wa_config; s public.staff_phones;
  chan bigint; ids bigint[]; sid bigint; ph text; v_params text[]; v_batch text; link text; nm text; reason text;
  queued int := 0; skipped jsonb := '[]'::jsonb; names text[] := '{}'; hr int; roles jsonb;
begin
  roles := coalesce((select value from public.recruit_settings where key = 'notify_roles'), '["Front Desk / Reception", "Hair Assistant", "Other"]'::jsonb);
  if p_role is null or not (roles ? p_role) then
    return jsonb_build_object('queued', 0, 'reason', 'role');
  end if;
  if coalesce((select value from public.recruit_settings where key = 'notify_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  select * into a from public.recruit_applicants where id = p_id;
  if not found then raise exception 'no such applicant'; end if;

  select * into t from public.staff_wa_templates where key = 'recruit_interview';
  if not found or not t.approved then return jsonb_build_object('queued', 0, 'reason', 'template_not_approved'); end if;

  chan := (select value #>> '{}' from public.recruit_settings where key = 'notify_channel_id')::bigint;
  if chan is null then return jsonb_build_object('queued', 0, 'reason', 'no_channel'); end if;
  ids := array(select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'notify_staff_ids');
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('queued', 0, 'reason', 'no_interviewers'); end if;

  link := coalesce((select value #>> '{}' from public.recruit_settings where key = 'notify_url'), 'https://trk-salon-os.com/?view=recruitment') || '&cand=' || a.id::text;
  nm := left(btrim(regexp_replace(coalesce(a.name, ''), '\s+', ' ', 'g')), 100);
  if nm = '' then nm := 'a new applicant'; end if;
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

  select * into cfg from public.staff_wa_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  return jsonb_build_object('queued', queued, 'names', to_jsonb(names), 'skipped', skipped,
    'sends_now', coalesce(cfg.enabled, false) and hr >= cfg.hour_from and hr < cfg.hour_to, 'hour_from', cfg.hour_from);
end $$;

revoke all on function public.recruit_shortlist_notify(uuid, text) from public, anon;
grant execute on function public.recruit_shortlist_notify(uuid, text) to authenticated;

-- ── To switch it on (Kate, in this order) ─────────────────────────────────────────────────────────────────────────────
-- 1. respond.io, channel 572200, Templates: create tr_recruit_interview (Utility, English UK) with the body above and the footer Tara Rose Salons; wait for Meta to approve it.
-- 2. update public.staff_wa_templates set approved = true where key = 'recruit_interview';
-- 3. Give ate Jho and ate Frans the Recruitment page (the link in the message opens it; without this they see "only open to Kate and Coach Emma"):
--      update public.dashboard_users set extra_pages = array_append(coalesce(extra_pages, '{}'), 'recruitment')
--      where lower(email) in ('jho.tararose@gmail.com', 'frances.tararose@gmail.com') and not ('recruitment' = any (coalesce(extra_pages, '{}')));
--    (check first that they have dashboard accounts under those emails; the page also needs the database guard, which reads the same extra_pages)
-- 4. update public.recruit_settings set value = 'true'::jsonb where key = 'notify_enabled';
