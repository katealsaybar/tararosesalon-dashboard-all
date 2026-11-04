-- November blasts: send from the site (Kate, 4 Nov 2026: "sa site pls, similar to what we did for oct 2026 blast"). The twin of migrations/lost_send.sql, for the
-- Database Blasts, November page (?view=novblasts). Every blast (A, B, E, E2, E3, F, F2) is sent from ONE number, the call centre WhatsApp Brand Account
-- (respond.io channel 572200, +971 58 155 9679), about 200 every 30 minutes, blast after blast. All of it is ADDITIVE: new tables and functions, nothing existing is touched.
--
--   nov_send_config   one row: enabled (OFF), dry_run (ON, the default), paused (the gate or a person stopped the queue), the channel, the pace (slot_cap per slot_minutes),
--                     the send window in Dubai hours, the gate (stop_pct 2, fail_pct 5, gate_min = the least sent before the gate judges), the Al Quoz end date, where the
--                     header artworks are served from
--   nov_send_blasts   one row per blast: its state (running, paused, cancelled), its run number (queueing again after a cancel starts run 2), the template, the artwork, who queued it
--   nov_send_jobs     one row per client message: queued -> sending -> sent / failed / skipped / cancelled, plus what respond.io says about it later (delivery, error code)
--                     and whether she wrote STOP afterwards. dry = a dry run row: it goes through the whole queue and is marked sent, but nothing is posted to respond.io.
--
-- The audience is the page's own list (nov_blast_snap, the same rows nov_blast_clients shows); it is NOT worked out again here. What IS checked again, at queue time and
-- again at the moment each message is claimed: an appointment booked from today on (client_bookings), the opt-out lists, a message in the last 24 hours, a number whose
-- message failed in the last 24 hours (a failed message, 131049 included, is never retried), a number already queued or sent in a November blast, a usable first name.
-- No tags are written to respond.io from here (another session does that).
--
-- Page functions (Level 5 only, the same guard as the October sender): nov_send_info, nov_send_preview, nov_send_enqueue, nov_send_pause, nov_send_resume, nov_send_cancel,
--   nov_send_test, nov_send_test_get, nov_send_config_set.
-- Worker only (service role; revoked from the page): nov_send_claim, nov_send_finish, nov_send_status_todo, nov_send_status_save, nov_send_gate, nov_send_candidates.
-- Tables have RLS on and no policy. Every DELETE or UPDATE has a WHERE (the API role loads safeupdate).
-- Nothing here sends anything by itself: the edge function nov-send-worker (docs in nov-send-worker.ts beside this file) is what posts to respond.io, and only when
-- nov_send_config.enabled is true AND dry_run is false AND the queue is not paused AND it is inside the window.

create table if not exists public.nov_send_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  dry_run boolean not null default true,
  paused boolean not null default false,
  paused_reason text,
  paused_at timestamptz,
  gate_from bigint not null default 0,                       -- the gate counts only jobs after this id (set when a person resumes after a pause)
  channel_id bigint not null default 572200,
  channel_label text not null default 'WhatsApp Brand Account +971 58 155 9679',
  language text not null default 'en',
  slot_cap int not null default 200 check (slot_cap between 1 and 1000),
  slot_minutes int not null default 30 check (slot_minutes between 5 and 120),
  per_run int not null default 8 check (per_run between 1 and 30),
  hour_from int not null default 9 check (hour_from between 0 and 23),
  hour_to int not null default 21 check (hour_to between 1 and 24),
  stop_pct numeric not null default 2 check (stop_pct > 0 and stop_pct <= 100),
  fail_pct numeric not null default 5 check (fail_pct > 0 and fail_pct <= 100),
  gate_min int not null default 50 check (gate_min between 1 and 5000),
  aq_end text not null default '28 November 2026',
  image_base text not null default 'https://trk-salon-os.com/',
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.nov_send_config (id) values (1) on conflict do nothing;
alter table public.nov_send_config enable row level security;

create table if not exists public.nov_send_blasts (
  blast_id text primary key,
  run int not null default 1,
  state text not null default 'running' check (state in ('running', 'paused', 'cancelled')),
  dry boolean not null default true,
  tpl text not null,
  image text,
  queued_n int not null default 0,
  skip jsonb not null default '{}'::jsonb,                   -- why clients were dropped at queue time: {"Has an appointment booked": 12, ...}
  queued_by text,
  queued_at timestamptz not null default now(),
  state_by text,
  state_at timestamptz
);
alter table public.nov_send_blasts enable row level security;

create table if not exists public.nov_send_jobs (
  id bigserial primary key,
  blast_id text not null,
  run int not null default 1,
  client_key text not null,
  client_name text,
  phone text not null,                                       -- +971..., never sent to the page
  branch text,
  channel_id bigint not null,
  tpl text not null,                                         -- the template name in Meta / respond.io
  language text not null default 'en',
  params text[] not null,                                    -- {{1}} first name, {{2}} salon, {{3}} end date
  body_text text not null,                                   -- the message as it reads, kept as sent
  image_url text,
  dry boolean not null default true,
  is_test boolean not null default false,
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
  delivery text check (delivery in ('sent', 'delivered', 'read', 'failed')),
  delivery_at timestamptz,
  err_code text,                                             -- e.g. 131049 (Meta's per-user marketing cap: no charge, never resent)
  stop boolean not null default false,
  stop_at timestamptz,
  status_checks int not null default 0,
  checked_at timestamptz
);
-- One live message per number, so a double click, two blasts or two clients on one number cannot send twice. Dry runs and tests are outside it.
create unique index if not exists nov_send_jobs_one_per_phone on public.nov_send_jobs (phone) where status in ('queued', 'sending', 'sent') and not dry and not is_test;
create index if not exists nov_send_jobs_pick on public.nov_send_jobs (status, next_try_at);
create index if not exists nov_send_jobs_blast on public.nov_send_jobs (blast_id, run);
create index if not exists nov_send_jobs_check on public.nov_send_jobs (sent_at) where status = 'sent' and not dry and not is_test;
alter table public.nov_send_jobs enable row level security;

-- ── helpers ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.nov_send_render(p_body text, p_params text[]) returns text
language plpgsql immutable as $$
declare s text := p_body; i int;
begin
  for i in 1 .. coalesce(array_length(p_params, 1), 0) loop s := replace(s, '{{' || i || '}}', p_params[i]); end loop;
  return s;
end $$;

-- Level 5 only (Kate). Returns the name of whoever is asking.
create or replace function public.nov_send_guard() returns text
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.level is null or m.level <> 5 then raise exception 'Level 5 only'; end if;
  return m.name;
end $$;

create or replace function public.nov_send_salon(p_branch text) returns text
language sql immutable as $$
  select case p_branch when 'SAA' then 'Saadiyat' when 'KCA' then 'Khalifa City A' when 'MC' then 'Motor City' when 'AQ' then 'Al Quoz' end
$$;

-- ── who would be queued, and why anyone would not ───────────────────────────────────────────
-- The audience is nov_blast_snap (the page's own list). Each client gets the best number we hold for her (one that wrote to us in respond.io first) and the first
-- reason that stops her, or null. Used by the preview, the queue and nothing else. Never returned to the page with a number.
create or replace function public.nov_send_candidates(p_blast text)
returns table (k text, client text, branch text, phone text, first_name text, reason text)
language sql stable security definer set search_path = public set statement_timeout = '60s' as $$
  with td as (select (now() at time zone 'Asia/Dubai')::date as d),
  s as (select x.k, x.client, x.branch from nov_blast_snap x where x.blast_id = p_blast),
  phall as (
    select stl_key_fold(c.client_key) as k, btrim(p) as phone
    from client_contacts c, unnest(string_to_array(c.mobile, ' / ')) p
    where coalesce(c.mobile, '') <> '' and btrim(p) ~ '^(\+9715\d{8}|\+(?!971)\d{9,15})$'
  ),
  ph as (
    select distinct on (a.k) a.k, a.phone
    from phall a join s on s.k = a.k left join lost_wa_status w on w.phone = a.phone
    order by a.k, (coalesce(w.found, false) and w.last_in is not null) desc, coalesce(w.found, false) desc, w.last_in desc nulls last, a.phone
  ),
  bk as (select distinct stl_key_fold(b.client_key) as k from client_bookings b, td where b.date >= td.d),
  ex as (select distinct stl_key_fold(e.client_key) as k from lost_excluded e where e.reason in ('Do not contact', 'Wrong number')),
  e as (
    select s.k, s.client, s.branch, p.phone, w.found, w.checked_at, w.err, w.opted_out, w.is_blocked, w.tags, w.last_out,
           initcap(lower(regexp_replace(split_part(btrim(s.client), ' ', 1), '[.,]+$', ''))) as fn
    from s left join ph p on p.k = s.k left join lost_wa_status w on w.phone = p.phone
  )
  select e.k, e.client, e.branch, e.phone, e.fn,
    case
      when e.phone is null then 'No mobile number on file'
      when e.checked_at is not null and (not coalesce(e.found, false) or e.err ilike 'contact 400%') then 'Not reachable on WhatsApp'
      when exists (select 1 from lost_send_optout o where o.phone = e.phone) or coalesce(e.opted_out, false) or coalesce(e.is_blocked, false)
           or exists (select 1 from unnest(coalesce(e.tags, '{}'::text[])) t where lower(t) in ('dnd', 'do not contact', 'lost-optout'))
           or e.k in (select ex.k from ex) then 'Opted out or do not contact'
      when e.k in (select bk.k from bk) then 'Has an appointment booked'
      when exists (select 1 from nov_send_jobs j where not j.dry and not j.is_test and j.status in ('queued', 'sending', 'sent') and (j.phone = e.phone or j.client_key = e.k))
        then 'Already queued or sent in a November blast'
      when exists (select 1 from nov_send_jobs j where not j.dry and not j.is_test and j.status = 'failed' and j.phone = e.phone and j.requested_at > now() - interval '24 hours')
        then 'A message failed in the last 24 hours, not retried'
      when e.last_out >= now() - interval '24 hours'
           or exists (select 1 from lost_send_jobs j where j.phone = e.phone and j.status = 'sent' and not j.is_test and j.sent_at > now() - interval '24 hours')
        then 'Messaged in the last 24 hours'
      when length(e.fn) < 2 or length(e.fn) > 30 or e.fn ~ '[0-9@/\\]' then 'No usable first name'
    end
  from e
$$;

-- What a blast sends: its template (must be approved in respond.io, data.tpl.<group>.s), the message text and how many variables it carries.
create or replace function public.nov_send_blast_def(p_blast text)
returns table (tpl text, tstatus text, msg text, nparams int, endtxt text, aqtxt text, img text)
language plpgsql stable security definer set search_path = public as $$
declare it nov_blast_items; g text; cfg nov_send_config;
begin
  select * into it from nov_blast_items where id = p_blast;
  if not found or it.id like 'dec%' or it.id in ('oct', 'pre', 'reply', 'terms', 'diff') or jsonb_typeof(it.data -> 'tpl') <> 'object' then raise exception 'Unknown blast'; end if;
  select * into cfg from nov_send_config where id = 1;
  select kv.key into g from jsonb_each(it.data -> 'tpl') kv where kv.value ->> 'n' is not null order by kv.key limit 1;
  if g is null then raise exception 'This blast has no template'; end if;
  tpl := it.data -> 'tpl' -> g ->> 'n'; tstatus := coalesce(it.data -> 'tpl' -> g ->> 's', 'todo');
  msg := it.data -> 'msg' ->> g;
  if coalesce(msg, '') = '' then raise exception 'This blast has no message'; end if;
  nparams := (select coalesce(max((m[1])::int), 0) from regexp_matches(msg, '\{\{(\d+)\}\}', 'g') m);
  if nparams > 3 then raise exception 'The message carries more than three variables'; end if;
  endtxt := coalesce(nullif(btrim(it.data ->> 'end'), ''), '30 November 2026');
  aqtxt := coalesce(nullif(btrim(it.data ->> 'aq_end'), ''), cfg.aq_end);
  img := nullif(btrim(it.data ->> 'img'), '');
  return next;
end $$;

-- ── page functions (Level 5) ─────────────────────────────────────────────────────────────────
create or replace function public.nov_send_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg nov_send_config; g record;
begin
  perform nov_send_guard();
  select * into cfg from nov_send_config where id = 1;
  select count(*) filter (where status in ('sent', 'failed')) as d,
         count(*) filter (where status = 'failed' or delivery = 'failed') as f,
         count(*) filter (where stop) as s into g
    from nov_send_jobs where not dry and not is_test and id > cfg.gate_from and status in ('sent', 'failed');
  return jsonb_build_object(
    'enabled', cfg.enabled, 'dry_run', cfg.dry_run, 'paused', cfg.paused, 'paused_reason', cfg.paused_reason, 'paused_at', cfg.paused_at,
    'channel', cfg.channel_label, 'slot_cap', cfg.slot_cap, 'slot_minutes', cfg.slot_minutes, 'per_run', cfg.per_run, 'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to,
    'stop_pct', cfg.stop_pct, 'fail_pct', cfg.fail_pct, 'gate_min', cfg.gate_min, 'aq_end', cfg.aq_end,
    'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int,
    'gate', jsonb_build_object('sent', g.d, 'failed', g.f, 'stop', g.s),
    'blasts', (select coalesce(jsonb_object_agg(b.blast_id, jsonb_build_object(
        'state', b.state, 'run', b.run, 'dry', b.dry, 'tpl', b.tpl, 'image', b.image, 'queued_n', b.queued_n, 'skip', b.skip, 'by', b.queued_by, 'at', b.queued_at,
        'counts', (select jsonb_build_object(
            'queued', count(*) filter (where j.status in ('queued', 'sending')),
            'sent', count(*) filter (where j.status = 'sent' and coalesce(j.delivery, '') <> 'failed'),
            'delivered', count(*) filter (where j.status = 'sent' and j.delivery in ('delivered', 'read')),
            'read', count(*) filter (where j.status = 'sent' and j.delivery = 'read'),
            'failed', count(*) filter (where j.status = 'failed' or j.delivery = 'failed'),
            'skipped', count(*) filter (where j.status = 'skipped'),
            'cancelled', count(*) filter (where j.status = 'cancelled'),
            'stop', count(*) filter (where j.stop),
            'first_sent', min(j.sent_at), 'last_sent', max(j.sent_at))
          from nov_send_jobs j where j.blast_id = b.blast_id and j.run = b.run and not j.is_test),
        'errors', (select coalesce(jsonb_agg(jsonb_build_object('e', x.e, 'n', x.n) order by x.n desc), '[]'::jsonb)
          from (select coalesce(j.err_code, left(j.error, 90)) as e, count(*) as n from nov_send_jobs j
                where j.blast_id = b.blast_id and j.run = b.run and not j.is_test and (j.status in ('failed', 'skipped') or j.delivery = 'failed') group by 1 order by 2 desc limit 5) x))), '{}'::jsonb)
      from nov_send_blasts b));
end $$;

-- What a Send would do right now, without queueing anything: how many are queued, and how many are dropped by the re-check and why.
create or replace function public.nov_send_preview(p_blast text) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '90s' as $$
declare d record; tot int; ok int; sk jsonb;
begin
  perform nov_send_guard();
  select * into d from nov_send_blast_def(p_blast);
  perform nov_blast_snap_refresh(false);
  with c as materialized (select * from nov_send_candidates(p_blast))
  select count(*), count(*) filter (where reason is null),
         coalesce((select jsonb_object_agg(r.reason, r.n) from (select reason, count(*) n from c where reason is not null group by 1) r), '{}'::jsonb)
    into tot, ok, sk from c;
  return jsonb_build_object('total', tot, 'ok', ok, 'skip', sk, 'tpl', d.tpl, 'tpl_status', d.tstatus, 'end', d.endtxt, 'aq_end', d.aqtxt, 'nparams', d.nparams,
    'image', d.img, 'counted_at', (select m.at from nov_blast_snap_meta m where m.id = 1));
end $$;

-- Queue a blast. p_image = the artwork chosen now (assets/nov-blasts/<file>.png) or null for no header. A live send needs the typed words SEND <blast>; a dry run does not
-- (nothing goes to any client). Returns how many were queued and why each of the others was not.
create or replace function public.nov_send_enqueue(p_blast text, p_image text default null, p_confirm text default null) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '90s' as $$
declare
  cfg nov_send_config; who text; d record; b nov_send_blasts; run_no int; img text; queued int; sk jsonb; tot int; ok int;
begin
  who := nov_send_guard();
  select * into cfg from nov_send_config where id = 1;
  select * into d from nov_send_blast_def(p_blast);
  if d.tstatus <> 'approved' then raise exception 'The template % is not approved yet', d.tpl; end if;
  if not cfg.dry_run then
    if not cfg.enabled then raise exception 'Sending from the site is switched off'; end if;
    if upper(btrim(coalesce(p_confirm, ''))) <> 'SEND ' || upper(p_blast) then raise exception 'Type SEND % to confirm', upper(p_blast); end if;
  end if;
  img := nullif(btrim(coalesce(p_image, '')), '');
  if img is not null and (img !~ '^assets/nov-blasts/[a-z0-9._-]+\.(png|jpg|jpeg)$' or img like '%nov-terms%') then raise exception 'That header image is not one of the artworks'; end if;
  select * into b from nov_send_blasts where blast_id = p_blast;
  if found and b.state in ('running', 'paused') and exists (select 1 from nov_send_jobs j where j.blast_id = p_blast and j.run = b.run and j.status in ('queued', 'sending')) then
    raise exception 'This blast is already queued. Cancel it first if you want to queue it again';
  end if;
  run_no := coalesce(b.run, 0) + 1;
  perform nov_blast_snap_refresh(false);
  with c as materialized (select * from nov_send_candidates(p_blast)),
  ins as (
    insert into nov_send_jobs (blast_id, run, client_key, client_name, phone, branch, channel_id, tpl, language, params, body_text, image_url, dry, requested_by)
    select p_blast, run_no, c.k, c.client, c.phone, c.branch, cfg.channel_id, d.tpl, cfg.language,
           (array[c.first_name, nov_send_salon(c.branch), case when c.branch = 'AQ' then d.aqtxt else d.endtxt end])[1:d.nparams],
           nov_send_render(d.msg, (array[c.first_name, nov_send_salon(c.branch), case when c.branch = 'AQ' then d.aqtxt else d.endtxt end])[1:d.nparams]),
           case when img is null then null else cfg.image_base || img end, cfg.dry_run, who
    from c where c.reason is null and nov_send_salon(c.branch) is not null
    on conflict (phone) where status in ('queued', 'sending', 'sent') and not dry and not is_test do nothing
    returning 1
  )
  select (select count(*) from ins), (select count(*) from c), (select count(*) from c where reason is null),
         coalesce((select jsonb_object_agg(r.reason, r.n) from (select reason, count(*) n from c where reason is not null group by 1) r), '{}'::jsonb)
    into queued, tot, ok, sk;
  if ok > queued then sk := sk || jsonb_build_object('Already queued or sent in a November blast', coalesce((sk ->> 'Already queued or sent in a November blast')::int, 0) + (ok - queued)); end if;
  insert into nov_send_blasts as nb (blast_id, run, state, dry, tpl, image, queued_n, skip, queued_by, queued_at, state_by, state_at)
  values (p_blast, run_no, 'running', cfg.dry_run, d.tpl, img, queued, sk, who, now(), who, now())
  on conflict (blast_id) do update set run = excluded.run, state = 'running', dry = excluded.dry, tpl = excluded.tpl, image = excluded.image, queued_n = excluded.queued_n,
    skip = excluded.skip, queued_by = excluded.queued_by, queued_at = excluded.queued_at, state_by = excluded.state_by, state_at = excluded.state_at;
  return jsonb_build_object('queued', queued, 'total', tot, 'skip', sk, 'dry', cfg.dry_run);
end $$;

-- Pause the whole queue (p_blast null) or one blast. The gate does the first on its own when STOP or failures pass the limits.
create or replace function public.nov_send_pause(p_blast text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := nov_send_guard();
begin
  if p_blast is null then
    update nov_send_config set paused = true, paused_reason = 'Paused by ' || who, paused_at = now() where id = 1;
  else
    update nov_send_blasts set state = 'paused', state_by = who, state_at = now() where blast_id = p_blast and state = 'running';
  end if;
  return nov_send_info();
end $$;

-- Resume. For the whole queue this also resets what the gate counts from (otherwise it would stop again at once on the same numbers), so a person looks at the
-- STOP and failed counts first.
create or replace function public.nov_send_resume(p_blast text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := nov_send_guard();
begin
  if p_blast is null then
    update nov_send_config set paused = false, paused_reason = null, paused_at = null, gate_from = (select coalesce(max(id), 0) from nov_send_jobs) where id = 1;
  else
    update nov_send_blasts set state = 'running', state_by = who, state_at = now() where blast_id = p_blast and state = 'paused';
  end if;
  return nov_send_info();
end $$;

-- Cancel what has not gone yet. Messages already sent stay as they are.
create or replace function public.nov_send_cancel(p_blast text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := nov_send_guard(); b nov_send_blasts; n int;
begin
  select * into b from nov_send_blasts where blast_id = p_blast;
  if not found then raise exception 'That blast is not queued'; end if;
  update nov_send_jobs set status = 'cancelled', error = null where blast_id = p_blast and run = b.run and status = 'queued' and not is_test;
  get diagnostics n = row_count;
  update nov_send_blasts set state = 'cancelled', state_by = who, state_at = now() where blast_id = p_blast;
  return jsonb_build_object('cancelled', n);
end $$;

-- One test message to ONE number typed on the page, through the same worker and template. In dry run mode it is a dry run row and nothing is posted.
-- A live test needs dry_run off (not enabled/window/pace: a test always goes at once).
create or replace function public.nov_send_test(p_blast text, p_phone text, p_image text default null, p_first text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg nov_send_config; who text := nov_send_guard(); d record; ph text; img text; fn text; new_id bigint;
begin
  select * into cfg from nov_send_config where id = 1;
  select * into d from nov_send_blast_def(p_blast);
  if d.tstatus <> 'approved' then raise exception 'The template % is not approved yet', d.tpl; end if;
  ph := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(ph) < 9 or length(ph) > 15 then raise exception 'That is not a usable number'; end if;
  ph := '+' || ph;
  img := nullif(btrim(coalesce(p_image, '')), '');
  if img is not null and (img !~ '^assets/nov-blasts/[a-z0-9._-]+\.(png|jpg|jpeg)$' or img like '%nov-terms%') then raise exception 'That header image is not one of the artworks'; end if;
  fn := coalesce(nullif(initcap(btrim(coalesce(p_first, ''))), ''), 'Kate');
  insert into nov_send_jobs (blast_id, run, client_key, client_name, phone, branch, channel_id, tpl, language, params, body_text, image_url, dry, is_test, requested_by)
  values (p_blast, 0, 'test-' || gen_random_uuid(), 'Test', ph, 'SAA', cfg.channel_id, d.tpl, cfg.language,
          (array[fn, 'Saadiyat', d.endtxt])[1:d.nparams], nov_send_render(d.msg, (array[fn, 'Saadiyat', d.endtxt])[1:d.nparams]),
          case when img is null then null else cfg.image_base || img end, cfg.dry_run, true, who)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.nov_send_test_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform nov_send_guard();
  return (select jsonb_build_object('status', status, 'error', error, 'dry', dry, 'delivery', delivery, 'err_code', err_code) from nov_send_jobs where id = p_id and is_test);
end $$;

-- The switches and the pace. Pass only what changes: {"enabled": true} {"dry_run": false} {"slot_cap": 200} {"stop_pct": 2}.
create or replace function public.nov_send_config_set(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := nov_send_guard();
begin
  update nov_send_config set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    dry_run = coalesce((p_patch ->> 'dry_run')::boolean, dry_run),
    slot_cap = coalesce((p_patch ->> 'slot_cap')::int, slot_cap),
    slot_minutes = coalesce((p_patch ->> 'slot_minutes')::int, slot_minutes),
    per_run = coalesce((p_patch ->> 'per_run')::int, per_run),
    hour_from = coalesce((p_patch ->> 'hour_from')::int, hour_from),
    hour_to = coalesce((p_patch ->> 'hour_to')::int, hour_to),
    stop_pct = coalesce((p_patch ->> 'stop_pct')::numeric, stop_pct),
    fail_pct = coalesce((p_patch ->> 'fail_pct')::numeric, fail_pct),
    gate_min = coalesce((p_patch ->> 'gate_min')::int, gate_min),
    aq_end = coalesce(nullif(btrim(p_patch ->> 'aq_end'), ''), aq_end),
    updated_at = now(), updated_by = who
  where id = 1;
  return nov_send_info();
end $$;

-- ── worker functions (service role only) ─────────────────────────────────────────────────────
-- The gate: STOP replies over stop_pct, or failed messages over fail_pct, of what has been sent since the last resume, once at least gate_min have been sent. It pauses
-- the whole queue (one number, one reputation) and says why. Failed = failed at respond.io or failed later at Meta (131049 and the rest).
create or replace function public.nov_send_gate() returns void
language plpgsql security definer set search_path = public as $$
declare cfg nov_send_config; d int; f int; s int;
begin
  select * into cfg from nov_send_config where id = 1;
  if cfg.paused then return; end if;
  select count(*), count(*) filter (where status = 'failed' or delivery = 'failed'), count(*) filter (where stop) into d, f, s
    from nov_send_jobs where not dry and not is_test and id > cfg.gate_from and status in ('sent', 'failed');
  if d < cfg.gate_min then return; end if;
  if s * 100.0 / d > cfg.stop_pct then
    update nov_send_config set paused = true, paused_at = now(), paused_reason = format('Paused by the gate: %s STOP replies of %s sent (%s%%, limit %s%%)', s, d, round(s * 100.0 / d, 1), cfg.stop_pct) where id = 1;
  elsif f * 100.0 / d > cfg.fail_pct then
    update nov_send_config set paused = true, paused_at = now(), paused_reason = format('Paused by the gate: %s failed of %s sent (%s%%, limit %s%%)', f, d, round(f * 100.0 / d, 1), cfg.fail_pct) where id = 1;
  end if;
end $$;

-- Take up to n queued messages. Dry run rows go whenever the worker runs. Live rows need: enabled, not dry_run, not paused, inside the Dubai window, the blast running, and room
-- in the current slot (slot_cap per slot_minutes, one number, so blast after blast in the order they were queued). Before it picks, queued live rows are checked again:
-- booked from today on, or on an opt-out list, and are skipped. A message stuck 'sending' for 10 minutes is marked failed, never re-sent (it may have gone).
create or replace function public.nov_send_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg nov_send_config; hr int; n int; room int; slot_start timestamptz; today date := (now() at time zone 'Asia/Dubai')::date; live_ok boolean; out jsonb;
begin
  update nov_send_jobs set status = 'failed', error = 'Interrupted while sending. Look in respond.io before you retry; it may have gone.'
    where status = 'sending' and claimed_at < now() - interval '10 minutes';
  perform nov_send_gate();
  select * into cfg from nov_send_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  live_ok := cfg.enabled and not cfg.dry_run and not cfg.paused and hr >= cfg.hour_from and hr < cfg.hour_to;
  if live_ok then
    update nov_send_jobs j set status = 'skipped', error = 'Booked since it was queued'
      where j.status = 'queued' and not j.dry and not j.is_test
        and j.client_key in (select stl_key_fold(b.client_key) from client_bookings b where b.date >= today);
    update nov_send_jobs j set status = 'skipped', error = 'On an opt-out list since it was queued'
      where j.status = 'queued' and not j.dry and not j.is_test
        and (exists (select 1 from lost_send_optout o where o.phone = j.phone)
             or exists (select 1 from lost_wa_status w where w.phone = j.phone and (w.opted_out or w.is_blocked)));
  end if;
  slot_start := date_bin(make_interval(mins => cfg.slot_minutes), now(), timestamptz '2026-01-01 00:00:00+04');
  select greatest(0, cfg.slot_cap - count(*)) into room from nov_send_jobs j
    where not j.dry and not j.is_test and j.status in ('sending', 'sent', 'failed') and j.claimed_at >= slot_start;
  with cand as (
    select j.id, j.is_test, case when j.dry or j.is_test then 0
             else row_number() over (partition by (j.dry or j.is_test) order by coalesce(b.queued_at, now()), j.id) end as rn
    from nov_send_jobs j left join nov_send_blasts b on b.blast_id = j.blast_id and b.run = j.run
    where j.status = 'queued' and j.next_try_at <= now()
      and (j.dry or (not cfg.dry_run and (j.is_test or (live_ok and b.state = 'running'))))
  ), pick as (
    select j.id from nov_send_jobs j join cand c on c.id = j.id
    where c.rn = 0 or c.rn <= room
    order by c.is_test desc, c.rn, j.id limit n for update of j skip locked
  ), upd as (
    update nov_send_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1 from pick where j.id = pick.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'phone', u.phone, 'channel_id', u.channel_id, 'tpl', u.tpl, 'language', u.language, 'params', u.params,
      'body_text', u.body_text, 'image_url', u.image_url, 'dry', u.dry, 'is_test', u.is_test, 'attempts', u.attempts) order by u.id), '[]'::jsonb)
  into out from upd u;
  return out;
end $$;

-- p_status: 'sent', 'queued' (try again after p_retry_min minutes; the third attempt fails for good), 'failed' or 'skipped'. A dry run row is marked sent with no message id.
create or replace function public.nov_send_finish(p_id bigint, p_status text, p_error text default null, p_message_id text default null,
  p_contact_id bigint default null, p_retry_min int default 5) returns void
language plpgsql security definer set search_path = public as $$
declare j nov_send_jobs;
begin
  select * into j from nov_send_jobs where id = p_id;
  if not found then return; end if;
  if p_status = 'sent' then
    update nov_send_jobs set status = 'sent', sent_at = now(), error = null, message_id = p_message_id, contact_id = coalesce(p_contact_id, contact_id),
      delivery = case when dry then null else 'sent' end where id = p_id;
  elsif p_status = 'queued' and j.attempts < 3 then
    update nov_send_jobs set status = 'queued', error = left(p_error, 300), next_try_at = now() + make_interval(mins => greatest(p_retry_min, 1)) where id = p_id;
  elsif p_status = 'queued' then
    update nov_send_jobs set status = 'failed', error = left('Gave up after 3 tries: ' || coalesce(p_error, ''), 300) where id = p_id;
  else
    update nov_send_jobs set status = case when p_status = 'skipped' then 'skipped' else 'failed' end, error = left(p_error, 300), contact_id = coalesce(p_contact_id, contact_id) where id = p_id;
  end if;
end $$;

-- Sent messages whose delivery and replies are due a look: first about 5 minutes after the send, then 30 minutes, 2 hours, 8 hours and 24 hours (five looks each, so STOP replies
-- reach the gate within the hour and the load stays small).
create or replace function public.nov_send_status_todo(p_n int default 25) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'contact_id', x.contact_id, 'message_id', x.message_id, 'sent_at', x.sent_at) order by x.id), '[]'::jsonb)
  from (select j.id, j.contact_id, j.message_id, j.sent_at from nov_send_jobs j
        where j.status = 'sent' and not j.dry and not j.is_test and j.contact_id is not null and j.status_checks < 5
          and j.sent_at + (array[5, 30, 120, 480, 1440])[j.status_checks + 1] * interval '1 minute' <= now()
        order by j.sent_at limit p_n) x
$$;

-- What the look found: the best delivery word reached (read > delivered > failed > sent), Meta's error code, and whether she wrote STOP. A STOP also goes
-- on the shared opt-out list. The gate is judged after every save.
create or replace function public.nov_send_status_save(p_id bigint, p_delivery text default null, p_err_code text default null, p_stop boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare j nov_send_jobs; rk int; cur int;
begin
  select * into j from nov_send_jobs where id = p_id;
  if not found then return; end if;
  -- failed beats sent (respond.io accepted it, then Meta refused it: 131049) but never beats delivered or read
  rk := case p_delivery when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 when 'sent' then 1 else 0 end;
  cur := case j.delivery when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 when 'sent' then 1 else 0 end;
  update nov_send_jobs set
    delivery = case when rk > cur then p_delivery else delivery end,
    delivery_at = case when rk > cur then now() else delivery_at end,
    err_code = coalesce(p_err_code, err_code),
    stop = stop or coalesce(p_stop, false),
    stop_at = case when coalesce(p_stop, false) and not stop then now() else stop_at end,
    status_checks = status_checks + 1, checked_at = now()
  where id = p_id;
  if coalesce(p_stop, false) then
    insert into lost_send_optout (phone, reason, added_by) values (j.phone, 'Wrote STOP after a November blast', 'nov-send-worker') on conflict (phone) do nothing;
  end if;
  perform nov_send_gate();
end $$;

-- Supabase grants new functions to anon and authenticated by default; take that away, then give back only what the page needs (Level 5 is checked inside each).
revoke all on function public.nov_send_render(text, text[]), public.nov_send_guard(), public.nov_send_salon(text), public.nov_send_candidates(text), public.nov_send_blast_def(text),
  public.nov_send_info(), public.nov_send_preview(text), public.nov_send_enqueue(text, text, text), public.nov_send_pause(text), public.nov_send_resume(text), public.nov_send_cancel(text),
  public.nov_send_test(text, text, text, text), public.nov_send_test_get(bigint), public.nov_send_config_set(jsonb),
  public.nov_send_gate(), public.nov_send_claim(int), public.nov_send_finish(bigint, text, text, text, bigint, int), public.nov_send_status_todo(int),
  public.nov_send_status_save(bigint, text, text, boolean) from public, anon, authenticated;
grant execute on function public.nov_send_info(), public.nov_send_preview(text), public.nov_send_enqueue(text, text, text), public.nov_send_pause(text), public.nov_send_resume(text),
  public.nov_send_cancel(text), public.nov_send_test(text, text, text, text), public.nov_send_test_get(bigint), public.nov_send_config_set(jsonb) to authenticated;

-- Record of what is NOT done by this file (do these by hand, at go-live, after the templates are approved and Kate has said go):
--   1. deploy the edge function nov-send-worker (nov-send-worker.ts), verify_jwt on;
--   2. schedule it: select cron.schedule('nov-send-worker', '* 5-17 * * *', $$ select net.http_post(
--        url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/nov-send-worker',
--        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the project anon key, as the other nightly jobs use>'),
--        body := '{}'::jsonb, timeout_milliseconds := 60000); $$);          -- 05:00-17:59 UTC = 09:00-21:59 Dubai; the window in nov_send_config does the real limiting
--   3. mark each template approved on the page's data (update nov_blast_items set data = jsonb_set(data, '{tpl,warm,s}', '"approved"') where id = 'A'), then the Send button shows;
--   4. to go live: update nov_send_config set enabled = true, dry_run = false where id = 1 (or the two switches on the page).
