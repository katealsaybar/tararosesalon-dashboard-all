-- Recruitment: WhatsApp when someone takes applicants, and a daily WhatsApp reminder to open the page (Kate, 17 Nov 2026).
-- "to notify through whatsapp" (after "30 assigned to Frances. The others have been told.", which until now was the bell only) and
-- "also daily reminders na buksan tong recruitment stuff kasi wala pang endpoint (if hired or failed kasi if failed they have to just press a few buttons to send a regret letter)".
--
-- Both reuse the staff WhatsApp queue (migrations/staff_wa.sql): the functions only QUEUE rows in staff_wa_jobs, the existing staff-wa-worker sends them from the MAIN number
-- (respond.io channel 572200, setting notify_channel_id), inside its send window (09:00 to 20:59 Dubai). Same recipients as the Shortlist message (notify_staff_ids, ate Jho 23 and ate Frans 26).
-- Both start OFF and need their template approved by Meta first (approved = false), exactly like the Shortlist message:
--   1. claim_wa_enabled   (false)  recruit_claim_notify(): the page calls it after Assign to me, Take over or a bulk Assign. It tells the OTHER interviewers on WhatsApp who now has
--                                   what ("Frances now has 30 applicants"). Nobody is told about themselves. If the same person took something for the same interviewer in the last 15 minutes
--                                   it does not send again (ticking people one by one would otherwise send ten messages); the bell still shows every one.
--   2. reminder_enabled   (false)  recruit_daily_reminder(): cron at 06:00 UTC = 10:00 Dubai. Counts the shortlisted people with NO final outcome yet (Shortlisted, Interview booked,
--                                   Interview pass, Trade test, Trade pass, Offer letter, Finalise start date) and WhatsApps the interviewers once a day. It sends nothing when the count is 0.
--                                   The message asks them to mark each person Hired or Not passed and says the regret letter is a few clicks. Test people are left out.
--                                   One message per person per day (batch recruit-reminder-<Dubai date>), so running it twice never doubles it.
-- Undo: select cron.unschedule('recruit-daily-reminder'); drop function recruit_daily_reminder, recruit_claim_notify, _recruit_wa_queue; delete the two templates and the three settings.

insert into public.recruit_settings (key, value) values
  ('claim_wa_enabled',   'false'::jsonb),
  ('reminder_enabled',   'false'::jsonb),
  ('reminder_staff_ids', '[23, 26]'::jsonb)
on conflict (key) do nothing;

-- The Meta templates, to be created in respond.io on the main number (Settings, Channels, WhatsApp Brand Account, Templates), category Utility, English (UK), footer Tara Rose Salons.
-- A variable may not start or end the body in Meta, hence the closing line. Sample values for the Meta form are in the comments.
-- Samples recruit_claim:    Jhoana / Frances / 30 applicants / https://trk-salon-os.com/?view=recruitment
-- Samples recruit_reminder: Frances / 4 / 3 days / https://trk-salon-os.com/?view=recruitment
insert into public.staff_wa_templates (key, kind, label, respond_name, language, body, footer, vars, sort) values
('recruit_claim', 'campaign', 'Applicants taken (Recruitment)', 'tr_recruit_claim', 'en_GB',
$b$Hi {{1}}, {{2}} now has {{3}} on the Recruitment page, so please leave those with them and you will not both be working on the same people. Details: {{4}}

Thank you.$b$, 'Tara Rose Salons', array['first_name', 'holder', 'what', 'link'], 21),
('recruit_reminder', 'campaign', 'Daily Recruitment reminder', 'tr_recruit_reminder', 'en_GB',
$b$Hi {{1}}, a daily reminder to open the Recruitment page. Shortlisted applicants still without a final outcome: {{2}}. The longest has been waiting {{3}}. Please mark each one Hired or Not passed. If someone did not pass, the regret letter takes only a few clicks. Open it here: {{4}}

Thank you.$b$, 'Tara Rose Salons', array['first_name', 'open_count', 'longest_wait', 'link'], 22)
on conflict (key) do nothing;

-- Internal: queue one template message per interviewer. Not callable from the page. Returns what was queued and why anyone was skipped.
create or replace function public._recruit_wa_queue(p_tkey text, p_batch text, p_staff bigint[], p_vars text[], p_skip_email text, p_by text, p_throttle_minutes int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t public.staff_wa_templates; cfg public.staff_wa_config; s public.staff_phones; chan bigint; sid bigint; ph text; v_params text[]; reason text;
  queued int := 0; skipped jsonb := '[]'::jsonb; names text[] := '{}'; hr int;
begin
  select * into t from public.staff_wa_templates where key = p_tkey;
  if not found or not t.approved then return jsonb_build_object('queued', 0, 'reason', 'template_not_approved'); end if;
  chan := (select value #>> '{}' from public.recruit_settings where key = 'notify_channel_id')::bigint;
  if chan is null then return jsonb_build_object('queued', 0, 'reason', 'no_channel'); end if;
  if coalesce(array_length(p_staff, 1), 0) = 0 then return jsonb_build_object('queued', 0, 'reason', 'no_interviewers'); end if;

  foreach sid in array p_staff loop
    reason := null;
    select * into s from public.staff_phones where id = sid;
    if not found then reason := 'not on the staff list'; end if;
    if reason is null and p_skip_email is not null and lower(s.email) = lower(p_skip_email) then reason := 'is the person who took them'; end if;
    if reason is null then
      ph := regexp_replace(coalesce(s.phone, ''), '\D', '', 'g');
      if length(ph) < 9 or length(ph) > 15 then reason := 'not a usable number'; else ph := '+' || ph; end if;
    end if;
    if reason is null and exists (select 1 from public.staff_wa_jobs j where not j.is_test and j.staff_id = sid and j.tkey = t.key and j.batch = p_batch and j.status in ('queued', 'sending', 'sent')) then
      reason := 'already told';
    end if;
    if reason is null and p_throttle_minutes > 0 and exists (
         select 1 from public.staff_wa_jobs j
          where not j.is_test and j.staff_id = sid and j.tkey = t.key and j.status in ('queued', 'sending', 'sent')
            and j.params[2] is not distinct from p_vars[1] and j.requested_at > now() - make_interval(mins => p_throttle_minutes)) then
      reason := 'told a moment ago';
    end if;
    if reason is null then
      v_params := array[public.staff_wa_first_name(s.name)] || p_vars;
      begin
        insert into public.staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by)
        values (sid, t.kind, p_batch, 'template', t.key, ph, chan, v_params, public.staff_wa_render(t.body, v_params), p_by);
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
revoke all on function public._recruit_wa_queue(text, text, bigint[], text[], text, text, int) from public, anon, authenticated;

-- Called by the page after a successful assign. p_holder_email = who now holds them (null = the caller); p_count = how many; p_label = the person's name when it is one person.
create or replace function public.recruit_claim_notify(p_holder_email text default null, p_count int default 1, p_label text default null, p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  who text := public.recruit_guard(); hem text := lower(coalesce(nullif(btrim(p_holder_email), ''), public.kb_me_email()));
  hname text; what text; link text; ids bigint[]; res jsonb;
begin
  if coalesce((select value from public.recruit_settings where key = 'claim_wa_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  if coalesce(p_count, 0) < 1 then return jsonb_build_object('queued', 0, 'reason', 'nothing'); end if;
  select coalesce(u.name, hem) into hname from public.dashboard_users u where lower(u.email) = hem limit 1;
  hname := public.staff_wa_first_name(coalesce(hname, hem));
  what := case when p_count > 1 then p_count::text || ' applicants' else coalesce(nullif(left(btrim(p_label), 60), ''), 'an applicant') end;
  link := coalesce((select value #>> '{}' from public.recruit_settings where key = 'notify_url'), 'https://trk-salon-os.com/?view=recruitment')
          || case when p_count = 1 and p_id is not null then '&cand=' || p_id::text else '' end;
  ids := array(select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'notify_staff_ids');
  res := public._recruit_wa_queue('recruit_claim', 'claim-' || floor(extract(epoch from clock_timestamp()))::text || '-' || hem, ids, array[hname, what, link], hem, who, 15);
  return res;
end $$;
revoke all on function public.recruit_claim_notify(text, int, text, uuid) from public, anon;
grant execute on function public.recruit_claim_notify(text, int, text, uuid) to authenticated;

-- The daily reminder. No login: cron runs it as the database owner; the page cannot call it.
create or replace function public.recruit_daily_reminder() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n int; oldest timestamptz; days int; longest text; ids bigint[]; link text;
  open_stages text[] := array['screening', 'interview_booked', 'interview_pass', 'trade_test', 'trade_pass', 'offer', 'offer_to_send', 'offer_sent', 'start_pending'];
begin
  if coalesce((select value from public.recruit_settings where key = 'reminder_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  select count(*), min(coalesce(a.decided_at, a.updated_at, a.applied_at)) into n, oldest
    from public.recruit_applicants a where a.stage = any (open_stages) and not coalesce(a.is_test, false);
  if n = 0 then return jsonb_build_object('queued', 0, 'reason', 'nobody_open'); end if;
  days := greatest(0, (now() at time zone 'Asia/Dubai')::date - (oldest at time zone 'Asia/Dubai')::date);
  longest := case when days = 0 then 'less than a day' when days = 1 then '1 day' else days::text || ' days' end;
  link := coalesce((select value #>> '{}' from public.recruit_settings where key = 'notify_url'), 'https://trk-salon-os.com/?view=recruitment');
  ids := array(select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'reminder_staff_ids');
  return public._recruit_wa_queue('recruit_reminder', 'recruit-reminder-' || to_char(now() at time zone 'Asia/Dubai', 'YYYY-MM-DD'), ids, array[n::text, longest, link], null, 'Daily reminder', 0)
         || jsonb_build_object('open', n, 'longest', longest);
end $$;
revoke all on function public.recruit_daily_reminder() from public, anon, authenticated;

-- 10:00 Dubai every day (06:00 UTC). The function itself does nothing until reminder_enabled is true and the template is approved.
do $c$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'recruit-daily-reminder';
    perform cron.schedule('recruit-daily-reminder', '0 6 * * *', 'select public.recruit_daily_reminder()');
  end if;
end $c$;

-- ── To switch on (Kate, in this order) ──────────────────────────────────────────────────────────────────────────────
-- 1. respond.io, channel 572200, Templates: create tr_recruit_claim and tr_recruit_reminder (Utility, English UK) with the bodies above; wait for Meta to approve each.
-- 2. update public.staff_wa_templates set approved = true where key in ('recruit_claim', 'recruit_reminder');   -- each one only after Meta approves it
-- 3. update public.recruit_settings set value = 'true'::jsonb where key = 'claim_wa_enabled';    -- the page asks after every assign
--    update public.recruit_settings set value = 'true'::jsonb where key = 'reminder_enabled';    -- 10:00 Dubai from the next morning
