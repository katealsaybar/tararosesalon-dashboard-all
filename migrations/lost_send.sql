-- Lost Clients: send the WhatsApp messages from the site, through respond.io (Kate, 12 Oct 2026).
-- Phase 1 is WhatsApp only. The To message tab queues a message per client, the lost-send-worker edge function sends them one at a time through
-- respond.io's Developer API using Meta-approved templates, then tags the contact in respond.io. Texts (SMS) are Phase 2 and are not here.
--
--   lost_send_config          one row: the kill switch (enabled, OFF until Kate switches it on), daily cap, per-minute run size, the send window in
--                             Dubai hours, the campaign tag, the offer figures that fill the templates, and the number test sends go to
--   lost_send_channels        branch code -> respond.io WhatsApp channel id (the four per-branch numbers)
--   lost_send_templates       the Meta templates: respond.io template name, the body with {{1}}.. variables, the footer, which variables, and
--                             approved (false until the template is approved in Meta; nothing is queued with an unapproved template)
--   lost_send_jobs            one row per message: queued -> sending -> sent / failed / skipped / cancelled, with the error and the tag result
--   lost_send_optout          numbers that said STOP (or were put here by hand); never queued again
--
-- Page (Level 3+):   lost_send_info(), lost_send_jobs_get(), lost_send_enqueue(items), lost_send_cancel(ids), lost_send_retry(ids), lost_send_test(tkey, vars)
-- Level 5:           lost_send_config_set(patch)
-- Worker only:       lost_send_claim(n), lost_send_finish(...), lost_send_tag_todo(n), lost_send_tag_done(id, err), lost_send_add_optout(phone, reason)
--                    (revoked from the page; the edge function reaches them with the service role)
-- Tables have RLS on and no policy; everything reads through these functions (security definer, level checked inside).
-- A sent message is also marked in lost_messaged (list_id 'q', sent_by 'site:<who>') so To message shows it as Sent at once.

create table if not exists public.lost_send_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  daily_cap int not null default 50 check (daily_cap between 0 and 500),
  per_run int not null default 10 check (per_run between 1 and 30),
  hour_from int not null default 10 check (hour_from between 0 and 23),
  hour_to int not null default 19 check (hour_to between 1 and 24),
  campaign_tag text not null default 'lost-clients-2026-10',
  offer_smoothing text not null default '30%',
  offer_colour text not null default '20%',
  offer_until text not null default '31 October',
  test_phone text,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.lost_send_config (id) values (1) on conflict do nothing;
alter table public.lost_send_config enable row level security;

create table if not exists public.lost_send_channels (
  branch text primary key,
  channel_id bigint not null,
  label text not null
);
insert into public.lost_send_channels (branch, channel_id, label) values
  ('SAA', 340071, 'Saadiyat (Mamsha) +971 50 196 8720'),
  ('MC',  346361, 'Motor City +971 52 496 0903'),
  ('KCA', 354400, 'Khalifa City A +971 50 281 1494'),
  ('AQ',  356339, 'Al Quoz +971 55 624 5520')
on conflict (branch) do nothing;
alter table public.lost_send_channels enable row level security;

create table if not exists public.lost_send_templates (
  key text primary key,                 -- smoothing, smoothing_gap, smoothing_stop, colour, ... due_stop
  qtype text not null check (qtype in ('smoothing', 'colour', 'due')),
  variant text not null check (variant in ('', 'gap', 'stop')),   -- '' normal, gap = replied 12 to 18 months ago, stop = no reply seen (has the STOP footer)
  respond_name text not null,           -- the template name in Meta / respond.io
  language text not null default 'en',
  body text not null,                   -- the approved body, {{1}}.. for the variables
  footer text,
  vars text[] not null,                 -- what {{1}}, {{2}}.. are, in order
  approved boolean not null default false,
  sort int not null default 0
);
alter table public.lost_send_templates enable row level security;

-- The wording is the Emma-approved set of 12 Oct 2026 (lost_templates_emma_approved.sql), unchanged except: the offer figure and date are variables
-- (a new offer needs no new template), "with {stylist}" is a variable that reads "our team" when she has no usual stylist, and the two openings.
-- Sample values for the Meta form: Sara, Saadiyat, Nikki, August 2026, 30%, 31 October.
insert into public.lost_send_templates (key, qtype, variant, respond_name, body, footer, vars, sort) values
('smoothing', 'smoothing', '', 'tr_lost_smoothing',
$b$Hi {{1}}, it's Tara Rose {{2}}. You've been on our minds.

Your last smoothing with {{3}} was back in {{4}}, and smoothing softens over time. We'd love to see how your hair is feeling now, and we'll tell you honestly what it needs, even if the answer is "not yet".

Because we've missed you, your next smoothing is {{5}} off until {{6}}.

Shall we find you a time? 🤍$b$, null, array['first_name','branch','stylist','month','offer_pct','offer_until'], 1),
('smoothing_gap', 'smoothing', 'gap', 'tr_lost_smoothing_gap',
$b$Hi {{1}}, it's been a while since we last chatted. This is Tara Rose {{2}}, and you've been on our minds.

Your last smoothing with {{3}} was back in {{4}}, and smoothing softens over time. We'd love to see how your hair is feeling now, and we'll tell you honestly what it needs, even if the answer is "not yet".

Because we've missed you, your next smoothing is {{5}} off until {{6}}.

Shall we find you a time? 🤍$b$, null, array['first_name','branch','stylist','month','offer_pct','offer_until'], 2),
('smoothing_stop', 'smoothing', 'stop', 'tr_lost_smoothing_stop',
$b$Hi {{1}}, it's Tara Rose {{2}}. You've been on our minds.

Your last smoothing with {{3}} was back in {{4}}, and smoothing softens over time. We'd love to see how your hair is feeling now, and we'll tell you honestly what it needs, even if the answer is "not yet".

Because we've missed you, your next smoothing is {{5}} off until {{6}}.

Shall we find you a time? 🤍$b$, 'If you''d rather not hear from us, reply STOP', array['first_name','branch','stylist','month','offer_pct','offer_until'], 3),

('colour', 'colour', '', 'tr_lost_colour',
$b$Hi {{1}}, it's Tara Rose {{2}}. You've been on our minds.

Your last colour was in {{3}}, and a lot can change in a few months. Hair grows, tones soften, and sometimes you just fancy something different.

We'd also like to introduce you to our new stylists. We'll start by looking at your hair together and build a plan around you.

As a welcome back, your next colour is {{4}} off until {{5}}.

Shall we find you a time? 🤍$b$, null, array['first_name','branch','month','offer_pct','offer_until'], 4),
('colour_gap', 'colour', 'gap', 'tr_lost_colour_gap',
$b$Hi {{1}}, it's been a while since we last chatted. This is Tara Rose {{2}}, and you've been on our minds.

Your last colour was in {{3}}, and a lot can change in a few months. Hair grows, tones soften, and sometimes you just fancy something different.

We'd also like to introduce you to our new stylists. We'll start by looking at your hair together and build a plan around you.

As a welcome back, your next colour is {{4}} off until {{5}}.

Shall we find you a time? 🤍$b$, null, array['first_name','branch','month','offer_pct','offer_until'], 5),
('colour_stop', 'colour', 'stop', 'tr_lost_colour_stop',
$b$Hi {{1}}, it's Tara Rose {{2}}. You've been on our minds.

Your last colour was in {{3}}, and a lot can change in a few months. Hair grows, tones soften, and sometimes you just fancy something different.

We'd also like to introduce you to our new stylists. We'll start by looking at your hair together and build a plan around you.

As a welcome back, your next colour is {{4}} off until {{5}}.

Shall we find you a time? 🤍$b$, 'If you''d rather not hear from us, reply STOP', array['first_name','branch','month','offer_pct','offer_until'], 6),

('due', 'due', '', 'tr_lost_due',
$b$Hi {{1}}, it's Tara Rose {{2}}. We've missed you.

It's been a little while since we saw you with {{3}}. Tell us what's been on your mind, whether that's a fresh cut, a colour refresh or a catch-up, and we'll find a time that suits you.

We'd love to have you back in the chair. 🤍$b$, null, array['first_name','branch','stylist'], 7),
('due_gap', 'due', 'gap', 'tr_lost_due_gap',
$b$Hi {{1}}, it's been a while since we last chatted. This is Tara Rose {{2}}, and we've missed you.

It's been a little while since we saw you with {{3}}. Tell us what's been on your mind, whether that's a fresh cut, a colour refresh or a catch-up, and we'll find a time that suits you.

We'd love to have you back in the chair. 🤍$b$, null, array['first_name','branch','stylist'], 8),
('due_stop', 'due', 'stop', 'tr_lost_due_stop',
$b$Hi {{1}}, it's Tara Rose {{2}}. We've missed you.

It's been a little while since we saw you with {{3}}. Tell us what's been on your mind, whether that's a fresh cut, a colour refresh or a catch-up, and we'll find a time that suits you.

We'd love to have you back in the chair. 🤍$b$, 'If you''d rather not hear from us, reply STOP', array['first_name','branch','stylist'], 9)
on conflict (key) do nothing;

create table if not exists public.lost_send_jobs (
  id bigserial primary key,
  client_key text not null,
  dup_keys text[] not null default '{}',     -- other clients on the same number, marked sent with her
  phone text not null,                       -- +971..., digits only after the plus
  branch text not null,
  channel_id bigint not null,
  qtype text not null,
  tkey text not null references public.lost_send_templates (key),
  params text[] not null,                    -- the values for {{1}}.. in order
  body_text text not null,                   -- the message as it reads, kept as sent
  campaign text not null,                    -- lost_send_config.campaign_tag when it was queued
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
-- One live message per client per campaign, so a double click or two people queueing the same client cannot send twice.
create unique index if not exists lost_send_jobs_one_per_client on public.lost_send_jobs (client_key, campaign) where status in ('queued', 'sending', 'sent') and not is_test;
create index if not exists lost_send_jobs_pick on public.lost_send_jobs (status, next_try_at);
create index if not exists lost_send_jobs_phone on public.lost_send_jobs (phone);
alter table public.lost_send_jobs enable row level security;

create table if not exists public.lost_send_optout (
  phone text primary key,
  reason text,
  added_at timestamptz not null default now(),
  added_by text
);
alter table public.lost_send_optout enable row level security;

-- ── helpers ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.lost_send_render(p_body text, p_params text[]) returns text
language plpgsql immutable as $$
declare s text := p_body; i int;
begin
  for i in 1 .. coalesce(array_length(p_params, 1), 0) loop
    s := replace(s, '{{' || i || '}}', p_params[i]);
  end loop;
  return s;
end $$;

create or replace function public.lost_send_level() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select m.level from public.dashboard_me() m limit 1), 0)
$$;

-- ── page functions (Level 3+) ────────────────────────────────────────────────────────────────
create or replace function public.lost_send_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg lost_send_config; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  return jsonb_build_object(
    'enabled', cfg.enabled, 'daily_cap', cfg.daily_cap, 'per_run', cfg.per_run, 'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to,
    'campaign_tag', cfg.campaign_tag, 'offer_smoothing', cfg.offer_smoothing, 'offer_colour', cfg.offer_colour, 'offer_until', cfg.offer_until,
    'test_ready', cfg.test_phone is not null,
    'used_today', (select count(*) from lost_send_jobs j where not j.is_test and j.campaign = cfg.campaign_tag and j.status in ('queued', 'sending', 'sent')
                    and (j.requested_at at time zone 'Asia/Dubai')::date = today),
    'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int,
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'qtype', t.qtype, 'variant', t.variant, 'respond_name', t.respond_name,
                    'body', t.body, 'footer', t.footer, 'vars', t.vars, 'approved', t.approved) order by t.sort), '[]'::jsonb) from lost_send_templates t),
    'branches', (select coalesce(jsonb_agg(c.branch), '[]'::jsonb) from lost_send_channels c));
end $$;

create or replace function public.lost_send_jobs_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg lost_send_config;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'client_key', j.client_key, 'dup_keys', j.dup_keys, 'status', j.status, 'error', j.error,
            'requested_by', j.requested_by, 'requested_at', j.requested_at, 'sent_at', j.sent_at, 'tagged', j.tagged, 'tag_err', j.tag_err, 'is_test', j.is_test)), '[]'::jsonb)
          from (select distinct on (x.client_key) x.* from lost_send_jobs x
                where x.campaign = cfg.campaign_tag and not x.is_test order by x.client_key, x.id desc) j);
end $$;

-- Queue messages. Items: [{client_key, phone, branch, tkey, vars:{first_name, branch, stylist, month}, dups:[client_key..]}].
-- Everything the page sends is checked again here: the template exists and is approved, the number looks like a number, the branch has a channel,
-- the number has not opted out, the client or the number is not already queued or sent in this campaign, the daily cap is not passed, and every
-- variable has a value. Returns how many were queued and why each of the others was not.
create or replace function public.lost_send_enqueue(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg lost_send_config; who text; it jsonb; t lost_send_templates; ph text; ch bigint; reason text; ck text;
  used int; queued int := 0; skipped jsonb := '[]'::jsonb; params text[]; nm text; val text; vars jsonb; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  if not cfg.enabled then raise exception 'Sending from the site is switched off'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then raise exception 'Send up to 500 at a time'; end if;
  select m.name into who from dashboard_me() m limit 1;
  select count(*) into used from lost_send_jobs j where not j.is_test and j.campaign = cfg.campaign_tag and j.status in ('queued', 'sending', 'sent')
    and (j.requested_at at time zone 'Asia/Dubai')::date = today;
  for it in select * from jsonb_array_elements(p_items) loop
    reason := null; ck := it ->> 'client_key'; ph := null; ch := null; params := '{}';
    if coalesce(ck, '') = '' then reason := 'no client'; end if;
    if reason is null then
      select * into t from lost_send_templates where key = it ->> 'tkey';
      if not found then reason := 'unknown template'; elsif not t.approved then reason := 'template not approved yet'; end if;
    end if;
    if reason is null then
      ph := regexp_replace(coalesce(it ->> 'phone', ''), '\D', '', 'g');
      if length(ph) < 9 or length(ph) > 15 then reason := 'not a usable number'; else ph := '+' || ph; end if;
    end if;
    if reason is null then
      select channel_id into ch from lost_send_channels where branch = it ->> 'branch';
      if ch is null then reason := 'no WhatsApp channel for this branch'; end if;
    end if;
    if reason is null and exists (select 1 from lost_send_optout o where o.phone = ph) then reason := 'opted out'; end if;
    if reason is null and exists (select 1 from lost_send_jobs j where not j.is_test and j.campaign = cfg.campaign_tag
         and j.status in ('queued', 'sending', 'sent') and (j.phone = ph or j.client_key = ck)) then reason := 'already queued or sent'; end if;
    if reason is null and used + queued >= cfg.daily_cap then reason := 'daily cap reached'; end if;
    if reason is null then
      vars := coalesce(it -> 'vars', '{}'::jsonb);
      foreach nm in array t.vars loop
        val := case nm
                 when 'offer_pct' then (case t.qtype when 'colour' then cfg.offer_colour else cfg.offer_smoothing end)
                 when 'offer_until' then cfg.offer_until
                 else btrim(coalesce(vars ->> nm, '')) end;
        if val = '' or length(val) > 60 or val ~ '[\n\r\t]' then reason := 'missing or odd ' || nm; exit; end if;
        params := params || val;
      end loop;
    end if;
    if reason is null then
      insert into lost_send_jobs (client_key, dup_keys, phone, branch, channel_id, qtype, tkey, params, body_text, campaign, requested_by)
      values (ck, array(select jsonb_array_elements_text(coalesce(it -> 'dups', '[]'::jsonb))), ph, it ->> 'branch', ch, t.qtype, t.key, params,
              lost_send_render(t.body, params), cfg.campaign_tag, who);
      queued := queued + 1;
    else
      skipped := skipped || jsonb_build_object('client_key', ck, 'reason', reason);
    end if;
  end loop;
  return jsonb_build_object('queued', queued, 'skipped', skipped);
end $$;

create or replace function public.lost_send_cancel(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  update lost_send_jobs set status = 'cancelled', error = null where id = any(p_ids) and status = 'queued';
  get diagnostics n = row_count; return n;
end $$;

-- Retry a failed message. A message that was interrupted mid-send may already have gone, so look in respond.io first (the error says so).
create or replace function public.lost_send_retry(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  update lost_send_jobs j set status = 'queued', error = null, attempts = 0, next_try_at = now()
  where j.id = any(p_ids) and j.status = 'failed'
    and not exists (select 1 from lost_send_jobs k where k.id <> j.id and not k.is_test and k.campaign = j.campaign and k.status in ('queued', 'sending', 'sent')
                    and (k.client_key = j.client_key or k.phone = j.phone));
  get diagnostics n = row_count; return n;
end $$;

-- A test message to the number in lost_send_config.test_phone, through the same worker and the same template. Allowed while sending is switched off.
create or replace function public.lost_send_test(p_tkey text, p_vars jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg lost_send_config; t lost_send_templates; who text; params text[] := '{}'; nm text; val text; ch bigint; new_id bigint;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  if cfg.test_phone is null then raise exception 'No test number set'; end if;
  select * into t from lost_send_templates where key = p_tkey;
  if not found then raise exception 'unknown template'; end if;
  if not t.approved then raise exception 'That template is not approved yet'; end if;
  select channel_id into ch from lost_send_channels where branch = 'SAA';
  foreach nm in array t.vars loop
    val := case nm when 'offer_pct' then (case t.qtype when 'colour' then cfg.offer_colour else cfg.offer_smoothing end)
                   when 'offer_until' then cfg.offer_until else btrim(coalesce(p_vars ->> nm, '')) end;
    if val = '' then raise exception 'missing %', nm; end if;
    params := params || val;
  end loop;
  select m.name into who from dashboard_me() m limit 1;
  insert into lost_send_jobs (client_key, phone, branch, channel_id, qtype, tkey, params, body_text, campaign, requested_by, is_test)
  values ('test-' || gen_random_uuid(), cfg.test_phone, 'SAA', ch, t.qtype, t.key, params, lost_send_render(t.body, params), cfg.campaign_tag, who, true)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.lost_send_test_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  return (select jsonb_build_object('status', status, 'error', error, 'tagged', tagged, 'tag_err', tag_err) from lost_send_jobs where id = p_id and is_test);
end $$;

-- Level 5: the kill switch and the settings. Pass only what changes: {"enabled": true, "daily_cap": 50, "test_phone": "+971..."}.
create or replace function public.lost_send_config_set(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if lost_send_level() < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from dashboard_me() m limit 1;
  update lost_send_config set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    daily_cap = coalesce((p_patch ->> 'daily_cap')::int, daily_cap),
    per_run = coalesce((p_patch ->> 'per_run')::int, per_run),
    hour_from = coalesce((p_patch ->> 'hour_from')::int, hour_from),
    hour_to = coalesce((p_patch ->> 'hour_to')::int, hour_to),
    campaign_tag = coalesce(nullif(btrim(p_patch ->> 'campaign_tag'), ''), campaign_tag),
    offer_smoothing = coalesce(nullif(btrim(p_patch ->> 'offer_smoothing'), ''), offer_smoothing),
    offer_colour = coalesce(nullif(btrim(p_patch ->> 'offer_colour'), ''), offer_colour),
    offer_until = coalesce(nullif(btrim(p_patch ->> 'offer_until'), ''), offer_until),
    test_phone = case when p_patch ? 'test_phone' then nullif('+' || regexp_replace(coalesce(p_patch ->> 'test_phone', ''), '\D', '', 'g'), '+') else test_phone end,
    updated_at = now(), updated_by = who
  where id = 1;
  return lost_send_info();
end $$;

-- ── worker functions (service role only) ─────────────────────────────────────────────────────
-- Take up to n queued messages. The kill switch, the Dubai send window and the daily cap are checked HERE, so a worker that is called at the wrong
-- time just gets nothing. Test messages ignore the switch, the window and the cap. A message stuck in 'sending' for 10 minutes is marked failed, not
-- re-sent: it may already have gone, so a person checks respond.io before retrying.
create or replace function public.lost_send_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg lost_send_config; hr int; room int; n int; out jsonb; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  select * into cfg from lost_send_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  update lost_send_jobs set status = 'failed', error = 'Interrupted while sending. Look in respond.io before you retry; it may have gone.'
    where status = 'sending' and claimed_at < now() - interval '10 minutes';
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  select greatest(0, cfg.daily_cap - count(*)) into room from lost_send_jobs j
    where not j.is_test and j.status in ('sending', 'sent') and (coalesce(j.sent_at, j.claimed_at) at time zone 'Asia/Dubai')::date = today;
  with cand as (
    select j.id, j.is_test, row_number() over (partition by j.is_test order by j.id) rn
    from lost_send_jobs j
    where j.status = 'queued' and j.next_try_at <= now()
      and (j.is_test or (cfg.enabled and hr >= cfg.hour_from and hr < cfg.hour_to))
  ), pick as (
    select j.id from lost_send_jobs j join cand c on c.id = j.id
    where c.is_test or c.rn <= room
    order by j.is_test desc, j.id limit n for update of j skip locked
  ), upd as (
    update lost_send_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1
    from pick where j.id = pick.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'client_key', u.client_key, 'dup_keys', u.dup_keys, 'phone', u.phone, 'channel_id', u.channel_id,
      'qtype', u.qtype, 'campaign', u.campaign, 'params', u.params, 'body_text', u.body_text, 'is_test', u.is_test, 'attempts', u.attempts,
      'requested_by', u.requested_by, 'template', t.respond_name, 'language', t.language, 'footer', t.footer) order by u.id), '[]'::jsonb)
  into out from upd u join lost_send_templates t on t.key = u.tkey;
  return out;
end $$;

-- p_status: 'sent', 'queued' (try again after p_retry_min minutes; the third attempt fails for good), 'failed' or 'skipped'.
create or replace function public.lost_send_finish(p_id bigint, p_status text, p_error text default null, p_message_id text default null,
  p_contact_id bigint default null, p_retry_min int default 5) returns void
language plpgsql security definer set search_path = public as $$
declare j lost_send_jobs;
begin
  select * into j from lost_send_jobs where id = p_id;
  if not found then return; end if;
  if p_status = 'sent' then
    update lost_send_jobs set status = 'sent', sent_at = now(), error = null, message_id = p_message_id, contact_id = p_contact_id where id = p_id;
    if not j.is_test then
      insert into lost_messaged (client_key, list_id, sent_on, sent_by)
      select distinct k, 'q', (now() at time zone 'Asia/Dubai')::date, 'site:' || coalesce(j.requested_by, 'someone')
      from unnest(array[j.client_key] || j.dup_keys) k;
    end if;
  elsif p_status = 'queued' and j.attempts < 3 then
    update lost_send_jobs set status = 'queued', error = left(p_error, 300), next_try_at = now() + make_interval(mins => greatest(p_retry_min, 1)) where id = p_id;
  elsif p_status = 'queued' then
    update lost_send_jobs set status = 'failed', error = left('Gave up after 3 tries: ' || coalesce(p_error, ''), 300) where id = p_id;
  else
    update lost_send_jobs set status = case when p_status = 'skipped' then 'skipped' else 'failed' end, error = left(p_error, 300), contact_id = coalesce(p_contact_id, contact_id) where id = p_id;
  end if;
end $$;

create or replace function public.lost_send_tag_todo(p_n int default 20) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'contact_id', j.contact_id,
    'tags', case when j.is_test then jsonb_build_array('lost-send-test') else jsonb_build_array(j.campaign, 'lost-msg-' || j.qtype) end)), '[]'::jsonb)
  from (select * from lost_send_jobs where status = 'sent' and not tagged and tag_attempts < 5 and contact_id is not null order by id limit p_n) j
$$;

create or replace function public.lost_send_tag_done(p_id bigint, p_err text default null) returns void
language sql security definer set search_path = public as $$
  update lost_send_jobs set tagged = (p_err is null), tag_err = left(p_err, 300), tag_attempts = tag_attempts + (case when p_err is null then 0 else 1 end) where id = p_id
$$;

create or replace function public.lost_send_add_optout(p_phone text, p_reason text default 'STOP') returns void
language sql security definer set search_path = public as $$
  insert into lost_send_optout (phone, reason, added_by) values (p_phone, p_reason, 'worker') on conflict (phone) do nothing
$$;

-- Supabase grants new functions to anon and authenticated by default; take that away, then give back only what the page needs.
revoke all on function public.lost_send_render(text, text[]), public.lost_send_level(),
  public.lost_send_info(), public.lost_send_jobs_get(), public.lost_send_enqueue(jsonb), public.lost_send_cancel(bigint[]), public.lost_send_retry(bigint[]),
  public.lost_send_test(text, jsonb), public.lost_send_test_get(bigint), public.lost_send_config_set(jsonb),
  public.lost_send_claim(int), public.lost_send_finish(bigint, text, text, text, bigint, int), public.lost_send_tag_todo(int),
  public.lost_send_tag_done(bigint, text), public.lost_send_add_optout(text, text) from public, anon, authenticated;
grant execute on function public.lost_send_info(), public.lost_send_jobs_get(), public.lost_send_enqueue(jsonb), public.lost_send_cancel(bigint[]),
  public.lost_send_retry(bigint[]), public.lost_send_test(text, jsonb), public.lost_send_test_get(bigint), public.lost_send_config_set(jsonb) to authenticated;
