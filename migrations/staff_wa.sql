-- Staff WhatsApp sender (Kate, 29 Oct 2026): payroll messages and campaign announcements to the team, sent from the site through respond.io's
-- Developer API on the BACKUP WhatsApp number (respond.io channel 569496, "WhatsApp Brand Account (Backup nr)"), not a branch number.
-- Same shape as the Lost Clients sender (migrations/lost_send.sql): a queue, a kill switch that starts OFF, approved Meta templates only, a worker
-- edge function (supabase/functions/staff-wa-worker) that does the sending, and a Level 5 page (hub/staff-messages.html, Team Home).
-- Numbers come from public.staff_phones (Level 5 only). No number, name or token is in this file.
--
--   staff_wa_config      one row: kill switch (enabled, OFF), channel id, daily cap, run size, send window in Dubai hours, test number
--   staff_wa_templates   the Meta templates: respond.io template name, body with {{1}}.. variables, which variables, approved (false until Meta approves)
--   staff_wa_jobs        one row per message: queued -> sending -> sent / failed / skipped / cancelled
--   staff_phones         gets wa_payroll / wa_campaign (who may receive which kind) and the respond.io contact id once the contact is created
--
-- Page (Level 5):  staff_wa_info(), staff_wa_jobs_get(batch), staff_wa_enqueue(tkey, batch, staff_ids, vars), staff_wa_cancel(ids), staff_wa_retry(ids),
--                  staff_wa_test(tkey, vars, text), staff_wa_test_get(id), staff_wa_config_set(patch), staff_wa_recipient_set(id, payroll, campaign)
-- Worker only:     staff_wa_claim(n), staff_wa_finish(...)   (revoked from the page; the edge function reaches them with the service role)

alter table public.staff_phones
  add column if not exists wa_payroll boolean not null default true,
  add column if not exists wa_campaign boolean not null default true,
  add column if not exists respond_contact_id bigint,
  add column if not exists respond_synced_at timestamptz;

create table if not exists public.staff_wa_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  channel_id bigint not null default 569496,
  daily_cap int not null default 150 check (daily_cap between 0 and 500),
  per_run int not null default 10 check (per_run between 1 and 30),
  hour_from int not null default 9 check (hour_from between 0 and 23),
  hour_to int not null default 20 check (hour_to between 1 and 24),
  test_phone text,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.staff_wa_config (id) values (1) on conflict do nothing;
alter table public.staff_wa_config enable row level security;

create table if not exists public.staff_wa_templates (
  key text primary key,
  kind text not null check (kind in ('payroll', 'campaign')),
  label text not null,
  respond_name text not null,
  language text not null default 'en',
  body text not null,
  footer text,
  vars text[] not null,          -- what {{1}}, {{2}}.. are, in order; 'first_name' is filled per person, the rest come from the page
  approved boolean not null default false,
  sort int not null default 0
);
alter table public.staff_wa_templates enable row level security;

create table if not exists public.staff_wa_jobs (
  id bigserial primary key,
  staff_id bigint not null references public.staff_phones (id),
  kind text not null,
  batch text not null,                      -- what this send is for, e.g. 'payroll-2026-10' or 'campaign-nov-blonde'
  msg_type text not null default 'template' check (msg_type in ('template', 'text')),
  tkey text references public.staff_wa_templates (key),
  phone text not null,
  channel_id bigint not null,
  params text[] not null default '{}',
  body_text text not null,                  -- the message as it reads, kept as sent
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  error text,
  attempts int not null default 0,
  next_try_at timestamptz not null default now(),
  requested_by text,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  message_id text,
  contact_id bigint,
  is_test boolean not null default false
);
-- One live message per person per template per batch, so a double click cannot send twice.
create unique index if not exists staff_wa_jobs_one_live on public.staff_wa_jobs (staff_id, tkey, batch) where status in ('queued', 'sending', 'sent') and not is_test;
create index if not exists staff_wa_jobs_pick on public.staff_wa_jobs (status, next_try_at);
alter table public.staff_wa_jobs enable row level security;

-- ── helpers ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.staff_wa_level() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select m.level from public.dashboard_me() m limit 1), 0)
$$;

create or replace function public.staff_wa_render(p_body text, p_params text[]) returns text
language plpgsql immutable as $$
declare s text := p_body; i int;
begin
  for i in 1 .. coalesce(array_length(p_params, 1), 0) loop
    s := replace(s, '{{' || i || '}}', p_params[i]);
  end loop;
  return s;
end $$;

-- "Ma. Ercely Vacal" -> Ercely; "Christabelle Bustos" -> Christabelle; a leading title or initial with a full stop is skipped.
create or replace function public.staff_wa_first_name(p_name text) returns text
language sql immutable as $$
  select coalesce((select w from unnest(regexp_split_to_array(btrim(p_name), '\s+')) with ordinality t(w, n) where w !~ '\.$' order by n limit 1), split_part(btrim(p_name), ' ', 1))
$$;

-- ── page functions (Level 5) ─────────────────────────────────────────────────────────────────
create or replace function public.staff_wa_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg staff_wa_config; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_wa_config where id = 1;
  return jsonb_build_object(
    'enabled', cfg.enabled, 'channel_id', cfg.channel_id, 'daily_cap', cfg.daily_cap, 'per_run', cfg.per_run,
    'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to, 'test_ready', cfg.test_phone is not null,
    'used_today', (select count(*) from staff_wa_jobs j where not j.is_test and j.status in ('queued', 'sending', 'sent') and (j.requested_at at time zone 'Asia/Dubai')::date = today),
    'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int,
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'kind', t.kind, 'label', t.label, 'respond_name', t.respond_name, 'body', t.body,
                    'footer', t.footer, 'vars', t.vars, 'approved', t.approved) order by t.sort), '[]'::jsonb) from staff_wa_templates t),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'wa_payroll', s.wa_payroll, 'wa_campaign', s.wa_campaign,
                    'synced', s.respond_contact_id is not null,
                    'team', coalesce(case when p.id is not null then p.dept else null end, k.category, case when pos.email is not null then 'Management & Office' end, 'Other'),
                    'branch', p.branch) order by s.name), '[]'::jsonb)
              from staff_phones s
              left join perf_staff p on p.active and lower(p.email) = lower(s.email)
              left join kb_staff k on k.active and lower(k.email) = lower(s.email)
              left join kb_positions pos on lower(pos.email) = lower(s.email)));
end $$;

create or replace function public.staff_wa_jobs_get(p_batch text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'staff_id', j.staff_id, 'name', s.name, 'kind', j.kind, 'batch', j.batch, 'tkey', j.tkey,
            'status', j.status, 'error', j.error, 'requested_by', j.requested_by, 'requested_at', j.requested_at, 'sent_at', j.sent_at, 'is_test', j.is_test)
            order by j.id desc), '[]'::jsonb)
          from (select * from staff_wa_jobs x where (p_batch is null or x.batch = p_batch) order by x.id desc limit 300) j
          join staff_phones s on s.id = j.staff_id);
end $$;

-- Queue messages. p_vars holds the values shared by everyone in this send (everything except first_name, which is taken from each person's name).
create or replace function public.staff_wa_enqueue(p_tkey text, p_batch text, p_staff_ids bigint[], p_vars jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg staff_wa_config; t staff_wa_templates; who text; sid bigint; s staff_phones; reason text; used int; queued int := 0;
  skipped jsonb := '[]'::jsonb; params text[]; nm text; val text; ph text; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_wa_config where id = 1;
  if not cfg.enabled then raise exception 'Sending is switched off'; end if;
  select * into t from staff_wa_templates where key = p_tkey;
  if not found then raise exception 'unknown template'; end if;
  if not t.approved then raise exception 'That template is not approved in Meta yet'; end if;
  if btrim(coalesce(p_batch, '')) = '' or length(p_batch) > 60 then raise exception 'Give this send a short name'; end if;
  if array_length(p_staff_ids, 1) is null or array_length(p_staff_ids, 1) > 200 then raise exception 'Pick 1 to 200 people'; end if;
  select m.name into who from dashboard_me() m limit 1;
  select count(*) into used from staff_wa_jobs j where not j.is_test and j.status in ('queued', 'sending', 'sent') and (j.requested_at at time zone 'Asia/Dubai')::date = today;
  foreach sid in array p_staff_ids loop
    reason := null; params := '{}';
    select * into s from staff_phones where id = sid;
    if not found then reason := 'not on the staff list'; end if;
    if reason is null and t.kind = 'payroll' and not s.wa_payroll then reason := 'payroll messages are switched off for this person'; end if;
    if reason is null and t.kind = 'campaign' and not s.wa_campaign then reason := 'campaign messages are switched off for this person'; end if;
    if reason is null then
      ph := regexp_replace(coalesce(s.phone, ''), '\D', '', 'g');
      if length(ph) < 9 or length(ph) > 15 then reason := 'not a usable number'; else ph := '+' || ph; end if;
    end if;
    if reason is null and exists (select 1 from staff_wa_jobs j where not j.is_test and j.staff_id = sid and j.tkey = p_tkey and j.batch = p_batch and j.status in ('queued', 'sending', 'sent'))
      then reason := 'already queued or sent in this batch'; end if;
    if reason is null and used + queued >= cfg.daily_cap then reason := 'daily cap reached'; end if;
    if reason is null then
      foreach nm in array t.vars loop
        val := case nm when 'first_name' then staff_wa_first_name(s.name) else btrim(coalesce(p_vars ->> nm, '')) end;
        if val = '' or length(val) > 160 or val ~ '[\n\r\t]' then reason := 'missing or odd ' || nm; exit; end if;
        params := params || val;
      end loop;
    end if;
    if reason is null then
      insert into staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by)
      values (sid, t.kind, p_batch, 'template', t.key, ph, cfg.channel_id, params, staff_wa_render(t.body, params), who);
      queued := queued + 1;
    else
      skipped := skipped || jsonb_build_object('staff_id', sid, 'name', s.name, 'reason', reason);
    end if;
  end loop;
  return jsonb_build_object('queued', queued, 'skipped', skipped);
end $$;

create or replace function public.staff_wa_cancel(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  update staff_wa_jobs set status = 'cancelled', error = null where id = any(p_ids) and status = 'queued';
  get diagnostics n = row_count; return n;
end $$;

-- A failed message that was interrupted mid-send may already have gone: look in respond.io first (the error says so).
create or replace function public.staff_wa_retry(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  update staff_wa_jobs j set status = 'queued', error = null, attempts = 0, next_try_at = now()
  where j.id = any(p_ids) and j.status = 'failed' and not j.is_test
    and not exists (select 1 from staff_wa_jobs k where k.id <> j.id and not k.is_test and k.staff_id = j.staff_id and k.tkey = j.tkey and k.batch = j.batch and k.status in ('queued', 'sending', 'sent'));
  get diagnostics n = row_count; return n;
end $$;

-- A test message to staff_wa_config.test_phone only. With p_text it is a plain WhatsApp message (works inside the 24 hours after that number last wrote
-- to the channel, so it can check the pipeline before any template is approved); without it, the template (must be approved). Allowed while sending is off.
create or replace function public.staff_wa_test(p_tkey text, p_vars jsonb, p_text text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg staff_wa_config; t staff_wa_templates; who text; params text[] := '{}'; nm text; val text; new_id bigint; kate staff_phones;
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_wa_config where id = 1;
  if cfg.test_phone is null then raise exception 'No test number set'; end if;
  select * into kate from staff_phones where phone = cfg.test_phone limit 1;
  if not found then raise exception 'The test number is not on the staff list'; end if;
  select m.name into who from dashboard_me() m limit 1;
  if p_text is not null and btrim(p_text) <> '' then
    insert into staff_wa_jobs (staff_id, kind, batch, msg_type, phone, channel_id, body_text, requested_by, is_test)
    values (kate.id, 'test', 'test', 'text', cfg.test_phone, cfg.channel_id, left(btrim(p_text), 1000), who, true) returning id into new_id;
    return new_id;
  end if;
  select * into t from staff_wa_templates where key = p_tkey;
  if not found then raise exception 'unknown template'; end if;
  if not t.approved then raise exception 'That template is not approved in Meta yet'; end if;
  foreach nm in array t.vars loop
    val := case nm when 'first_name' then staff_wa_first_name(kate.name) else btrim(coalesce(p_vars ->> nm, '')) end;
    if val = '' then raise exception 'missing %', nm; end if;
    params := params || val;
  end loop;
  insert into staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by, is_test)
  values (kate.id, t.kind, 'test', 'template', t.key, cfg.test_phone, cfg.channel_id, params, staff_wa_render(t.body, params), who, true) returning id into new_id;
  return new_id;
end $$;

create or replace function public.staff_wa_test_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  return (select jsonb_build_object('status', status, 'error', error) from staff_wa_jobs where id = p_id and is_test);
end $$;

-- The kill switch and the settings. Pass only what changes: {"enabled": true, "daily_cap": 150, "test_phone": "+971..."}.
create or replace function public.staff_wa_config_set(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from dashboard_me() m limit 1;
  update staff_wa_config set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    daily_cap = coalesce((p_patch ->> 'daily_cap')::int, daily_cap),
    per_run = coalesce((p_patch ->> 'per_run')::int, per_run),
    hour_from = coalesce((p_patch ->> 'hour_from')::int, hour_from),
    hour_to = coalesce((p_patch ->> 'hour_to')::int, hour_to),
    updated_at = now(), updated_by = who
  where id = 1;
  return staff_wa_info();
end $$;

-- Who gets which kind of message (for example someone who has left gets neither).
create or replace function public.staff_wa_recipient_set(p_id bigint, p_payroll boolean, p_campaign boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if staff_wa_level() < 5 then raise exception 'Level 5 only'; end if;
  update staff_phones set wa_payroll = coalesce(p_payroll, wa_payroll), wa_campaign = coalesce(p_campaign, wa_campaign) where id = p_id;
end $$;

-- ── worker functions (service role only) ─────────────────────────────────────────────────────
-- Take up to n queued messages. The kill switch, the Dubai send window and the daily cap are checked HERE, so a worker that is called at the wrong time
-- just gets nothing. Test messages ignore the switch, the window and the cap. A message stuck in 'sending' for 10 minutes is marked failed, not re-sent.
create or replace function public.staff_wa_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg staff_wa_config; hr int; room int; n int; out jsonb; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  select * into cfg from staff_wa_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  update staff_wa_jobs set status = 'failed', error = 'Interrupted while sending. Look in respond.io before you retry; it may have gone.'
    where status = 'sending' and claimed_at < now() - interval '10 minutes';
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  select greatest(0, cfg.daily_cap - count(*)) into room from staff_wa_jobs j
    where not j.is_test and j.status in ('sending', 'sent') and (coalesce(j.sent_at, j.claimed_at) at time zone 'Asia/Dubai')::date = today;
  with cand as (
    select j.id, j.is_test, row_number() over (partition by j.is_test order by j.id) rn
    from staff_wa_jobs j
    where j.status = 'queued' and j.next_try_at <= now()
      and (j.is_test or (cfg.enabled and hr >= cfg.hour_from and hr < cfg.hour_to))
  ), pick as (
    select j.id from staff_wa_jobs j join cand c on c.id = j.id
    where c.is_test or c.rn <= room
    order by j.is_test desc, j.id limit n for update of j skip locked
  ), upd as (
    update staff_wa_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1
    from pick where j.id = pick.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'staff_id', u.staff_id, 'phone', u.phone, 'channel_id', u.channel_id, 'msg_type', u.msg_type,
      'params', u.params, 'body_text', u.body_text, 'is_test', u.is_test, 'attempts', u.attempts, 'template', t.respond_name, 'language', coalesce(t.language, 'en'),
      'name', s.name) order by u.id), '[]'::jsonb)
  into out from upd u join staff_phones s on s.id = u.staff_id left join staff_wa_templates t on t.key = u.tkey;
  return out;
end $$;

-- p_status: 'sent', 'queued' (try again after p_retry_min minutes; the third attempt fails for good), 'failed' or 'skipped'.
create or replace function public.staff_wa_finish(p_id bigint, p_status text, p_error text default null, p_message_id text default null,
  p_contact_id bigint default null, p_retry_min int default 5) returns void
language plpgsql security definer set search_path = public as $$
declare j staff_wa_jobs;
begin
  select * into j from staff_wa_jobs where id = p_id;
  if not found then return; end if;
  if p_contact_id is not null then update staff_phones set respond_contact_id = p_contact_id, respond_synced_at = now() where id = j.staff_id and respond_contact_id is distinct from p_contact_id; end if;
  if p_status = 'sent' then
    update staff_wa_jobs set status = 'sent', sent_at = now(), error = null, message_id = p_message_id, contact_id = p_contact_id where id = p_id;
  elsif p_status = 'queued' and j.attempts < 3 then
    update staff_wa_jobs set status = 'queued', error = left(p_error, 300), next_try_at = now() + make_interval(mins => greatest(p_retry_min, 1)) where id = p_id;
  elsif p_status = 'queued' then
    update staff_wa_jobs set status = 'failed', error = left('Gave up after 3 tries: ' || coalesce(p_error, ''), 300) where id = p_id;
  else
    update staff_wa_jobs set status = case when p_status = 'skipped' then 'skipped' else 'failed' end, error = left(p_error, 300), contact_id = coalesce(p_contact_id, contact_id) where id = p_id;
  end if;
end $$;

-- Supabase grants new functions to anon and authenticated by default; take that away, then give back only what the page needs.
revoke all on function public.staff_wa_level(), public.staff_wa_render(text, text[]), public.staff_wa_first_name(text),
  public.staff_wa_info(), public.staff_wa_jobs_get(text), public.staff_wa_enqueue(text, text, bigint[], jsonb), public.staff_wa_cancel(bigint[]), public.staff_wa_retry(bigint[]),
  public.staff_wa_test(text, jsonb, text), public.staff_wa_test_get(bigint), public.staff_wa_config_set(jsonb), public.staff_wa_recipient_set(bigint, boolean, boolean),
  public.staff_wa_claim(int), public.staff_wa_finish(bigint, text, text, text, bigint, int) from public, anon, authenticated;
grant execute on function public.staff_wa_info(), public.staff_wa_jobs_get(text), public.staff_wa_enqueue(text, text, bigint[], jsonb), public.staff_wa_cancel(bigint[]),
  public.staff_wa_retry(bigint[]), public.staff_wa_test(text, jsonb, text), public.staff_wa_test_get(bigint), public.staff_wa_config_set(jsonb),
  public.staff_wa_recipient_set(bigint, boolean, boolean) to authenticated;
-- staff_wa_level() is called inside the security definer functions above (as their owner), so the page does not need it.

-- The payroll templates (29 Oct 2026, brand-reviewed: SHIP; wording of the reminder and salary templates softened after the review). approved = false until
-- Meta approves each one on the Backup channel (569496) in respond.io (Settings, Channels, Templates); then: update staff_wa_templates set approved = true where key = '...';
-- Sample values for the Meta form: payslip_ready: Aisha, October 2026 | payroll_reminder: Aisha, your timesheet, Friday 6 November | salary_processed: Aisha, October 2026, Monday 2 November.
insert into public.staff_wa_templates (key, kind, label, respond_name, body, footer, vars, sort) values
('payslip_ready', 'payroll', 'Payslip is ready', 'tr_staff_payslip_ready',
$b$Hi {{1}}, your {{2}} payslip is ready. You will receive an email from payroll@tararosesalon.com, where you can view your payroll. If it is not in your inbox, please check your spam folder.

Questions about your payslip? Reply to that email and we will take care of it.$b$, null, array['first_name','month'], 1),
('payroll_reminder', 'payroll', 'Payroll reminder', 'tr_staff_payroll_reminder',
$b$Hi {{1}}, a quick payroll reminder from the Tara Rose team. Could you send us {{2}} by {{3}}? That helps us have everything ready for payroll.

If you need a hand with it, reply here and we will help.$b$, null, array['first_name','item','deadline'], 2),
('salary_processed', 'payroll', 'Salary processed', 'tr_staff_salary_processed',
$b$Hi {{1}}, your {{2}} salary has been processed and should reach your account by {{3}}.

If it has not arrived by then, reply here and we will check it for you today.$b$, null, array['first_name','month','pay_date'], 3)
on conflict (key) do nothing;
-- Run live 29 Oct 2026 after the migration: staff_wa_config.test_phone set by hand to Kate's number (not recorded here); the worker cron:
--   select cron.schedule('staff-wa-worker', '* 5-16 * * *', $$ select net.http_post(
--     url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/staff-wa-worker',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the project anon key, as the other nightly jobs use>'),
--     body := '{}'::jsonb, timeout_milliseconds := 60000); $$);          -- 05:00-16:59 UTC = 09:00-20:59 Dubai
-- Also live: kb_sections row ('staff-wa', 'Accounts & Admin', min_level 5, sort 105). Sending stays OFF (staff_wa_config.enabled = false).

-- 29 Oct 2026, later: the payslip template carries a text header and footer in Meta (static text, no variables, so the worker still sends only the body
-- component). Kept here for the record; the page preview shows the body only.
alter table public.staff_wa_templates add column if not exists header text;
update public.staff_wa_templates set header = 'Payroll update', footer = 'Tara Rose Salons' where key = 'payslip_ready';

-- 29 Oct 2026: tr_staff_payslip_ready SUBMITTED to Meta from respond.io (Backup channel 569496, Utility, English (UK) = en_GB), status Processing. The templates are
-- language en_GB, so the worker sends languageCode en_GB. When Meta approves it: update public.staff_wa_templates set approved = true where key = 'payslip_ready';
update public.staff_wa_templates set language = 'en_GB';
