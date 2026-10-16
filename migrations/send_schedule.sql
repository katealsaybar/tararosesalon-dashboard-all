-- Scheduled sends for the Wellness Voucher blast and Lost Clients (Kate, 16 Oct 2026). Additive; the old calls keep working.
--
-- THE PATTERN (reuse it for the next campaign): a queued job carries the time it may go out (wv_send_jobs.run_at, lost_send_jobs.next_try_at),
-- the claim function never picks a job before that time, and a cron drives the worker every minute inside the Dubai send window. So "schedule"
-- is just "queue it with a time": Kate picks the date and hour, closes the laptop, and the cron sends it. Everything else that already guards
-- a send still applies at that moment: the kill switch, the Dubai window (10:00 to 19:00), the daily cap and the pace. A time outside the window
-- simply waits for the window to open; the page says so before she confirms. Cancel / Stop still work on anything that has not gone.
-- To add a campaign: give its jobs a run time, make its claim honour it, add a cron for its worker, and use send-schedule.js on its page.
--
--   Wellness Voucher: wv_send_jobs.run_at (new), wv_send_enqueue(p_sub, p_at), wv_send_reschedule(p_sub, p_at), wv_send_info() waves[].next_run_at,
--                     wv_send_claim honours run_at, new cron 'wv-send-worker' (there was none: only an open page drove the worker).
--   Lost Clients:     lost_send_jobs.scheduled_for (new; next_try_at already existed and the claim already honours it, retries also use it, so
--                     scheduled_for marks the ones a person scheduled), lost_send_enqueue(p_items, p_at), lost_send_reschedule(p_ids, p_at),
--                     lost_send_jobs_get() returns scheduled_for. The cap for a scheduled batch is counted on the day it is scheduled for.

-- ── Wellness Voucher ────────────────────────────────────────────────────────────────────────────────
alter table public.wv_send_jobs add column if not exists run_at timestamptz not null default now();
create index if not exists wv_send_jobs_run_idx on public.wv_send_jobs (status, run_at);

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
    select j.id from wv_send_jobs j where j.status = 'queued' and j.run_at <= now() order by j.id limit n for update skip locked
  ), upd as (
    update wv_send_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1
      from pick where j.id = pick.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'phone', u.phone, 'sub_wave', u.sub_wave, 'tag', u.tag, 'client', u.client,
           'attempts', u.attempts) order by u.id), '[]'::jsonb) into out from upd u;
  return out;
end $$;

drop function if exists public.wv_send_enqueue(text);
create or replace function public.wv_send_enqueue(p_sub text, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text; n int;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_sub not in ('1a','1b','2a','2b','3a','3b','4a','4b','5a','5b') then raise exception 'Unknown wave %', p_sub; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  select m.name into who from dashboard_me() m limit 1;
  with pick as (
    select distinct on (b.phone) b.sub_wave, b.branch, b.client_key, b.client, b.phone
      from wv_blast b
     where b.sub_wave = p_sub and b.can_message and coalesce(b.phone, '') <> ''
       and not exists (select 1 from wv_send_jobs j where j.phone = b.phone and j.status in ('queued', 'sending', 'sent'))
     order by b.phone, b.spend desc)
  insert into wv_send_jobs (sub_wave, branch, client_key, client, phone, tag, requested_by, run_at)
  select p.sub_wave, p.branch, p.client_key, p.client, p.phone,
         case when right(p.sub_wave, 1) = 'a' then 'wv-send-short' else 'wv-send-long' end, who, coalesce(p_at, now())
    from pick p
  on conflict (sub_wave, branch, client_key) do update
    set status = 'queued', error = null, done_at = null, attempts = 0, requested_by = excluded.requested_by, requested_at = now(), run_at = excluded.run_at
    where wv_send_jobs.status = 'cancelled';
  get diagnostics n = row_count;
  return jsonb_build_object('queued', n);
end $$;

-- Level 5: move the time of what is still waiting in one sub-wave (p_at null = as soon as the window allows).
create or replace function public.wv_send_reschedule(p_sub text, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  update wv_send_jobs set run_at = coalesce(p_at, now()) where sub_wave = p_sub and status = 'queued';
  get diagnostics n = row_count;
  return jsonb_build_object('moved', n);
end $$;

-- wv_send_info(): the one in wv_send_dates.sql plus next_run_at per wave (when the earliest waiting client may go).
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
    'server_now', now(),
    'waves', (select coalesce(jsonb_agg(w order by w.sub_wave), '[]'::jsonb) from (
        select s.sub_wave,
               (select count(*) from wv_blast b where b.sub_wave = s.sub_wave and b.can_message) as clients,
               count(*) filter (where j.status = 'sent') as sent,
               count(*) filter (where j.status in ('queued', 'sending')) as waiting,
               count(*) filter (where j.status = 'failed') as failed,
               count(*) filter (where j.status = 'skipped') as skipped,
               count(*) filter (where j.status = 'cancelled') as cancelled,
               max(j.done_at) as last_at,
               min(j.requested_at) as launched_at,
               case when count(j.id) > 0 and count(*) filter (where j.status in ('queued', 'sending')) = 0 then max(j.done_at) end as finished_at,
               coalesce(bool_and(j.note = 'before the site button'), false) as by_hand,
               min(j.run_at) filter (where j.status = 'queued') as next_run_at
          from (select unnest(array['1a','1b','2a','2b','3a','3b','4a','4b','5a','5b']) as sub_wave) s
          left join wv_send_jobs j on j.sub_wave = s.sub_wave
         group by s.sub_wave) w),
    'recent', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select id, sub_wave, branch, client, status, error, note, done_at, requested_at, requested_by
          from wv_send_jobs where note is null or note <> 'before the site button' order by id desc limit 40) r));
end $$;

revoke all on function public.wv_send_enqueue(text, timestamptz), public.wv_send_reschedule(text, timestamptz), public.wv_send_info() from public, anon;
grant execute on function public.wv_send_enqueue(text, timestamptz), public.wv_send_reschedule(text, timestamptz), public.wv_send_info() to authenticated;

-- The cron that was missing: every minute, 06:00 to 15:59 UTC (10:00 to 19:59 Dubai), same call as the Lost Clients cron (jobid 12) with the
-- worker name swapped. The claim still checks the switch, the window and run_at, so a minute with nothing due does nothing.
do $$
declare cmd text;
begin
  if not exists (select 1 from cron.job where jobname = 'wv-send-worker') then
    select replace(command, 'lost-send-worker', 'wv-send-worker') into cmd from cron.job where jobname = 'lost-send-worker';
    if cmd is null or cmd not like '%wv-send-worker%' then raise exception 'could not copy the lost-send-worker cron'; end if;
    perform cron.schedule('wv-send-worker', '* 6-15 * * *', cmd);
  end if;
end $$;

-- ── Lost Clients ────────────────────────────────────────────────────────────────────────────────────
alter table public.lost_send_jobs add column if not exists scheduled_for timestamptz;

drop function if exists public.lost_send_enqueue(jsonb);
create or replace function public.lost_send_enqueue(p_items jsonb, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  cfg lost_send_config; who text; it jsonb; t lost_send_templates; ph text; ch bigint; reason text; ck text;
  used int; queued int := 0; skipped jsonb := '[]'::jsonb; params text[]; nm text; val text; vars jsonb;
  tday date := (coalesce(p_at, now()) at time zone 'Asia/Dubai')::date;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  if not cfg.enabled then raise exception 'Sending from the site is switched off'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then raise exception 'Send up to 2000 at a time'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  select m.name into who from dashboard_me() m limit 1;
  -- the daily cap is counted on the day a message goes out: a waiting one on the day it is due, the rest on the day it was queued
  select count(*) into used from lost_send_jobs j where not j.is_test and j.campaign = cfg.campaign_tag and j.status in ('queued', 'sending', 'sent')
    and ((case when j.status = 'queued' then j.next_try_at else j.requested_at end) at time zone 'Asia/Dubai')::date = tday;
  for it in select * from jsonb_array_elements(p_items) loop
    reason := null; ck := it ->> 'client_key'; ph := null; ch := null; params := '{}';
    if coalesce(ck, '') = '' then reason := 'no client'; end if;
    if reason is null and not exists (select 1 from lost_waves w where w.opened_at is not null and w.closed_at is null
         and w.n = case when coalesce(it ->> 'wave', '') ~ '^[1-4]$' then (it ->> 'wave')::int end) then reason := 'wave not open'; end if;
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
      insert into lost_send_jobs (client_key, dup_keys, phone, branch, channel_id, qtype, tkey, params, body_text, campaign, requested_by, next_try_at, scheduled_for)
      values (ck, array(select jsonb_array_elements_text(coalesce(it -> 'dups', '[]'::jsonb))), ph, it ->> 'branch', ch, t.qtype, t.key, params,
              lost_send_render(t.body, params), cfg.campaign_tag, who, coalesce(p_at, now()), p_at);
      queued := queued + 1;
    else
      skipped := skipped || jsonb_build_object('client_key', ck, 'reason', reason);
    end if;
  end loop;
  return jsonb_build_object('queued', queued, 'skipped', skipped);
end $function$;

-- Level 3: move the time of messages that have not gone yet (p_at null turns them back into "as soon as the window allows").
create or replace function public.lost_send_reschedule(p_ids bigint[], p_at timestamptz) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  update lost_send_jobs set next_try_at = coalesce(p_at, now()), scheduled_for = p_at where id = any(p_ids) and status = 'queued' and not is_test;
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.lost_send_jobs_get() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare cfg lost_send_config;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'client_key', j.client_key, 'dup_keys', j.dup_keys, 'status', j.status, 'error', j.error,
            'requested_by', j.requested_by, 'requested_at', j.requested_at, 'sent_at', j.sent_at, 'tagged', j.tagged, 'tag_err', j.tag_err, 'is_test', j.is_test,
            'scheduled_for', j.scheduled_for)), '[]'::jsonb)
          from (select distinct on (x.client_key) x.* from lost_send_jobs x
                where x.campaign = cfg.campaign_tag and not x.is_test order by x.client_key, x.id desc) j);
end $function$;

revoke all on function public.lost_send_enqueue(jsonb, timestamptz), public.lost_send_reschedule(bigint[], timestamptz) from public, anon;
grant execute on function public.lost_send_enqueue(jsonb, timestamptz), public.lost_send_reschedule(bigint[], timestamptz) to authenticated;

-- lost_send_info(): as in lost_send_pace.sql, with two changes (applied live as send_schedule_lost_info_used_today):
--   used_today counts a waiting message on the day it is due (next_try_at), so a batch scheduled for tomorrow does not use up today's cap;
--   server_now is returned so the page can tell "due" from "scheduled" without trusting the laptop clock.
--   'used_today', (select count(*) ... and ((case when j.status = 'queued' then j.next_try_at else j.requested_at end) at time zone 'Asia/Dubai')::date = today),
--   'server_now', now(),
-- (see the function in the database; select pg_get_functiondef('public.lost_send_info'::regproc))
