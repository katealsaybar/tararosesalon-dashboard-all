-- Wellness Voucher Blast: send a wave from the site (Kate, 16 Oct 2026). Additive: nothing existing is touched.
--
-- How a send works: the blast itself is sent by GHL's workflow "WV blast - Send (tag go)", which fires when a contact gets the tag
-- wv-send-short (the short template, sub-waves 1a..5a) or wv-send-long (the long template, 1b..5b). Until now the tag was added by hand in
-- GHL (Contacts, filter wv-blast-wave-Na, bulk Add tags). This page queues the same tag instead, so the reply workflows (Tell me more,
-- Reserve mine) and the pipeline step keep working exactly as they do for a hand send.
--
--   wv_send_config      one row. enabled = the kill switch (Level 5), per_run, the Dubai send window.
--   wv_send_jobs        one row per client per sub-wave: queued, sending, sent (the go tag is on her in GHL), failed, skipped, cancelled.
--                       unique (sub_wave, branch, client_key), and a phone that is already queued or sent is never queued again,
--                       so nobody is messaged twice.
--   wv_send_info()      Level 3+: the settings, one line per sub-wave (clients, sent, waiting, failed) and the last 40 jobs.
--   wv_send_enqueue()   Level 5: queue one sub-wave. wv_send_stop(): cancel what is still waiting. wv_send_config_set(): the switch.
--   wv_send_claim() / wv_send_finish()   service role only, for the edge function wv-send-worker. The switch and the window are checked in
--                       the claim, so calling the worker at the wrong time just gets nothing.
-- Tables have RLS on and no policy; everything goes through these functions (security definer).

create table if not exists public.wv_send_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  per_run int not null default 25 check (per_run between 1 and 50),
  hour_from int not null default 10 check (hour_from between 0 and 23),
  hour_to int not null default 19 check (hour_to between 1 and 24),
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.wv_send_config (id) values (1) on conflict do nothing;
alter table public.wv_send_config enable row level security;
revoke all on public.wv_send_config from public, anon, authenticated;

create table if not exists public.wv_send_jobs (
  id bigserial primary key,
  sub_wave text not null check (sub_wave in ('1a','1b','2a','2b','3a','3b','4a','4b','5a','5b')),
  branch text not null,
  client_key text not null,
  client text not null,
  phone text not null,
  tag text not null check (tag in ('wv-send-short', 'wv-send-long')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  error text,
  attempts int not null default 0,
  ghl_contact_id text,
  note text,
  requested_by text,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  done_at timestamptz,
  unique (sub_wave, branch, client_key)
);
create index if not exists wv_send_jobs_status_idx on public.wv_send_jobs (status, id);
create index if not exists wv_send_jobs_phone_idx on public.wv_send_jobs (phone);
alter table public.wv_send_jobs enable row level security;
revoke all on public.wv_send_jobs from public, anon, authenticated;

create or replace function public.wv_send_level() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select m.level from public.dashboard_me() m limit 1), 0)
$$;

-- ── page functions ──────────────────────────────────────────────────────────────────────────────
create or replace function public.wv_send_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg wv_send_config;
begin
  if wv_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from wv_send_config where id = 1;
  return jsonb_build_object(
    'enabled', cfg.enabled, 'per_run', cfg.per_run, 'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to,
    'updated_at', cfg.updated_at, 'updated_by', cfg.updated_by,
    'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int,
    'waves', (select coalesce(jsonb_agg(w order by w.sub_wave), '[]'::jsonb) from (
        select s.sub_wave,
               (select count(*) from wv_blast b where b.sub_wave = s.sub_wave and b.can_message) as clients,
               count(*) filter (where j.status = 'sent') as sent,
               count(*) filter (where j.status in ('queued', 'sending')) as waiting,
               count(*) filter (where j.status = 'failed') as failed,
               count(*) filter (where j.status = 'skipped') as skipped,
               count(*) filter (where j.status = 'cancelled') as cancelled,
               max(j.done_at) as last_at
          from (select unnest(array['1a','1b','2a','2b','3a','3b','4a','4b','5a','5b']) as sub_wave) s
          left join wv_send_jobs j on j.sub_wave = s.sub_wave
         group by s.sub_wave) w),
    'recent', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select id, sub_wave, branch, client, status, error, note, done_at, requested_at, requested_by
          from wv_send_jobs where note is null or note <> 'before the site button' order by id desc limit 40) r));
end $$;

-- Level 5: queue one sub-wave. Only clients who can be messaged, with a phone, whose phone is not already queued or sent.
create or replace function public.wv_send_enqueue(p_sub text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text; n int;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_sub not in ('1a','1b','2a','2b','3a','3b','4a','4b','5a','5b') then raise exception 'Unknown wave %', p_sub; end if;
  select m.name into who from dashboard_me() m limit 1;
  with pick as (
    select distinct on (b.phone) b.sub_wave, b.branch, b.client_key, b.client, b.phone
      from wv_blast b
     where b.sub_wave = p_sub and b.can_message and coalesce(b.phone, '') <> ''
       and not exists (select 1 from wv_send_jobs j where j.phone = b.phone and j.status in ('queued', 'sending', 'sent'))
     order by b.phone, b.spend desc)
  insert into wv_send_jobs (sub_wave, branch, client_key, client, phone, tag, requested_by)
  select p.sub_wave, p.branch, p.client_key, p.client, p.phone,
         case when right(p.sub_wave, 1) = 'a' then 'wv-send-short' else 'wv-send-long' end, who
    from pick p
  on conflict (sub_wave, branch, client_key) do update   -- a cancelled one can be queued again; a failed one never is (she may have been messaged)
    set status = 'queued', error = null, done_at = null, attempts = 0, requested_by = excluded.requested_by, requested_at = now()
    where wv_send_jobs.status = 'cancelled';
  get diagnostics n = row_count;
  return jsonb_build_object('queued', n);
end $$;

-- Level 5: cancel what is still waiting in one sub-wave (what was already tagged has gone and cannot be called back).
create or replace function public.wv_send_stop(p_sub text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  update wv_send_jobs set status = 'cancelled', done_at = now(), error = 'Stopped from the page'
   where sub_wave = p_sub and status = 'queued';
  get diagnostics n = row_count;
  return jsonb_build_object('cancelled', n);
end $$;

-- Level 5: the kill switch and the settings. Pass only what changes: {"enabled": true, "per_run": 25, "hour_from": 10, "hour_to": 19}.
create or replace function public.wv_send_config_set(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from dashboard_me() m limit 1;
  update wv_send_config set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    per_run = coalesce((p_patch ->> 'per_run')::int, per_run),
    hour_from = coalesce((p_patch ->> 'hour_from')::int, hour_from),
    hour_to = coalesce((p_patch ->> 'hour_to')::int, hour_to),
    updated_at = now(), updated_by = who
   where id = 1;
  return wv_send_info();
end $$;

-- ── worker functions (service role only) ────────────────────────────────────────────────────────
-- Take up to n queued jobs. The kill switch and the Dubai send window are checked HERE. A job stuck in 'sending' for 10 minutes is marked failed,
-- not re-sent: the tag may already be on her and the message gone, so a person checks GHL before queueing her again.
create or replace function public.wv_send_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg wv_send_config; hr int; n int; out jsonb;
begin
  select * into cfg from wv_send_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  update wv_send_jobs set status = 'failed', done_at = now(), error = 'Interrupted while tagging. Look in GHL before you queue her again; the message may have gone.'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';
  if not cfg.enabled or hr < cfg.hour_from or hr >= cfg.hour_to then return '[]'::jsonb; end if;
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  with pick as (
    select j.id from wv_send_jobs j where j.status = 'queued' order by j.id limit n for update skip locked
  ), upd as (
    update wv_send_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1
      from pick where j.id = pick.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'phone', u.phone, 'sub_wave', u.sub_wave, 'tag', u.tag, 'client', u.client,
           'attempts', u.attempts) order by u.id), '[]'::jsonb) into out from upd u;
  return out;
end $$;

-- p_status: 'sent', 'queued' (try again; the third attempt fails for good), 'failed' or 'skipped'.
create or replace function public.wv_send_finish(p_id bigint, p_status text, p_error text default null, p_contact text default null) returns void
language plpgsql security definer set search_path = public as $$
declare j wv_send_jobs;
begin
  select * into j from wv_send_jobs where id = p_id;
  if not found then return; end if;
  if p_status = 'queued' and j.attempts >= 3 then
    update wv_send_jobs set status = 'failed', done_at = now(), error = coalesce(p_error, 'Failed three times'), ghl_contact_id = coalesce(p_contact, ghl_contact_id) where id = p_id;
  elsif p_status = 'queued' then
    update wv_send_jobs set status = 'queued', error = p_error, ghl_contact_id = coalesce(p_contact, ghl_contact_id) where id = p_id;
  else
    update wv_send_jobs set status = p_status, done_at = now(), error = p_error, ghl_contact_id = coalesce(p_contact, ghl_contact_id) where id = p_id;
  end if;
end $$;

revoke all on function public.wv_send_level(), public.wv_send_info(), public.wv_send_enqueue(text), public.wv_send_stop(text),
  public.wv_send_config_set(jsonb), public.wv_send_claim(int), public.wv_send_finish(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.wv_send_level(), public.wv_send_info(), public.wv_send_enqueue(text), public.wv_send_stop(text), public.wv_send_config_set(jsonb) to authenticated;
grant execute on function public.wv_send_claim(int), public.wv_send_finish(bigint, text, text, text) to service_role;

-- Waves 1a, 1b, 2a and 2b were sent from GHL by hand on 15 and 16 Oct 2026 (bulk Add tags). Recorded here as sent, so the page shows them as sent
-- and a click can never queue them again.
insert into public.wv_send_jobs (sub_wave, branch, client_key, client, phone, tag, status, done_at, note, requested_by)
select b.sub_wave, b.branch, b.client_key, b.client, coalesce(b.phone, ''),
       case when right(b.sub_wave, 1) = 'a' then 'wv-send-short' else 'wv-send-long' end,
       'sent', case when b.sub_wave in ('1a', '1b') then timestamptz '2026-10-15 17:30+04' else timestamptz '2026-10-16 10:40+04' end,
       'before the site button', 'Kate (GHL, by hand)'
  from public.wv_blast b
 where b.sub_wave in ('1a', '1b', '2a', '2b') and b.can_message and coalesce(b.phone, '') <> ''
on conflict (sub_wave, branch, client_key) do nothing;
