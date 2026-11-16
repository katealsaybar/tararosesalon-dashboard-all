-- Recruitment: a Test choice in the Status drop-down (Kate, 16 Nov 2026: "add ka test sa status dropdown"; asked first, she chose "Test row, WhatsApp only to you").
-- A row marked Test is for trying Shortlist without bothering anyone:
--   * the interviewer WhatsApp for a Test row goes ONLY to staff_wa_config.test_phone (Kate's own number), never to ate Jho and ate Frans
--   * it works before the switch is on and for any role (the checks that stop a real row do not apply to a test), so the whole path can be tried first
--   * with the Meta template approved it goes as the template; until then it goes as plain text marked [TEST] (respond.io only delivers plain text inside the 24 hours
--     after your number last wrote to channel 572200, so write to that number first)
--   * the job is a test job in staff_wa_jobs (is_test), so it ignores the kill switch, the send window and the daily cap, and a second Shortlist sends again
--   * on the page a Test row is left out of the tiles, the lanes and the Waiting count; it shows only in List view, where its Status drop-down can set it back
-- recruit_applicants.is_test        boolean, false by default
-- recruit_set_test(id, flag)        Kate / Coach Emma only (recruit_guard)
-- recruit_get()                     now also returns 'is_test' (patched in place below, so nothing else in it changes)
-- recruit_shortlist_notify()        replaced: same rules as recruit_shortlist_notify.sql plus the Test branch
-- Undo: drop function recruit_set_test, drop column is_test, put recruit_get and recruit_shortlist_notify back from their earlier files.

alter table public.recruit_applicants add column if not exists is_test boolean not null default false;

create or replace function public.recruit_set_test(p_id uuid, p_flag boolean) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  update public.recruit_applicants set is_test = coalesce(p_flag, false), updated_at = now() where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
end $$;
revoke all on function public.recruit_set_test(uuid, boolean) from public, anon;
grant execute on function public.recruit_set_test(uuid, boolean) to authenticated;

-- recruit_get returns is_test: take the live function as it is and add the one field (does nothing if it is already there)
do $do$
declare d text := pg_get_functiondef('public.recruit_get()'::regprocedure);
begin
  if position('''is_test''' in d) = 0 then
    d := replace(d, '''stage'', a.stage', '''is_test'', a.is_test, ''stage'', a.stage');
    if position('''is_test''' in d) = 0 then raise exception 'recruit_get has no stage field to anchor on'; end if;
    execute d;
  end if;
end $do$;

create or replace function public.recruit_shortlist_notify(p_id uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  who text := public.recruit_guard();
  a public.recruit_applicants; t public.staff_wa_templates; cfg public.staff_wa_config; s public.staff_phones;
  chan bigint; ids bigint[]; sid bigint; ph text; v_params text[]; v_batch text; link text; nm text; reason text;
  queued int := 0; skipped jsonb := '[]'::jsonb; names text[] := '{}'; hr int; roles jsonb; body text;
begin
  select * into a from public.recruit_applicants where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  select * into t from public.staff_wa_templates where key = 'recruit_interview';
  select * into cfg from public.staff_wa_config where id = 1;
  chan := (select value #>> '{}' from public.recruit_settings where key = 'notify_channel_id')::bigint;
  link := coalesce((select value #>> '{}' from public.recruit_settings where key = 'notify_url'), 'https://trk-salon-os.com/?view=recruitment') || '&cand=' || a.id::text;
  nm := left(btrim(regexp_replace(coalesce(a.name, ''), '\s+', ' ', 'g')), 100);
  if nm = '' then nm := 'a new applicant'; end if;

  -- a Test row: only to the test number, any role, switch on or off
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
  if p_role is null or not (roles ? p_role) then
    return jsonb_build_object('queued', 0, 'reason', 'role');
  end if;
  if coalesce((select value from public.recruit_settings where key = 'notify_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  if not t.approved then return jsonb_build_object('queued', 0, 'reason', 'template_not_approved'); end if;
  if chan is null then return jsonb_build_object('queued', 0, 'reason', 'no_channel'); end if;
  ids := array(select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'notify_staff_ids');
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
end $$;

revoke all on function public.recruit_shortlist_notify(uuid, text) from public, anon;
grant execute on function public.recruit_shortlist_notify(uuid, text) to authenticated;
