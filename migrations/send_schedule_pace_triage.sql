-- Pace and retry triage for scheduled sends (Kate, 16 Oct 2026). Builds on send_schedule.sql (same pattern: a job carries the time it may go).
--
-- PACE: "send N messages, B at a time, every M minutes, starting at T". The page passes p_batch (B) and p_every (M); the number of messages is how
-- many clients are queued (Lost: the rows she picks; Wellness Voucher: p_limit, the top spenders of the wave first). Each message is given its OWN
-- run time at queue time: the first B at the start, the next B at start + M minutes, and so on. Slots only fall inside the Dubai send window: a slot
-- that would land after it closes (or before it opens) moves to when the window opens, and the slots after it carry on from there, so a long
-- run waits overnight instead of piling up. No claim change is needed; the claim already never picks a job before its time. The existing
-- per_run and Lost slot_cap are still brakes on top (whichever is slower wins).
--
-- RETRY TRIAGE: send_error_class(kind, error) puts a failed send in one of three piles, the same words on both pages:
--   retry   nothing went out (a lookup or rate-limit failure, "gave up after 3 tries"): safe to queue again.
--   check   it may have gone (Lost: the connection dropped or respond.io answered 5xx while sending): look in respond.io first, then Mark sent or retry.
--   stop    it will fail the same way (no contact, 4xx, bad number): fix the cause, or use Open in WhatsApp.
-- Wellness Voucher: a send that dropped while tagging is 'retry', not 'check': the worker looks the contact up in GHL first and skips anyone who already
-- carries the go tag, so queueing her again cannot message her twice.

create or replace function public.send_slot_norm(p_t timestamptz, p_from int, p_to int) returns timestamptz
language plpgsql stable set search_path = public as $$
declare d timestamp := p_t at time zone 'Asia/Dubai'; h int := extract(hour from (p_t at time zone 'Asia/Dubai'))::int;
begin
  if h >= p_from and h < p_to then return p_t; end if;
  if h < p_from then return (date_trunc('day', d) + make_interval(hours => p_from)) at time zone 'Asia/Dubai'; end if;
  return (date_trunc('day', d) + interval '1 day' + make_interval(hours => p_from)) at time zone 'Asia/Dubai';
end $$;
create or replace function public.send_slot_next(p_t timestamptz, p_every int, p_from int, p_to int) returns timestamptz
language sql stable set search_path = public as $$ select public.send_slot_norm(p_t + make_interval(mins => p_every), p_from, p_to) $$;

create or replace function public.send_pace_ok(p_batch int, p_every int) returns boolean
language sql immutable as $$ select p_every is null or (p_every between 1 and 720 and coalesce(p_batch, 0) between 1 and 500) $$;

create or replace function public.send_error_class(p_kind text, p_err text) returns text
language sql immutable as $$
  select case
    when p_err is null or btrim(p_err) = '' then 'check'
    when p_kind = 'lost' then case
      when p_err ~* 'interrupted|connection dropped|send 5[0-9][0-9]' then 'check'
      when p_err ~* 'contact (429|5[0-9][0-9])|send 429|run out of time|gave up after 3 tries|timed? ?out|fetch|network' then 'retry'
      else 'stop' end
    when p_kind = 'wv' then case
      when p_err ~* 'interrupted|connection dropped|lookup (429|5[0-9][0-9])|tag (429|5[0-9][0-9])|failed three times|run out of time|timed? ?out|fetch' then 'retry'
      else 'stop' end
    else 'check' end
$$;

-- ── Wellness Voucher ────────────────────────────────────────────────────────────────────────────────
drop function if exists public.wv_send_enqueue(text, timestamptz);
create or replace function public.wv_send_enqueue(p_sub text, p_at timestamptz default null, p_limit int default null, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text; n int := 0; k int; cfg wv_send_config; slot timestamptz; first_at timestamptz; last_at timestamptz; r record;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_sub not in ('1a','1b','2a','2b','3a','3b','4a','4b','5a','5b') then raise exception 'Unknown wave %', p_sub; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  if p_limit is not null and p_limit < 1 then raise exception 'How many must be at least 1'; end if;
  select * into cfg from wv_send_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  first_at := slot;
  select m.name into who from dashboard_me() m limit 1;
  for r in
    select * from (
      select distinct on (b.phone) b.sub_wave, b.branch, b.client_key, b.client, b.phone, b.spend
        from wv_blast b
       where b.sub_wave = p_sub and b.can_message and coalesce(b.phone, '') <> ''
         and not exists (select 1 from wv_send_jobs j where j.phone = b.phone and j.status in ('queued', 'sending', 'sent'))
       order by b.phone, b.spend desc) x
     order by x.spend desc, x.client_key limit p_limit
  loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    insert into wv_send_jobs (sub_wave, branch, client_key, client, phone, tag, requested_by, run_at)
    values (r.sub_wave, r.branch, r.client_key, r.client, r.phone, case when right(r.sub_wave, 1) = 'a' then 'wv-send-short' else 'wv-send-long' end, who, slot)
    on conflict (sub_wave, branch, client_key) do update
      set status = 'queued', error = null, done_at = null, attempts = 0, requested_by = excluded.requested_by, requested_at = now(), run_at = excluded.run_at
      where wv_send_jobs.status = 'cancelled';
    get diagnostics k = row_count;
    if k > 0 then n := n + k; last_at := slot; end if;
  end loop;
  return jsonb_build_object('queued', n, 'first_at', first_at, 'last_at', last_at);
end $$;

drop function if exists public.wv_send_reschedule(text, timestamptz);
create or replace function public.wv_send_reschedule(p_sub text, p_at timestamptz, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0; cfg wv_send_config; slot timestamptz; r record;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  select * into cfg from wv_send_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  for r in select id from wv_send_jobs where sub_wave = p_sub and status = 'queued' order by id loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    update wv_send_jobs set run_at = slot where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('moved', n);
end $$;

-- Level 5: queue failed sends again (the ones the page's triage selects), optionally at a time and pace. The worker still looks each one up in GHL
-- and skips anyone who already carries a go tag.
create or replace function public.wv_send_retry(p_ids bigint[], p_at timestamptz default null, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0; cfg wv_send_config; slot timestamptz; r record;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  select * into cfg from wv_send_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  for r in select id from wv_send_jobs where id = any(p_ids) and status = 'failed' order by id loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    update wv_send_jobs set status = 'queued', error = null, done_at = null, attempts = 0, run_at = slot, requested_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('queued', n);
end $$;

-- wv_send_info(): as in send_schedule.sql plus 'failed' (the last 200 failed sends with their triage class) for the page's triage panel.
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
               min(j.run_at) filter (where j.status = 'queued') as next_run_at,
               max(j.run_at) filter (where j.status = 'queued') as last_run_at
          from (select unnest(array['1a','1b','2a','2b','3a','3b','4a','4b','5a','5b']) as sub_wave) s
          left join wv_send_jobs j on j.sub_wave = s.sub_wave
         group by s.sub_wave) w),
    'failed', (select coalesce(jsonb_agg(f), '[]'::jsonb) from (
        select id, sub_wave, branch, client, phone, error, send_error_class('wv', error) as cls, done_at
          from wv_send_jobs where status = 'failed' order by id desc limit 200) f),
    'recent', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select id, sub_wave, branch, client, status, error, note, done_at, requested_at, requested_by
          from wv_send_jobs where note is null or note <> 'before the site button' order by id desc limit 40) r));
end $$;

revoke all on function public.wv_send_enqueue(text, timestamptz, int, int, int), public.wv_send_reschedule(text, timestamptz, int, int),
  public.wv_send_retry(bigint[], timestamptz, int, int), public.wv_send_info() from public, anon;
grant execute on function public.wv_send_enqueue(text, timestamptz, int, int, int), public.wv_send_reschedule(text, timestamptz, int, int),
  public.wv_send_retry(bigint[], timestamptz, int, int), public.wv_send_info() to authenticated;

-- ── Lost Clients ────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.lost_send_enqueue(jsonb, timestamptz);
create or replace function public.lost_send_enqueue(p_items jsonb, p_at timestamptz default null, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  cfg lost_send_config; who text; it jsonb; t lost_send_templates; ph text; ch bigint; reason text; ck text;
  used int; queued int := 0; skipped jsonb := '[]'::jsonb; params text[]; nm text; val text; vars jsonb;
  tday date := (coalesce(p_at, now()) at time zone 'Asia/Dubai')::date; slot timestamptz; first_at timestamptz; last_at timestamptz;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  if not cfg.enabled then raise exception 'Sending from the site is switched off'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then raise exception 'Send up to 2000 at a time'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  first_at := slot;
  select m.name into who from dashboard_me() m limit 1;
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
      if p_every is not null and queued > 0 and queued % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
      insert into lost_send_jobs (client_key, dup_keys, phone, branch, channel_id, qtype, tkey, params, body_text, campaign, requested_by, next_try_at, scheduled_for)
      values (ck, array(select jsonb_array_elements_text(coalesce(it -> 'dups', '[]'::jsonb))), ph, it ->> 'branch', ch, t.qtype, t.key, params,
              lost_send_render(t.body, params), cfg.campaign_tag, who, slot, case when p_at is not null or p_every is not null then slot end);
      queued := queued + 1; last_at := slot;
    else
      skipped := skipped || jsonb_build_object('client_key', ck, 'reason', reason);
    end if;
  end loop;
  return jsonb_build_object('queued', queued, 'skipped', skipped, 'first_at', first_at, 'last_at', last_at);
end $function$;

drop function if exists public.lost_send_reschedule(bigint[], timestamptz);
create or replace function public.lost_send_reschedule(p_ids bigint[], p_at timestamptz, p_batch int default null, p_every int default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; cfg lost_send_config; slot timestamptz; r record;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  select * into cfg from lost_send_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  for r in select id from lost_send_jobs where id = any(p_ids) and status = 'queued' and not is_test order by array_position(p_ids, id) loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    update lost_send_jobs set next_try_at = slot, scheduled_for = case when p_at is not null or p_every is not null then slot end where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Retry failed messages, optionally at a time and pace. Same rule as before: not while the client or number is already queued or sent.
drop function if exists public.lost_send_retry(bigint[]);
create or replace function public.lost_send_retry(p_ids bigint[], p_at timestamptz default null, p_batch int default null, p_every int default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; cfg lost_send_config; slot timestamptz; r record;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  select * into cfg from lost_send_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  for r in select j.id from lost_send_jobs j
            where j.id = any(p_ids) and j.status = 'failed'
              and not exists (select 1 from lost_send_jobs k where k.id <> j.id and not k.is_test and k.campaign = j.campaign and k.status in ('queued', 'sending', 'sent')
                              and (k.client_key = j.client_key or k.phone = j.phone))
            order by array_position(p_ids, j.id) loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    update lost_send_jobs set status = 'queued', error = null, attempts = 0, next_try_at = slot,
           scheduled_for = case when p_at is not null or p_every is not null then slot end where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.lost_send_jobs_get() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare cfg lost_send_config;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'client_key', j.client_key, 'dup_keys', j.dup_keys, 'status', j.status, 'error', j.error,
            'requested_by', j.requested_by, 'requested_at', j.requested_at, 'sent_at', j.sent_at, 'tagged', j.tagged, 'tag_err', j.tag_err, 'is_test', j.is_test,
            'scheduled_for', j.scheduled_for, 'next_try_at', j.next_try_at,
            'error_class', case when j.status = 'failed' then send_error_class('lost', j.error) end)), '[]'::jsonb)
          from (select distinct on (x.client_key) x.* from lost_send_jobs x
                where x.campaign = cfg.campaign_tag and not x.is_test order by x.client_key, x.id desc) j);
end $function$;

revoke all on function public.lost_send_enqueue(jsonb, timestamptz, int, int), public.lost_send_reschedule(bigint[], timestamptz, int, int),
  public.lost_send_retry(bigint[], timestamptz, int, int), public.send_slot_norm(timestamptz, int, int), public.send_slot_next(timestamptz, int, int, int),
  public.send_pace_ok(int, int), public.send_error_class(text, text) from public, anon;
grant execute on function public.lost_send_enqueue(jsonb, timestamptz, int, int), public.lost_send_reschedule(bigint[], timestamptz, int, int),
  public.lost_send_retry(bigint[], timestamptz, int, int) to authenticated;
-- the helpers are called from inside the security-definer functions above; the page never calls them
