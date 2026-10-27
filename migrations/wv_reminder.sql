-- Wellness Voucher Blast 4 REMINDER: deploy it from the site (Kate, 27 Oct 2026). Additive: nothing existing is touched.
--
-- The reminder is a GHL workflow "WV reminder - Send (tag go)" (id 7c0b5e08-8461-4114-9eac-8c0cda2ebdaa, location 9JRcCbWbkIr9ie8lvA3D). It fires when a contact gets the tag
-- wv-reminder-go: WhatsApp template wellness_voucher_2026_reminder, then the tag wv-reminder-sent. Allow re-entry is OFF. Kate publishes that workflow herself; until it is
-- Published, adding the tag sends nothing. So "deploying" the reminder = adding wv-reminder-go in GHL, a batch at a time, exactly as wv-send-worker does for the blast waves.
-- Adding the tag to a contact of a PUBLISHED workflow sends the WhatsApp at once, and a sent WhatsApp cannot be called back.
--
--   wv_reminder_list     the 302 clients, locked 27 Oct 2026 (282 clean, 20 warm). Not touched here except tagged = true once her tag is on.
--   wv_reminder_config   one row: the kill switch (OFF), per_run, the Dubai send window, the test phone (copied from wv_last_config).
--   wv_reminder_jobs     one row per client: queued, sending, sent (the go tag is on her in GHL), failed, skipped, cancelled. One live row per phone.
--   wv_reminder_drops()  who is left out right now and why: bought a voucher since 26 Oct, on the opt-out list, Do not contact / Wrong number, wrote "not for me", wrote STOP.
--   Page: wv_reminder_info() (Level 3+ counts, Level 5 names). Level 5: enqueue / reschedule / stop / retry / test / config_set.
--   Worker only (service role): wv_reminder_claim / wv_reminder_finish. The switch, the window and the drop check are in the claim, so calling the worker at the wrong time gets nothing.
-- Tables have RLS on and no policy; everything goes through these functions (security definer, level checked inside).

create table if not exists public.wv_reminder_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  per_run int not null default 25 check (per_run between 1 and 50),
  hour_from int not null default 10 check (hour_from between 0 and 23),
  hour_to int not null default 19 check (hour_to between 1 and 24),
  test_phone text,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.wv_reminder_config (id, test_phone) select 1, (select test_phone from public.wv_last_config where id = 1) on conflict do nothing;
alter table public.wv_reminder_config enable row level security;
revoke all on public.wv_reminder_config from public, anon, authenticated;

create table if not exists public.wv_reminder_jobs (
  id bigserial primary key,
  seg text not null check (seg in ('warm', 'clean')),
  branch text not null,
  client_key text not null,
  client text not null,
  phone text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  error text,
  drop_reason text,
  attempts int not null default 0,
  run_at timestamptz not null default now(),
  requested_by text,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  done_at timestamptz,
  ghl_contact_id text,
  is_test boolean not null default false
);
-- One live row per phone: a double click, or two people queueing the list, cannot tag anyone twice.
create unique index if not exists wv_reminder_jobs_one_per_phone on public.wv_reminder_jobs (phone) where status in ('queued', 'sending', 'sent') and not is_test;
create index if not exists wv_reminder_jobs_pick on public.wv_reminder_jobs (status, run_at);
alter table public.wv_reminder_jobs enable row level security;
revoke all on public.wv_reminder_jobs from public, anon, authenticated;

-- ── who is left out, and why ────────────────────────────────────────────────────────────────────
-- p_phones null = the whole list. Matching as wv_lastpush_performance and wv_last_pool do: a voucher sale on the Phorest lines (item like Voucher WV-AA-BBB-1) on or after 26 Oct 2026,
-- matched on client_key or the sales name in wv_blast_alias; phones compared on their last 9 digits. First reason that applies wins.
create or replace function public.wv_reminder_drops(p_phones text[] default null) returns table (phone text, reason text)
language sql stable security definer set search_path = public as $$
  with sales as materialized (
    select distinct lower(btrim(s.client_name)) as ck
      from public.sales_transaction_lines s
     where s.date >= date '2026-10-26' and s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$'),
  rep as (
    select right(regexp_replace(r.phone, '\D', '', 'g'), 9) as p9, bool_or(coalesce(r.not_for_me, false)) as nfm, bool_or(coalesce(r.stop, false)) as stp
      from public.wv_last_replies r group by 1),
  l as (
    select w.phone, w.client_key, coalesce(a.sales_name, w.client_key) as mk, right(regexp_replace(w.phone, '\D', '', 'g'), 9) as p9
      from public.wv_reminder_list w left join public.wv_blast_alias a on a.client_key = w.client_key
     where p_phones is null or w.phone = any(p_phones))
  select x.phone, x.reason from (
    select l.phone,
           case
             when exists (select 1 from sales sa where sa.ck = l.mk) then 'bought'
             when exists (select 1 from public.lost_send_optout oo where right(regexp_replace(oo.phone, '\D', '', 'g'), 9) = l.p9) then 'optout'
             when exists (select 1 from public.lost_excluded ee where ee.client_key = l.client_key and ee.reason in ('Do not contact', 'Wrong number')) then 'excluded'
             when exists (select 1 from rep where rep.p9 = l.p9 and rep.nfm) then 'not_for_me'
             when exists (select 1 from rep where rep.p9 = l.p9 and rep.stp) then 'stop'
           end as reason
      from l) x
  where x.reason is not null
$$;

-- The list with each client's state: job_state is sent / waiting / failed / skipped (the sender found a reason in GHL, e.g. do-not-disturb) when she already has a job (or her tag is on), reason is why she is left out now, both null = ready.
create or replace function public.wv_reminder_state() returns table (phone text, client_key text, client text, seg text, branch text, job_state text, reason text)
language sql stable security definer set search_path = public as $$
  select w.phone, w.client_key, w.client, w.seg, w.branch,
         coalesce((select case when j.status = 'sent' then 'sent' when j.status in ('queued', 'sending') then 'waiting' when j.status = 'failed' then 'failed' when j.status = 'skipped' then 'skipped' end
                     from public.wv_reminder_jobs j where j.phone = w.phone and not j.is_test and j.status in ('sent', 'queued', 'sending', 'failed', 'skipped') order by j.id desc limit 1),
                  case when w.tagged then 'sent' end) as job_state,
         d.reason
    from public.wv_reminder_list w left join public.wv_reminder_drops() d on d.phone = w.phone
$$;

-- ── page functions ──────────────────────────────────────────────────────────────────────────────
create or replace function public.wv_reminder_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg wv_reminder_config; lvl int := wv_send_level(); st jsonb;
begin
  if lvl < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from wv_reminder_config where id = 1;
  select jsonb_build_object(
      'listed', count(*),
      'warm', count(*) filter (where seg = 'warm'),
      'clean', count(*) filter (where seg = 'clean'),
      'ready', count(*) filter (where job_state is null and reason is null),
      'ready_warm', count(*) filter (where job_state is null and reason is null and seg = 'warm'),
      'ready_clean', count(*) filter (where job_state is null and reason is null and seg = 'clean'),
      'sent', count(*) filter (where job_state = 'sent'),
      'waiting', count(*) filter (where job_state = 'waiting'),
      'failed', count(*) filter (where job_state = 'failed'),
      'skipped', count(*) filter (where job_state = 'skipped'),
      'left_out', count(*) filter (where job_state is null and reason is not null),
      'bought', count(*) filter (where job_state is null and reason = 'bought'),
      'optout', count(*) filter (where job_state is null and reason = 'optout'),
      'excluded', count(*) filter (where job_state is null and reason = 'excluded'),
      'not_for_me', count(*) filter (where job_state is null and reason = 'not_for_me'),
      'stop', count(*) filter (where job_state is null and reason = 'stop'))
    into st from wv_reminder_state();
  return jsonb_build_object(
    'enabled', cfg.enabled, 'per_run', cfg.per_run, 'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to, 'test_ready', cfg.test_phone is not null,
    'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int, 'server_now', now(), 'updated_at', cfg.updated_at, 'updated_by', cfg.updated_by,
    'counts', st,
    'job', (select jsonb_build_object(
              'skipped', count(*) filter (where status = 'skipped'),
              'skipped_dup', count(*) filter (where status = 'skipped' and drop_reason is null),
              'skipped_bought', count(*) filter (where status = 'skipped' and drop_reason = 'bought'),
              'skipped_optout', count(*) filter (where status = 'skipped' and drop_reason = 'optout'),
              'skipped_excluded', count(*) filter (where status = 'skipped' and drop_reason = 'excluded'),
              'skipped_not_for_me', count(*) filter (where status = 'skipped' and drop_reason = 'not_for_me'),
              'skipped_stop', count(*) filter (where status = 'skipped' and drop_reason = 'stop'),
              'cancelled', count(*) filter (where status = 'cancelled'),
              'next_run_at', min(run_at) filter (where status in ('queued', 'sending')),
              'first_sent_at', min(done_at) filter (where status = 'sent'),
              'last_sent_at', max(done_at) filter (where status = 'sent'))
            from wv_reminder_jobs where not is_test),
    'recent', case when lvl >= 5 then (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select id, seg, branch, client, status, error, drop_reason, coalesce(done_at, claimed_at, requested_at) as at, requested_by, is_test
          from wv_reminder_jobs order by id desc limit 40) r) else '[]'::jsonb end,
    'failed', case when lvl >= 5 then (select coalesce(jsonb_agg(f), '[]'::jsonb) from (
        select id, seg, client, phone, error, send_error_class('lost', error) as cls
          from wv_reminder_jobs where status = 'failed' and not is_test order by id desc limit 200) f) else '[]'::jsonb end);
end $$;

-- Level 5: queue the clients who are ready (warm first), optionally only p_limit of them, from p_at (null = now), p_batch at a time every p_every minutes.
create or replace function public.wv_reminder_enqueue(p_at timestamptz default null, p_limit int default null, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text; n int := 0; cfg wv_reminder_config; slot timestamptz; first_at timestamptz; last_at timestamptz; r record;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  if p_limit is not null and p_limit < 1 then raise exception 'How many must be at least 1'; end if;
  select * into cfg from wv_reminder_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  first_at := slot;
  select m.name into who from dashboard_me() m limit 1;
  for r in select s.* from wv_reminder_state() s where s.job_state is null and s.reason is null order by (s.seg = 'warm') desc, s.client_key limit p_limit loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    insert into wv_reminder_jobs (seg, branch, client_key, client, phone, requested_by, run_at) values (r.seg, r.branch, r.client_key, r.client, r.phone, who, slot);
    n := n + 1; last_at := slot;
  end loop;
  return jsonb_build_object('queued', n, 'first_at', first_at, 'last_at', last_at);
end $$;

create or replace function public.wv_reminder_reschedule(p_at timestamptz, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0; cfg wv_reminder_config; slot timestamptz; r record;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  select * into cfg from wv_reminder_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  for r in select id from wv_reminder_jobs where status = 'queued' and not is_test order by id loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    update wv_reminder_jobs set run_at = slot where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('moved', n);
end $$;

-- Level 5: cancel what is still waiting (what is already tagged has gone to GHL and cannot be called back).
create or replace function public.wv_reminder_stop() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  update wv_reminder_jobs set status = 'cancelled', done_at = now(), error = 'Stopped from the page' where status = 'queued' and not is_test;
  get diagnostics n = row_count;
  return jsonb_build_object('cancelled', n);
end $$;

-- Level 5: queue failed ones again. Safe because the worker looks each client up in GHL first and skips anyone who already carries wv-reminder-go or wv-reminder-sent.
create or replace function public.wv_reminder_retry(p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  update wv_reminder_jobs j set status = 'queued', error = null, drop_reason = null, attempts = 0, run_at = now(), requested_at = now(), done_at = null
   where j.id = any(p_ids) and j.status = 'failed' and not j.is_test
     and not exists (select 1 from wv_reminder_jobs o where o.phone = j.phone and not o.is_test and o.status in ('queued', 'sending', 'sent') and o.id <> j.id);
  get diagnostics n = row_count;
  return jsonb_build_object('queued', n);
end $$;

-- Level 5: one test to the test number (Kate's own phone, set on wv_reminder_config). Ignores the switch and the window; the worker still looks her up in GHL and
-- adds wv-reminder-go, which fires the workflow only if it is Published, and only if she does not carry the tag already (re-entry is off).
create or replace function public.wv_reminder_test() returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg wv_reminder_config; who text; new_id bigint;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from wv_reminder_config where id = 1;
  if cfg.test_phone is null then raise exception 'No test number set'; end if;
  select m.name into who from dashboard_me() m limit 1;
  insert into wv_reminder_jobs (seg, branch, client_key, client, phone, requested_by, is_test)
  values ('warm', 'SAA', 'test-' || gen_random_uuid(), 'Test', cfg.test_phone, who, true) returning id into new_id;
  return new_id;
end $$;
create or replace function public.wv_reminder_test_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  return (select jsonb_build_object('status', status, 'error', error) from wv_reminder_jobs where id = p_id and is_test);
end $$;

create or replace function public.wv_reminder_config_set(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from dashboard_me() m limit 1;
  update wv_reminder_config set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    per_run = coalesce((p_patch ->> 'per_run')::int, per_run),
    hour_from = coalesce((p_patch ->> 'hour_from')::int, hour_from),
    hour_to = coalesce((p_patch ->> 'hour_to')::int, hour_to),
    updated_at = now(), updated_by = who
   where id = 1;
  return wv_reminder_info();
end $$;

-- ── worker functions (service role only) ────────────────────────────────────────────────────────
-- Take up to n due jobs. The switch and the Dubai window are checked HERE (a test ignores both). A job stuck in 'sending' for 10 minutes is marked failed, not re-sent.
-- The drop check runs again on the jobs just taken: anyone who bought a voucher since she was queued, joined the opt-out list, was marked Do not contact / Wrong number,
-- or wrote "not for me" or STOP is skipped with the reason, and the reason is counted on the page.
create or replace function public.wv_reminder_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg wv_reminder_config; hr int; n int; ids bigint[]; out jsonb;
begin
  select * into cfg from wv_reminder_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  update wv_reminder_jobs set status = 'failed', done_at = now(), error = 'Interrupted while tagging. Retrying is safe: the sender looks her up in GHL first and skips anyone who already has the tag.'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  with pick as (
    select j.id from wv_reminder_jobs j
     where j.status = 'queued' and j.run_at <= now() and (j.is_test or (cfg.enabled and hr >= cfg.hour_from and hr < cfg.hour_to))
     order by j.is_test desc, j.run_at, j.id limit n for update skip locked
  ), upd as (
    update wv_reminder_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1 from pick where j.id = pick.id returning j.id
  ) select coalesce(array_agg(id), '{}') into ids from upd;
  if array_length(ids, 1) > 0 then
    update wv_reminder_jobs j set status = 'skipped', done_at = now(), drop_reason = d.reason,
           error = case d.reason when 'bought' then 'Bought a voucher since she was queued' when 'optout' then 'On the opt-out list now'
                    when 'excluded' then 'Marked Do not contact or Wrong number' when 'not_for_me' then 'Wrote not for me' when 'stop' then 'Wrote STOP' end
      from public.wv_reminder_drops((select array_agg(x.phone) from wv_reminder_jobs x where x.id = any(ids) and not x.is_test)) d
     where j.id = any(ids) and not j.is_test and j.phone = d.phone;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'phone', j.phone, 'is_test', j.is_test, 'attempts', j.attempts) order by j.id), '[]'::jsonb)
    into out from wv_reminder_jobs j where j.id = any(ids) and j.status = 'sending';
  return out;
end $$;

-- p_status: 'sent' (her tag is on in GHL), 'queued' (try again; only for a failed look-up or a 429, the third attempt fails for good), 'failed' or 'skipped'.
create or replace function public.wv_reminder_finish(p_id bigint, p_status text, p_error text default null, p_contact text default null) returns void
language plpgsql security definer set search_path = public as $$
declare j wv_reminder_jobs;
begin
  select * into j from wv_reminder_jobs where id = p_id;
  if not found then return; end if;
  if p_status = 'sent' then
    update wv_reminder_jobs set status = 'sent', done_at = now(), error = null, ghl_contact_id = coalesce(p_contact, ghl_contact_id) where id = p_id;
    if not j.is_test then update wv_reminder_list set tagged = true where phone = j.phone; end if;
  elsif p_status = 'queued' and j.attempts >= 3 then
    update wv_reminder_jobs set status = 'failed', done_at = now(), error = left('Gave up after 3 tries: ' || coalesce(p_error, ''), 300), ghl_contact_id = coalesce(p_contact, ghl_contact_id) where id = p_id;
  elsif p_status = 'queued' then
    update wv_reminder_jobs set status = 'queued', error = left(p_error, 300), run_at = now() + interval '2 minutes', ghl_contact_id = coalesce(p_contact, ghl_contact_id) where id = p_id;
  else
    update wv_reminder_jobs set status = case when p_status = 'skipped' then 'skipped' else 'failed' end, done_at = now(), error = left(p_error, 300), ghl_contact_id = coalesce(p_contact, ghl_contact_id) where id = p_id;
    -- a skip because she already carries wv-reminder-sent or wv-reminder-go means the reminder has gone to her already
    if p_status = 'skipped' and not j.is_test and coalesce(p_error, '') like 'Already has%' then update wv_reminder_list set tagged = true where phone = j.phone; end if;
  end if;
end $$;

revoke all on function public.wv_reminder_drops(text[]), public.wv_reminder_state(), public.wv_reminder_info(), public.wv_reminder_enqueue(timestamptz, int, int, int),
  public.wv_reminder_reschedule(timestamptz, int, int), public.wv_reminder_stop(), public.wv_reminder_retry(bigint[]), public.wv_reminder_test(), public.wv_reminder_test_get(bigint),
  public.wv_reminder_config_set(jsonb), public.wv_reminder_claim(int), public.wv_reminder_finish(bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.wv_reminder_info(), public.wv_reminder_enqueue(timestamptz, int, int, int), public.wv_reminder_reschedule(timestamptz, int, int), public.wv_reminder_stop(),
  public.wv_reminder_retry(bigint[]), public.wv_reminder_test(), public.wv_reminder_test_get(bigint), public.wv_reminder_config_set(jsonb) to authenticated;
grant execute on function public.wv_reminder_claim(int), public.wv_reminder_finish(bigint, text, text, text) to service_role;

-- The cron: every minute inside the Dubai window (06:00 to 15:59 UTC covers 10:00 to 19:59 Dubai; the claim applies the exact window), copied from wv-last-worker's command.
do $$
declare c text;
begin
  select command into c from cron.job where jobname = 'wv-last-worker' limit 1;
  if c is null or c not like '%wv-last-worker%' then raise exception 'could not copy the wv-last-worker cron'; end if;
  if not exists (select 1 from cron.job where jobname = 'wv-reminder-worker') then
    perform cron.schedule('wv-reminder-worker', '* 6-15 * * *', replace(c, 'wv-last-worker', 'wv-reminder-worker'));
  end if;
end $$;
