-- Wellness Voucher Blast 4 (the last push): send it from the site (Kate, 23 Oct 2026). Additive: nothing existing is touched except lost_wa_queue (see the bottom).
-- Blast 4 goes through respond.io, not GoHighLevel: the two Meta templates wellness_voucher_last_push_warm and wellness_voucher_last_push_new are APPROVED on the
-- channel Call Center 2 (id 569496, +971 56 277 3945, the shared WABA). The page queues one message per client, the edge function wv-last-worker sends each through
-- respond.io's Developer API as a WhatsApp template message from that number, then tags the contact. Same pattern as the Lost Clients sender (migrations/lost_send.sql)
-- and the Wellness Voucher wave sender (wv_send.sql, send_schedule*.sql): a switch that is OFF until Kate turns it on, a Dubai send window, a time each job may go
-- (run_at), a pace, Stop, retry triage and a test send to her own phone.
--
--   wv_last_config      one row: the kill switch, per-run size, window, the channel, the test number
--   wv_last_templates   the two approved templates (body kept as respond.io shows it, {{1}} = first name)
--   wv_last_jobs        one row per message: queued, sending, sent, failed, skipped, cancelled. One live message per phone.
--   wv_last_pool()      who may be queued now: the wv_lastpush list minus anyone who bought, is on a stop list, or already has a message
--   Page (Level 3+): wv_last_info(). Level 5: wv_last_enqueue / reschedule / stop / retry / test / config_set. Worker only (service role): claim / finish / tag_todo / tag_done.
-- Tables have RLS on and no policy; everything goes through the functions (security definer, level checked inside).

create table if not exists public.wv_last_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  per_run int not null default 25 check (per_run between 1 and 50),
  hour_from int not null default 10 check (hour_from between 0 and 23),
  hour_to int not null default 19 check (hour_to between 1 and 24),
  channel_id bigint not null default 569496,
  channel_label text not null default 'Call Center 2 +971 56 277 3945',
  test_phone text,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.wv_last_config (id, test_phone) select 1, (select test_phone from public.lost_send_config where id = 1) on conflict do nothing;
alter table public.wv_last_config enable row level security;
revoke all on public.wv_last_config from public, anon, authenticated;

create table if not exists public.wv_last_templates (
  key text primary key,                  -- warm | new
  respond_name text not null,
  language text not null default 'en_GB',
  body text not null,
  approved boolean not null default false,
  sort int not null default 0
);
insert into public.wv_last_templates (key, respond_name, language, body, approved, sort) values
('warm', 'wellness_voucher_last_push_warm', 'en_GB',
$b$Hi {{1}}, you asked about the Wellness Voucher, so a quick note before it closes on 31 October.

You can reserve yours here:
https://www.tararosesalon.com/en/ae/wellness-voucher-campaign/#reserve

If you would rather talk it through, just reply and we will help. No pressure at all.$b$, true, 1),
('new', 'wellness_voucher_last_push_new', 'en_GB',
$b$Hi {{1}}, this is Tara Rose. Our Wellness Voucher closes on 31 October.

Choose one of three tiers, and the gift card that comes with it is emailed, in your name, to whoever you would like to give it to.

Everything is here:
https://www.tararosesalon.com/en/ae/wellness-voucher-campaign/#reserve

Or reply and we will help you choose.$b$, true, 2)
on conflict (key) do nothing;
alter table public.wv_last_templates enable row level security;
revoke all on public.wv_last_templates from public, anon, authenticated;

create table if not exists public.wv_last_jobs (
  id bigserial primary key,
  seg text not null check (seg in ('warm', 'clean')),
  branch text not null,
  client_key text not null,
  client text not null,
  phone text not null,
  channel_id bigint not null,
  tkey text not null references public.wv_last_templates (key),
  params text[] not null,
  body_text text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  error text,
  attempts int not null default 0,
  run_at timestamptz not null default now(),
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
-- One live message per phone, so a double click or two people queueing the same list cannot send twice.
create unique index if not exists wv_last_jobs_one_per_phone on public.wv_last_jobs (phone) where status in ('queued', 'sending', 'sent') and not is_test;
create index if not exists wv_last_jobs_pick on public.wv_last_jobs (status, run_at);
alter table public.wv_last_jobs enable row level security;
revoke all on public.wv_last_jobs from public, anon, authenticated;

-- ── who may be queued now ───────────────────────────────────────────────────────────────────────
-- The list (wv_lastpush) minus: a voucher bought since (any Phorest 'Voucher WV-..' sale matched on name, as wv_lastpush_performance does), a number on a stop list
-- (lost_send_optout, lost_excluded 'Do not contact' / 'Wrong number'), and a number that already has a live or failed message (a failed one may have gone: retry it from the triage).
create or replace function public.wv_last_pool() returns table (seg text, branch text, client_key text, client text, phone text, spend numeric)
language sql stable security definer set search_path = public as $$
  with sales as materialized (
    select distinct on (s.item) lower(btrim(s.client_name)) as ck
      from public.sales_transaction_lines s
     where s.date >= date '2026-08-01' and s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$' order by s.item, s.date),
  l as (select w.*, coalesce(a.sales_name, w.client_key) as mk from public.wv_lastpush w left join public.wv_blast_alias a on a.client_key = w.client_key)
  select l.seg, l.branch, l.client_key, l.client, l.phone, l.spend
    from l
   where coalesce(l.phone, '') <> ''
     and not exists (select 1 from sales sa where sa.ck = l.mk)
     and not exists (select 1 from public.lost_send_optout oo where right(regexp_replace(oo.phone, '\D', '', 'g'), 9) = right(regexp_replace(l.phone, '\D', '', 'g'), 9))
     and not exists (select 1 from public.lost_excluded ee where ee.client_key = l.client_key and ee.reason in ('Do not contact', 'Wrong number'))
     and not exists (select 1 from public.wv_last_jobs j where j.phone = l.phone and not j.is_test and j.status in ('queued', 'sending', 'sent', 'failed'))
$$;

-- First name for {{1}}: the first word, after a leading Miss / Mr / Mrs / Ms / Dr, and 'Al Hanouf' keeps both words. A blank name reads 'there'.
create or replace function public.wv_last_first_name(p_client text) returns text
language sql immutable as $$
  with n as (select regexp_replace(btrim(coalesce(p_client, '')), '^(miss|mr|mrs|ms|dr)\.?\s+', '', 'i') as s)
  select coalesce(nullif(initcap(case when lower(split_part(s, ' ', 1)) in ('al', 'el', 'abu', 'bin') and split_part(s, ' ', 2) <> ''
                                      then split_part(s, ' ', 1) || ' ' || split_part(s, ' ', 2) else split_part(s, ' ', 1) end), ''), 'there') from n
$$;
create or replace function public.wv_last_render(p_body text, p_params text[]) returns text
language plpgsql immutable as $$
declare s text := p_body; i int;
begin
  for i in 1 .. coalesce(array_length(p_params, 1), 0) loop s := replace(s, '{{' || i || '}}', p_params[i]); end loop;
  return s;
end $$;

-- ── page functions ──────────────────────────────────────────────────────────────────────────────
create or replace function public.wv_last_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg wv_last_config;
begin
  if wv_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from wv_last_config where id = 1;
  return jsonb_build_object(
    'enabled', cfg.enabled, 'per_run', cfg.per_run, 'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to,
    'channel_id', cfg.channel_id, 'channel_label', cfg.channel_label, 'test_ready', cfg.test_phone is not null,
    'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int, 'server_now', now(), 'updated_at', cfg.updated_at, 'updated_by', cfg.updated_by,
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'respond_name', t.respond_name, 'approved', t.approved, 'body', t.body) order by t.sort), '[]'::jsonb) from wv_last_templates t),
    'segs', (select coalesce(jsonb_agg(s order by s.sort), '[]'::jsonb) from (
        select g.seg, g.sort,
               (select count(*) from wv_lastpush w where w.seg = g.seg) as listed,
               (select count(*) from wv_last_pool() p where p.seg = g.seg) as ready,
               count(*) filter (where j.status = 'sent') as sent,
               count(*) filter (where j.status in ('queued', 'sending')) as waiting,
               count(*) filter (where j.status = 'failed') as failed,
               count(*) filter (where j.status = 'skipped') as skipped,
               count(*) filter (where j.status = 'cancelled') as cancelled,
               min(j.run_at) filter (where j.status in ('queued', 'sending')) as next_run_at,
               max(j.sent_at) as last_run_at,
               min(j.requested_at) as launched_at
          from (values ('warm', 1), ('clean', 2)) g(seg, sort)
          left join wv_last_jobs j on j.seg = g.seg and not j.is_test
         group by g.seg, g.sort) s),
    'recent', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select id, seg, branch, client, status, error, coalesce(sent_at, claimed_at, requested_at) as at, requested_by
          from wv_last_jobs where not is_test order by id desc limit 40) r),
    'failed', (select coalesce(jsonb_agg(f), '[]'::jsonb) from (
        select id, seg, client, phone, error, send_error_class('lost', error) as cls
          from wv_last_jobs where status = 'failed' and not is_test order by id desc limit 200) f));
end $$;

-- Level 5: queue one list ('warm' or 'clean'): the top spenders first, optionally only p_limit of them, from p_at (null = now), p_batch at a time every p_every minutes.
create or replace function public.wv_last_enqueue(p_seg text, p_at timestamptz default null, p_limit int default null, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text; n int := 0; cfg wv_last_config; slot timestamptz; first_at timestamptz; last_at timestamptz; r record; t wv_last_templates; prm text[];
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_seg not in ('warm', 'clean') then raise exception 'Unknown list %', p_seg; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  if p_limit is not null and p_limit < 1 then raise exception 'How many must be at least 1'; end if;
  select * into cfg from wv_last_config where id = 1;
  select * into t from wv_last_templates where key = case p_seg when 'warm' then 'warm' else 'new' end;
  if not t.approved then raise exception 'That template is not approved yet'; end if;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  first_at := slot;
  select m.name into who from dashboard_me() m limit 1;
  for r in select * from wv_last_pool() p where p.seg = p_seg order by p.spend desc, p.client_key limit p_limit loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    prm := array[wv_last_first_name(r.client)];
    insert into wv_last_jobs (seg, branch, client_key, client, phone, channel_id, tkey, params, body_text, requested_by, run_at)
    values (r.seg, r.branch, r.client_key, r.client, r.phone, cfg.channel_id, t.key, prm, wv_last_render(t.body, prm), who, slot);
    n := n + 1; last_at := slot;
  end loop;
  return jsonb_build_object('queued', n, 'first_at', first_at, 'last_at', last_at);
end $$;

create or replace function public.wv_last_reschedule(p_seg text, p_at timestamptz, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0; cfg wv_last_config; slot timestamptz; r record;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  select * into cfg from wv_last_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  for r in select id from wv_last_jobs where seg = p_seg and status = 'queued' and not is_test order by id loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    update wv_last_jobs set run_at = slot where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('moved', n);
end $$;

create or replace function public.wv_last_stop(p_seg text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  update wv_last_jobs set status = 'cancelled', error = 'Stopped from the page' where seg = p_seg and status = 'queued' and not is_test;
  get diagnostics n = row_count;
  return jsonb_build_object('cancelled', n);
end $$;

create or replace function public.wv_last_retry(p_ids bigint[], p_at timestamptz default null, p_batch int default null, p_every int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0; cfg wv_last_config; slot timestamptz; r record;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  select * into cfg from wv_last_config where id = 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  for r in select id from wv_last_jobs where id = any(p_ids) and status = 'failed' and not is_test order by id loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    update wv_last_jobs set status = 'queued', error = null, attempts = 0, run_at = slot, requested_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('queued', n);
end $$;

-- Level 5: one test message to the test number (Kate's own phone, set on wv_last_config), the warm template. Ignores the switch and the window.
create or replace function public.wv_last_test() returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg wv_last_config; t wv_last_templates; who text; prm text[]; new_id bigint;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from wv_last_config where id = 1;
  if cfg.test_phone is null then raise exception 'No test number set'; end if;
  select * into t from wv_last_templates where key = 'warm';
  if not t.approved then raise exception 'That template is not approved yet'; end if;
  select m.name into who from dashboard_me() m limit 1;
  prm := array[wv_last_first_name(split_part(coalesce(who, ''), ' ', 1))];
  insert into wv_last_jobs (seg, branch, client_key, client, phone, channel_id, tkey, params, body_text, requested_by, is_test)
  values ('warm', 'SAA', 'test-' || gen_random_uuid(), 'Test', cfg.test_phone, cfg.channel_id, t.key, prm, wv_last_render(t.body, prm), who, true)
  returning id into new_id;
  return new_id;
end $$;
create or replace function public.wv_last_test_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if wv_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  return (select jsonb_build_object('status', status, 'error', error, 'tagged', tagged, 'tag_err', tag_err) from wv_last_jobs where id = p_id and is_test);
end $$;

create or replace function public.wv_last_config_set(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from dashboard_me() m limit 1;
  update wv_last_config set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    per_run = coalesce((p_patch ->> 'per_run')::int, per_run),
    hour_from = coalesce((p_patch ->> 'hour_from')::int, hour_from),
    hour_to = coalesce((p_patch ->> 'hour_to')::int, hour_to),
    updated_at = now(), updated_by = who
   where id = 1;
  return wv_last_info();
end $$;

-- ── worker functions (service role only) ────────────────────────────────────────────────────────
-- Take up to n due jobs. The switch and the Dubai window are checked HERE (a test ignores both). A job stuck in 'sending' for 10 minutes is marked failed, not re-sent:
-- the message may have gone, so a person looks in respond.io first. Anyone who bought a voucher since she was queued is skipped.
create or replace function public.wv_last_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg wv_last_config; hr int; n int; ids bigint[]; out jsonb;
begin
  select * into cfg from wv_last_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  update wv_last_jobs set status = 'failed', error = 'Interrupted while sending. Look in respond.io before you retry; it may have gone.'
   where status = 'sending' and claimed_at < now() - interval '10 minutes';
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  with pick as (
    select j.id from wv_last_jobs j
     where j.status = 'queued' and j.run_at <= now() and (j.is_test or (cfg.enabled and hr >= cfg.hour_from and hr < cfg.hour_to))
     order by j.is_test desc, j.run_at, j.id limit n for update skip locked
  ), upd as (
    update wv_last_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1 from pick where j.id = pick.id returning j.id
  ) select coalesce(array_agg(id), '{}') into ids from upd;
  update wv_last_jobs j set status = 'skipped', error = 'Bought a voucher since she was queued'
   where j.id = any(ids) and not j.is_test and exists (
     select 1 from public.sales_transaction_lines s
      where s.date >= current_date - 4 and s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$'
        and lower(btrim(s.client_name)) = coalesce((select a.sales_name from public.wv_blast_alias a where a.client_key = j.client_key), j.client_key));
  select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'phone', j.phone, 'channel_id', j.channel_id, 'seg', j.seg, 'params', j.params, 'body_text', j.body_text,
           'is_test', j.is_test, 'attempts', j.attempts, 'template', t.respond_name, 'language', t.language) order by j.id), '[]'::jsonb)
    into out from wv_last_jobs j join wv_last_templates t on t.key = j.tkey where j.id = any(ids) and j.status = 'sending';
  return out;
end $$;

-- p_status: 'sent', 'queued' (try again after p_retry_min minutes; the third attempt fails for good), 'failed' or 'skipped'.
create or replace function public.wv_last_finish(p_id bigint, p_status text, p_error text default null, p_message_id text default null,
  p_contact_id bigint default null, p_retry_min int default 5) returns void
language plpgsql security definer set search_path = public as $$
declare j wv_last_jobs;
begin
  select * into j from wv_last_jobs where id = p_id;
  if not found then return; end if;
  if p_status = 'sent' then
    update wv_last_jobs set status = 'sent', sent_at = now(), error = null, message_id = p_message_id, contact_id = p_contact_id where id = p_id;
  elsif p_status = 'queued' and j.attempts < 3 then
    update wv_last_jobs set status = 'queued', error = left(p_error, 300), run_at = now() + make_interval(mins => greatest(p_retry_min, 1)) where id = p_id;
  elsif p_status = 'queued' then
    update wv_last_jobs set status = 'failed', error = left('Gave up after 3 tries: ' || coalesce(p_error, ''), 300) where id = p_id;
  else
    update wv_last_jobs set status = case when p_status = 'skipped' then 'skipped' else 'failed' end, error = left(p_error, 300), contact_id = coalesce(p_contact_id, contact_id) where id = p_id;
  end if;
end $$;

create or replace function public.wv_last_tag_todo(p_n int default 20) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'contact_id', j.contact_id,
    'tags', case when j.is_test then jsonb_build_array('wv-last-test') else jsonb_build_array('wv-last-push', 'wv-last-push-' || j.seg) end)), '[]'::jsonb)
  from (select * from wv_last_jobs where status = 'sent' and not tagged and tag_attempts < 5 and contact_id is not null order by id limit p_n) j
$$;
create or replace function public.wv_last_tag_done(p_id bigint, p_err text default null) returns void
language sql security definer set search_path = public as $$
  update wv_last_jobs set tagged = (p_err is null), tag_err = left(p_err, 300), tag_attempts = tag_attempts + (case when p_err is null then 0 else 1 end) where id = p_id
$$;

revoke all on function public.wv_last_pool(), public.wv_last_first_name(text), public.wv_last_render(text, text[]), public.wv_last_info(),
  public.wv_last_enqueue(text, timestamptz, int, int, int), public.wv_last_reschedule(text, timestamptz, int, int), public.wv_last_stop(text),
  public.wv_last_retry(bigint[], timestamptz, int, int), public.wv_last_test(), public.wv_last_test_get(bigint), public.wv_last_config_set(jsonb),
  public.wv_last_claim(int), public.wv_last_finish(bigint, text, text, text, bigint, int), public.wv_last_tag_todo(int), public.wv_last_tag_done(bigint, text)
  from public, anon, authenticated;
grant execute on function public.wv_last_info(), public.wv_last_enqueue(text, timestamptz, int, int, int), public.wv_last_reschedule(text, timestamptz, int, int),
  public.wv_last_stop(text), public.wv_last_retry(bigint[], timestamptz, int, int), public.wv_last_test(), public.wv_last_test_get(bigint), public.wv_last_config_set(jsonb) to authenticated;
grant execute on function public.wv_last_claim(int), public.wv_last_finish(bigint, text, text, text, bigint, int), public.wv_last_tag_todo(int), public.wv_last_tag_done(bigint, text) to service_role;

-- The worker runs every minute inside the Dubai window, like lost-send-worker and wv-send-worker: the same command (the project anon key it carries is not written here),
-- pointed at the new function. Nothing is sent while wv_last_config.enabled is false.
do $$
declare c text;
begin
  select command into c from cron.job where jobname = 'lost-send-worker' limit 1;
  if c is not null and not exists (select 1 from cron.job where jobname = 'wv-last-worker') then
    perform cron.schedule('wv-last-worker', '* 6-15 * * *', replace(c, 'lost-send-worker', 'wv-last-worker'));
  end if;
end $$;

-- respond-status-sync (nightly) now also checks the phones of Blast 3 and Blast 4, so the performance section can show delivered / seen / replied for them the next morning.
-- It was: the phones on lost_lists_base only. Same stale rule as before. These rows land in lost_wa_status and do not change the Lost Clients page, which reads by its own phones.
create or replace function public.lost_wa_queue(p_limit integer default 400, p_stale interval default '20:00:00'::interval) returns text[]
language sql security definer set search_path to 'public' as $$
  select coalesce(array_agg(phone), '{}') from (
    select p.phone from (
      select distinct btrim(x) as phone from lost_lists_base b, unnest(string_to_array(b.phones, ' / ')) x where b.phones is not null
      union select j.phone from wv_send_jobs j where j.status = 'sent' and coalesce(j.phone, '') <> ''
      union select w.phone from wv_lastpush w where coalesce(w.phone, '') <> ''
      union select j.phone from wv_last_jobs j where not j.is_test and coalesce(j.phone, '') <> ''
    ) p
    left join lost_wa_status w on w.phone = p.phone
    where w.phone is null or w.checked_at < now() - p_stale
    order by w.checked_at nulls first limit p_limit) q
$$;
