-- Blast 4: send or schedule the clean list one branch at a time (Kate, 26 Oct 2026), the way Lost Clients does it.
-- wv_last_enqueue gets an optional p_branch (SAA, KCA, MC or AQ; null = every branch, exactly as before) and wv_last_info
-- says how many are ready per branch inside each list (segs[].by_branch). Nothing else changes: same pool, same safety checks,
-- same sender (wv-last-worker), same Call Center 2 number. A branch already queued is not queued again, because wv_last_pool
-- leaves out anyone who has a queued, sending, sent or failed job.
begin;

drop function if exists public.wv_last_enqueue(text, timestamptz, integer, integer, integer);

create or replace function public.wv_last_enqueue(p_seg text, p_at timestamptz default null, p_limit integer default null, p_batch integer default null, p_every integer default null, p_branch text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare who text; n int := 0; cfg wv_last_config; slot timestamptz; first_at timestamptz; last_at timestamptz; r record; t wv_last_templates; prm text[];
begin
  if wv_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if p_seg not in ('warm', 'clean') then raise exception 'Unknown list %', p_seg; end if;
  if p_branch is not null and p_branch not in ('SAA', 'KCA', 'MC', 'AQ') then raise exception 'Unknown branch %', p_branch; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  if p_limit is not null and p_limit < 1 then raise exception 'How many must be at least 1'; end if;
  select * into cfg from wv_last_config where id = 1;
  select * into t from wv_last_templates where key = case p_seg when 'warm' then 'warm' else 'new' end;
  if not t.approved then raise exception 'That template is not approved yet'; end if;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  first_at := slot;
  select m.name into who from dashboard_me() m limit 1;
  for r in select * from wv_last_pool() p where p.seg = p_seg and (p_branch is null or p.branch = p_branch) order by p.spend desc, p.client_key limit p_limit loop
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    prm := array[wv_last_first_name(r.client)];
    insert into wv_last_jobs (seg, branch, client_key, client, phone, channel_id, tkey, params, body_text, requested_by, run_at)
    values (r.seg, r.branch, r.client_key, r.client, r.phone, cfg.channel_id, t.key, prm, wv_last_render(t.body, prm), who, slot);
    n := n + 1; last_at := slot;
  end loop;
  return jsonb_build_object('queued', n, 'first_at', first_at, 'last_at', last_at);
end $function$;

revoke all on function public.wv_last_enqueue(text, timestamptz, integer, integer, integer, text) from public, anon;
grant execute on function public.wv_last_enqueue(text, timestamptz, integer, integer, integer, text) to authenticated, service_role;

create or replace function public.wv_last_info()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
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
               (select coalesce(jsonb_object_agg(b.branch, b.n), '{}'::jsonb) from (select p.branch, count(*) as n from wv_last_pool() p where p.seg = g.seg group by p.branch) b) as by_branch,
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
end $function$;

commit;
