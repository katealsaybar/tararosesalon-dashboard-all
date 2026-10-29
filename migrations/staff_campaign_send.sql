-- Staff campaign announcements over WhatsApp (Kate, 29 Oct 2026).
-- Before a campaign launches, the salon team hears about it from us, not from Instagram. This sends one approved WhatsApp template to the staff
-- through respond.io's Developer API, from the BACKUP number (respond.io channel 569496 "WhatsApp Brand Account (Backup nr)"), and tags the contact.
-- It is the staff-side twin of the Lost Clients sender (migrations/lost_send.sql); read that for the reasoning behind each guard.
--
--   staff_cmp_config        one row: the kill switch (OFF until Kate switches it on), the channel, the Dubai send window, the number test sends go to
--   staff_cmp_templates     the Meta templates: respond.io name, body with {{1}}.. variables, which variables, approved (false until approved in Meta)
--   staff_cmp_excluded      people who never get a campaign message (left, resigned, not staff), by lower(email) or lower(name)
--   staff_cmp_jobs          one row per message: queued -> sending -> sent / failed / skipped / cancelled
--
-- Numbers: read ONLY inside the security definer functions below from public.staff_phones (RLS Level 5 only). No function returns a phone number to the
-- page; the page sees names and counts. Nothing here holds a number, a name list or a token.
-- Page (Level 5 only): staff_cmp_info(), staff_cmp_jobs_get(campaign), staff_cmp_enqueue(...), staff_cmp_test(...), staff_cmp_cancel(campaign),
--                      staff_cmp_retry(ids), staff_cmp_config_set(patch)
-- Worker only (service role): staff_cmp_claim(n), staff_cmp_finish(...), staff_cmp_tag_todo(n), staff_cmp_tag_done(id, err)
-- Staff messages are mandatory (Kate, 29 Oct 2026): no STOP footer and no opt-out. Only the people in staff_cmp_excluded (left, resigned, not staff) are left out.

create table if not exists public.staff_cmp_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  channel_id bigint not null default 569496,
  channel_label text not null default 'WhatsApp Brand Account (Backup nr)',
  per_run int not null default 10 check (per_run between 1 and 30),
  hour_from int not null default 9 check (hour_from between 0 and 23),
  hour_to int not null default 20 check (hour_to between 1 and 24),
  test_phone text,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.staff_cmp_config (id) values (1) on conflict do nothing;
alter table public.staff_cmp_config enable row level security;

create table if not exists public.staff_cmp_templates (
  key text primary key,
  respond_name text not null,
  language text not null default 'en',
  body text not null,
  footer text,
  vars text[] not null,
  approved boolean not null default false,
  sort int not null default 0
);
alter table public.staff_cmp_templates enable row level security;

-- Wording drafted 29 Oct 2026 in TRS voice (warm, direct, British English). Sample values for the Meta form:
--   heads-up: Aisha, Blonde Standard, Monday 3 November, "A proper blonde plan, from the first consultation to the last toner.", trk-salon-os.com/campaigns/blonde-standard/
--   live:     Aisha, Blonde Standard, trk-salon-os.com/campaigns/blonde-standard/, "Tell us at huddle what you hear from clients today."
insert into public.staff_cmp_templates (key, respond_name, body, footer, vars, sort) values
('heads_up', 'tr_staff_campaign_heads_up',
$b$Hi {{1}}, a quick note from the Tara Rose team. We launch {{2}} on {{3}}, and we wanted you to hear it from us first, before clients start asking.

{{4}}

The details, and how to talk about it at the desk and in the chair, are here: {{5}}

Any questions, reply here and we will come back to you. Thank you for everything you do for our clients.$b$,
null, array['first_name','campaign_name','launch_day','pitch','link'], 1),
('live', 'tr_staff_campaign_live',
$b$Hi {{1}}, {{2}} is live from today. Clients may ask about it in the salon, on WhatsApp and on Instagram, so here it is in one place: {{3}}

{{4}}

Thank you for making it a lovely experience for every client.$b$,
null, array['first_name','campaign_name','link','note'], 2)
on conflict (key) do nothing;

create table if not exists public.staff_cmp_excluded (
  key text primary key,          -- lower(email) or lower(name)
  reason text not null,
  added_at timestamptz not null default now()
);
alter table public.staff_cmp_excluded enable row level security;
insert into public.staff_cmp_excluded (key, reason) values
  ('alan.omeara3@gmail.com', 'Alan Russell resigned, leaves 31 Oct 2026'),
  ('alan joseph russell', 'Alan Russell resigned, leaves 31 Oct 2026'),
  ('josil.tararose@gmail.com', 'Josil Ararao terminated'),
  ('josil ararao', 'Josil Ararao terminated'),
  ('arthy@leadersindigitalmedia.com', 'Agency, not salon staff')
on conflict (key) do nothing;

create table if not exists public.staff_cmp_jobs (
  id bigserial primary key,
  campaign text not null,               -- '<campaign-slug>:<template key>', one live message per person per campaign and template
  phone_id bigint not null,             -- staff_phones.id
  name text not null,
  phone text not null,                  -- +971..., kept only here for the worker; never returned to the page
  tkey text not null references public.staff_cmp_templates (key),
  mode text not null default 'template' check (mode in ('template', 'text')),   -- text is for TEST sends only, inside the 24 hour window
  channel_id bigint not null,
  params text[] not null,
  body_text text not null,
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
  tagged boolean not null default false,
  tag_attempts int not null default 0,
  tag_err text,
  is_test boolean not null default false
);
create unique index if not exists staff_cmp_jobs_one_per_person on public.staff_cmp_jobs (campaign, phone_id) where status in ('queued', 'sending', 'sent') and not is_test;
create index if not exists staff_cmp_jobs_pick on public.staff_cmp_jobs (status, next_try_at);
alter table public.staff_cmp_jobs enable row level security;

-- ── helpers ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.staff_cmp_level() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select m.level from public.dashboard_me() m limit 1), 0)
$$;

create or replace function public.staff_cmp_render(p_body text, p_params text[]) returns text
language plpgsql immutable as $$
declare s text := p_body; i int;
begin
  for i in 1 .. coalesce(array_length(p_params, 1), 0) loop s := replace(s, '{{' || i || '}}', p_params[i]); end loop;
  return s;
end $$;

-- The name she goes by: the first word of her display name in perf_staff when she is a stylist or therapist (Lucy, not Lucia), else the first word
-- of her name, skipping a leading "Ma." style abbreviation.
create or replace function public.staff_cmp_first_name(p_name text, p_email text) returns text
language plpgsql stable security definer set search_path = public as $$
declare d text; w text[];
begin
  if p_email is not null then select display_name into d from perf_staff where lower(email) = lower(p_email) and coalesce(display_name, '') <> '' limit 1; end if;
  w := regexp_split_to_array(btrim(coalesce(d, p_name)), '\s+');
  if array_length(w, 1) > 1 and w[1] ~ '\.$' then return w[2]; end if;
  return w[1];
end $$;

-- ── page functions (Level 5) ─────────────────────────────────────────────────────────────────
create or replace function public.staff_cmp_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg staff_cmp_config;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_cmp_config where id = 1;
  return jsonb_build_object(
    'enabled', cfg.enabled, 'channel_label', cfg.channel_label, 'channel_id', cfg.channel_id, 'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to,
    'test_ready', cfg.test_phone is not null, 'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int,
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'respond_name', t.respond_name, 'body', t.body, 'footer', t.footer,
                    'vars', t.vars, 'approved', t.approved) order by t.sort), '[]'::jsonb) from staff_cmp_templates t),
    -- Names and teams only. Never a number.
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                  'first', staff_cmp_first_name(p.name, p.email),
                  'team', coalesce((select case when s.dept ilike 'beauty' then 'Beauty' else 'Hair' end from perf_staff s where lower(s.email) = lower(p.email) and s.active limit 1),
                                   (select k.category from kb_staff k where lower(k.email) = lower(p.email) limit 1), 'Management and office'),
                  'blocked', exists (select 1 from staff_cmp_excluded x where x.key in (lower(coalesce(p.email, '')), lower(p.name)))) order by p.name), '[]'::jsonb)
               from staff_phones p),
    'excluded', (select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'reason', x.reason) order by x.reason), '[]'::jsonb) from staff_cmp_excluded x where x.key !~ '@'));
end $$;

create or replace function public.staff_cmp_jobs_get(p_campaign text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  return jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from staff_cmp_jobs where campaign = p_campaign and not is_test group by status) c),
    'jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'status', j.status, 'error', j.error, 'sent_at', j.sent_at,
               'tagged', j.tagged) order by j.name), '[]'::jsonb) from staff_cmp_jobs j where j.campaign = p_campaign and not j.is_test));
end $$;

-- Queue the message for the people ticked (p_ids = staff_phones ids). Checked again here, whatever the page sent: the switch is on, the template is
-- approved, every variable has a value, nobody blocked (left, resigned, not staff) is queued, nobody gets the same campaign message twice.
create or replace function public.staff_cmp_enqueue(p_campaign text, p_tkey text, p_vars jsonb, p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg staff_cmp_config; t staff_cmp_templates; who text; slug text; camp text; sp staff_phones; params text[]; nm text; val text;
  queued int := 0; skipped jsonb := '[]'::jsonb; reason text; fn text;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_cmp_config where id = 1;
  if not cfg.enabled then raise exception 'Sending to staff is switched off'; end if;
  select * into t from staff_cmp_templates where key = p_tkey;
  if not found then raise exception 'unknown template'; end if;
  if not t.approved then raise exception 'That template is not approved in Meta yet'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Nobody ticked'; end if;
  slug := regexp_replace(lower(btrim(coalesce(p_vars ->> 'campaign_name', ''))), '[^a-z0-9]+', '-', 'g');
  if slug = '' or slug = '-' then raise exception 'Say which campaign this is'; end if;
  camp := slug || ':' || t.key;
  select m.name into who from dashboard_me() m limit 1;
  for sp in select * from staff_phones where id = any(p_ids) order by name loop
    reason := null; params := '{}';
    if exists (select 1 from staff_cmp_excluded x where x.key in (lower(coalesce(sp.email, '')), lower(sp.name))) then reason := 'not for campaign messages'; end if;
    if reason is null and exists (select 1 from staff_cmp_jobs j where j.campaign = camp and j.phone_id = sp.id and not j.is_test and j.status in ('queued', 'sending', 'sent')) then
      reason := 'already queued or sent'; end if;
    if reason is null then
      fn := staff_cmp_first_name(sp.name, sp.email);
      foreach nm in array t.vars loop
        val := case nm when 'first_name' then fn else btrim(coalesce(p_vars ->> nm, '')) end;
        if val = '' or length(val) > 300 or val ~ '[\n\r\t]' or val ~ '\s{4,}' then reason := 'missing or odd ' || nm; exit; end if;
        params := params || val;
      end loop;
    end if;
    if reason is null then
      insert into staff_cmp_jobs (campaign, phone_id, name, phone, tkey, channel_id, params, body_text, requested_by)
      values (camp, sp.id, sp.name, sp.phone, t.key, cfg.channel_id, params, staff_cmp_render(t.body, params), who);
      queued := queued + 1;
    else
      skipped := skipped || jsonb_build_object('name', sp.name, 'reason', reason);
    end if;
  end loop;
  return jsonb_build_object('campaign', camp, 'queued', queued, 'skipped', skipped);
end $$;

-- A test to staff_cmp_config.test_phone (Kate's own number), through the same worker and channel. Allowed while sending is switched off.
-- p_mode 'text' sends plain text instead of the template: it only arrives if she has written to the backup number in the last 24 hours, so it is
-- for checking the channel before the template is approved.
create or replace function public.staff_cmp_test(p_tkey text, p_vars jsonb, p_mode text default 'template') returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg staff_cmp_config; t staff_cmp_templates; who text; params text[] := '{}'; nm text; val text; sp staff_phones; new_id bigint;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_cmp_config where id = 1;
  if cfg.test_phone is null then raise exception 'No test number set'; end if;
  select * into t from staff_cmp_templates where key = p_tkey;
  if not found then raise exception 'unknown template'; end if;
  if p_mode = 'template' and not t.approved then raise exception 'That template is not approved in Meta yet. Use the plain text test, or wait for approval.'; end if;
  select * into sp from staff_phones where phone = cfg.test_phone limit 1;
  if not found then raise exception 'The test number is not on staff_phones'; end if;
  foreach nm in array t.vars loop
    val := case nm when 'first_name' then staff_cmp_first_name(sp.name, sp.email) else btrim(coalesce(p_vars ->> nm, '')) end;
    if val = '' then raise exception 'missing %', nm; end if;
    params := params || val;
  end loop;
  select m.name into who from dashboard_me() m limit 1;
  insert into staff_cmp_jobs (campaign, phone_id, name, phone, tkey, mode, channel_id, params, body_text, requested_by, is_test)
  values ('test', sp.id, sp.name, sp.phone, t.key, case when p_mode = 'text' then 'text' else 'template' end, cfg.channel_id, params,
          staff_cmp_render(t.body, params), who, true)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.staff_cmp_test_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  return (select jsonb_build_object('status', status, 'error', error, 'body', body_text) from staff_cmp_jobs where id = p_id and is_test);
end $$;

create or replace function public.staff_cmp_cancel(p_campaign text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  update staff_cmp_jobs set status = 'cancelled', error = null where campaign = p_campaign and status = 'queued' and not is_test;
  get diagnostics n = row_count; return n;
end $$;

-- A failed message may already have gone if it dropped mid-send (the error says so): look in respond.io before retrying.
create or replace function public.staff_cmp_retry(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  update staff_cmp_jobs j set status = 'queued', error = null, attempts = 0, next_try_at = now()
  where j.id = any(p_ids) and j.status = 'failed' and not j.is_test
    and not exists (select 1 from staff_cmp_jobs k where k.id <> j.id and k.campaign = j.campaign and k.phone_id = j.phone_id and not k.is_test and k.status in ('queued', 'sending', 'sent'));
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.staff_cmp_config_set(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from dashboard_me() m limit 1;
  update staff_cmp_config set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    per_run = coalesce((p_patch ->> 'per_run')::int, per_run),
    hour_from = coalesce((p_patch ->> 'hour_from')::int, hour_from),
    hour_to = coalesce((p_patch ->> 'hour_to')::int, hour_to),
    updated_at = now(), updated_by = who
  where id = 1;
  return staff_cmp_info();
end $$;

-- ── worker functions (service role only) ─────────────────────────────────────────────────────
-- The switch and the Dubai window are checked HERE, so a worker called at the wrong time just gets nothing. Tests ignore both.
create or replace function public.staff_cmp_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg staff_cmp_config; hr int; n int; out jsonb;
begin
  select * into cfg from staff_cmp_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  update staff_cmp_jobs set status = 'failed', error = 'Interrupted while sending. Look in respond.io before you retry; it may have gone.'
    where status = 'sending' and claimed_at < now() - interval '10 minutes';
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  with pick as (
    select j.id from staff_cmp_jobs j
    where j.status = 'queued' and j.next_try_at <= now() and (j.is_test or (cfg.enabled and hr >= cfg.hour_from and hr < cfg.hour_to))
    order by j.is_test desc, j.id limit n for update of j skip locked
  ), upd as (
    update staff_cmp_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1 from pick where j.id = pick.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'phone', u.phone, 'channel_id', u.channel_id, 'campaign', u.campaign, 'params', u.params,
      'body_text', u.body_text, 'is_test', u.is_test, 'mode', u.mode, 'attempts', u.attempts, 'phone_id', u.phone_id,
      'template', t.respond_name, 'language', t.language, 'footer', t.footer) order by u.id), '[]'::jsonb)
  into out from upd u join staff_cmp_templates t on t.key = u.tkey;
  return out;
end $$;

create or replace function public.staff_cmp_finish(p_id bigint, p_status text, p_error text default null, p_message_id text default null,
  p_contact_id bigint default null, p_retry_min int default 5) returns void
language plpgsql security definer set search_path = public as $$
declare j staff_cmp_jobs;
begin
  select * into j from staff_cmp_jobs where id = p_id;
  if not found then return; end if;
  if p_status = 'sent' then
    update staff_cmp_jobs set status = 'sent', sent_at = now(), error = null, message_id = p_message_id, contact_id = p_contact_id where id = p_id;
  elsif p_status = 'queued' and j.attempts < 3 then
    update staff_cmp_jobs set status = 'queued', error = left(p_error, 300), next_try_at = now() + make_interval(mins => greatest(p_retry_min, 1)) where id = p_id;
  elsif p_status = 'queued' then
    update staff_cmp_jobs set status = 'failed', error = left('Gave up after 3 tries: ' || coalesce(p_error, ''), 300) where id = p_id;
  else
    update staff_cmp_jobs set status = case when p_status = 'skipped' then 'skipped' else 'failed' end, error = left(p_error, 300), contact_id = coalesce(p_contact_id, contact_id) where id = p_id;
  end if;
end $$;

create or replace function public.staff_cmp_tag_todo(p_n int default 20) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'contact_id', j.contact_id,
    'tags', case when j.is_test then jsonb_build_array('staff-cmp-test') else jsonb_build_array('staff-campaign', 'staff-cmp-' || split_part(j.campaign, ':', 1)) end)), '[]'::jsonb)
  from (select * from staff_cmp_jobs where status = 'sent' and not tagged and tag_attempts < 5 and contact_id is not null order by id limit p_n) j
$$;

create or replace function public.staff_cmp_tag_done(p_id bigint, p_err text default null) returns void
language sql security definer set search_path = public as $$
  update staff_cmp_jobs set tagged = (p_err is null), tag_err = left(p_err, 300), tag_attempts = tag_attempts + (case when p_err is null then 0 else 1 end) where id = p_id
$$;

create or replace function public.staff_cmp_add_excluded(p_phone_id bigint, p_reason text default 'Left the team') returns void
language sql security definer set search_path = public as $$
  insert into staff_cmp_excluded (key, reason)
  select lower(coalesce(p.email, p.name)), p_reason from staff_phones p where p.id = p_phone_id
  on conflict (key) do nothing
$$;

-- Supabase grants new functions to anon and authenticated by default; take that away, then give back only what the page needs.
revoke all on function public.staff_cmp_level(), public.staff_cmp_render(text, text[]), public.staff_cmp_first_name(text, text),
  public.staff_cmp_info(), public.staff_cmp_jobs_get(text), public.staff_cmp_enqueue(text, text, jsonb, bigint[]), public.staff_cmp_test(text, jsonb, text),
  public.staff_cmp_test_get(bigint), public.staff_cmp_cancel(text), public.staff_cmp_retry(bigint[]), public.staff_cmp_config_set(jsonb),
  public.staff_cmp_claim(int), public.staff_cmp_finish(bigint, text, text, text, bigint, int), public.staff_cmp_tag_todo(int),
  public.staff_cmp_tag_done(bigint, text), public.staff_cmp_add_excluded(bigint, text) from public, anon, authenticated;
grant execute on function public.staff_cmp_info(), public.staff_cmp_jobs_get(text), public.staff_cmp_enqueue(text, text, jsonb, bigint[]),
  public.staff_cmp_test(text, jsonb, text), public.staff_cmp_test_get(bigint), public.staff_cmp_cancel(text), public.staff_cmp_retry(bigint[]),
  public.staff_cmp_config_set(jsonb) to authenticated;

-- Team Home card (Level 5 only), Management group.
insert into public.kb_sections (key, dept, min_level, staff_dept, sort, skip_levels) values ('staff-campaign', 'Management', 5, null, 88, '{}')
on conflict (key) do nothing;

-- Record of what was run live on 29 Oct 2026 and kept OUT of the repo on purpose (a number and the project anon key):
--   update public.staff_cmp_config set test_phone = '<Kate''s number, as on staff_phones>';
--   select cron.schedule('staff-campaign-worker', '* 5-16 * * *', $$ select net.http_post(
--     url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/staff-campaign-worker',
--     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the project anon key>'),
--     body := '{}'::jsonb, timeout_milliseconds := 60000); $$);          -- 05:00-16:59 UTC = 09:00-20:59 Dubai; the function and claim() enforce the real window
-- Sending stays OFF (staff_cmp_config.enabled = false) until Kate switches it on from the page.
