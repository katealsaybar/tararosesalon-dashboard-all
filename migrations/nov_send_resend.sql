-- November blasts: Resend failed (Kate, 5 Nov 2026).
--
-- Meta held back some of the 4 Nov sends (131049, its per-user marketing limit; 130472, a number held out of an experiment). Nothing was charged. The job for each of
-- them reads "sent" (respond.io accepted it) with delivery "failed", so the normal Send (nov_send_enqueue) refuses them as "Already queued or sent in a November
-- blast", and the one-live-message-per-phone index would refuse a second job anyway. This adds a separate, narrow path that queues ONE new job per failed client, the
-- same message word for word, once the 24 hours Meta asks for have passed. It is the twin of lost_send_resend (19 Oct 2026).
--
--   nov_send_resend_pool(blast)      who is eligible, and the first reason someone is not (internal, worker/service only)
--   nov_send_resend_preview(blast)   what a Resend would do right now, without queueing anything (Level 5)
--   nov_send_resend(blast, confirm)  queues them (Level 5; live mode only, sending switched on, typed RESEND <blast>)
--   nov_send_info()                  the same as before, plus the "sent again" counts per blast; a failed job that was sent again no longer counts as failed
--
-- Eligible: the first send of this blast's current run, delivery failed with 131049 or 130472, at least 24 hours since it went, and the client has not written STOP,
-- is not on an opt-out list, has no appointment from today on, has not written back since, has no other message queued or sent, and was not messaged in the last 24 hours.
-- A job that is itself a resend is never sent a third time. "Message undeliverable" (a number WhatsApp cannot reach) is never retried.
--
-- How the old job gets out of the way: the old job is marked status 'failed' with retried_at set (its delivery 'failed' and its error code stay as they were), which frees the
-- one-per-phone index, and a new queued job (resend_of = the old id) takes its place in the SAME run, so the worker, the pace, the window, the claim re-check, the gate and the
-- status looks all behave as before. The old row is kept, not deleted. ADDITIVE: two nullable columns, new functions, one function replaced (nov_send_info, same signature).
-- Every UPDATE has a WHERE (the API role loads safeupdate).

alter table public.nov_send_jobs add column if not exists resend_of bigint;
alter table public.nov_send_jobs add column if not exists retried_at timestamptz;
create index if not exists nov_send_jobs_resend_of on public.nov_send_jobs (resend_of) where resend_of is not null;

create or replace function public.nov_send_resend_pool(p_blast text)
returns table (job_id bigint, client_key text, phone text, branch text, err_code text, sent_at timestamptz, reason text, ready_at timestamptz)
language sql stable security definer set search_path = public set statement_timeout = '60s' as $$
  with td as (select (now() at time zone 'Asia/Dubai')::date as d),
  bk as (select distinct stl_key_fold(b.client_key) as k from client_bookings b, td where b.date >= td.d),
  ex as (select distinct stl_key_fold(e.client_key) as k from lost_excluded e where e.reason in ('Do not contact', 'Wrong number')),
  f as (
    select j.id, j.client_key, j.phone, j.branch, j.err_code, j.sent_at, j.stop
    from nov_send_jobs j join nov_send_blasts b on b.blast_id = j.blast_id and b.run = j.run
    where j.blast_id = p_blast and not j.dry and not j.is_test and j.status = 'sent' and j.delivery = 'failed' and j.retried_at is null and j.resend_of is null
  )
  select f.id, f.client_key, f.phone, f.branch, f.err_code, f.sent_at,
    case
      when f.err_code is null or not (f.err_code like '131049%' or f.err_code like '130472%') then 'Not delivered for another reason, not retried'
      when f.stop then 'Wrote STOP'
      when exists (select 1 from lost_send_optout o where o.phone = f.phone) or coalesce(w.opted_out, false) or coalesce(w.is_blocked, false)
           or exists (select 1 from unnest(coalesce(w.tags, '{}'::text[])) t where lower(t) in ('dnd', 'do not contact', 'lost-optout'))
           or f.client_key in (select ex.k from ex) or stl_key_fold(f.client_key) in (select ex.k from ex) then 'Opted out or do not contact'
      when f.client_key in (select bk.k from bk) or stl_key_fold(f.client_key) in (select bk.k from bk) then 'Has an appointment booked'
      when w.last_in is not null and w.last_in > f.sent_at then 'Wrote back since'
      when exists (select 1 from nov_send_jobs k where k.id <> f.id and not k.dry and not k.is_test and k.status in ('queued', 'sending', 'sent')
                   and (k.phone = f.phone or k.client_key = f.client_key)) then 'Has another message queued or sent'
      when f.sent_at > now() - interval '24 hours' then 'Waiting: 24 hours have not passed yet'
      when w.last_out >= now() - interval '24 hours'
           or exists (select 1 from lost_send_jobs l where l.phone = f.phone and l.status = 'sent' and not l.is_test and l.sent_at > now() - interval '24 hours')
        then 'Messaged in the last 24 hours'
    end,
    f.sent_at + interval '24 hours'
  from f left join lost_wa_status w on w.phone = f.phone
$$;

-- What a Resend would do right now, without queueing anything.
create or replace function public.nov_send_resend_preview(p_blast text) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '90s' as $$
declare tot int; ok int; sk jsonb; nxt timestamptz; codes jsonb;
begin
  perform nov_send_guard();
  perform 1 from nov_send_blasts where blast_id = p_blast;
  if not found then raise exception 'That blast has not been sent'; end if;
  with c as materialized (select * from nov_send_resend_pool(p_blast))
  select count(*), count(*) filter (where reason is null),
         coalesce((select jsonb_object_agg(r.reason, r.n) from (select reason, count(*) n from c where reason is not null group by 1) r), '{}'::jsonb),
         (select min(ready_at) from c where reason like 'Waiting%'),
         coalesce((select jsonb_object_agg(r.code, r.n) from (select left(err_code, 6) code, count(*) n from c where reason is null group by 1) r), '{}'::jsonb)
    into tot, ok, sk, nxt, codes from c;
  return jsonb_build_object('total', tot, 'ok', ok, 'skip', sk, 'next_ready', nxt, 'codes', codes);
end $$;

-- Queue the resend. Live mode only (a dry run would leave the old jobs standing and nothing to compare), sending switched on, and the typed words RESEND <blast>.
create or replace function public.nov_send_resend(p_blast text, p_confirm text default null) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '90s' as $$
declare
  cfg nov_send_config; who text; b nov_send_blasts; r record; n int := 0; first_id bigint; new_id bigint; sk jsonb; tot int;
begin
  who := nov_send_guard();
  select * into cfg from nov_send_config where id = 1;
  if cfg.dry_run then raise exception 'Resend works on a live send. Go live first'; end if;
  if not cfg.enabled then raise exception 'Sending from the site is switched off'; end if;
  if upper(btrim(coalesce(p_confirm, ''))) <> 'RESEND ' || upper(p_blast) then raise exception 'Type RESEND % to confirm', upper(p_blast); end if;
  select * into b from nov_send_blasts where blast_id = p_blast;
  if not found then raise exception 'That blast has not been sent'; end if;
  if b.dry then raise exception 'That blast was a dry run'; end if;
  if exists (select 1 from nov_send_jobs j where j.blast_id = p_blast and j.run = b.run and not j.is_test and j.status in ('queued', 'sending')) then
    raise exception 'This blast still has messages queued. Wait for them, or cancel the rest first';
  end if;
  perform pg_advisory_xact_lock(hashtext('nov_send_resend'));
  for r in select * from nov_send_resend_pool(p_blast) p where p.reason is null order by p.job_id loop
    -- one at a time: the old job leaves the one-per-phone index, then its replacement takes the place
    update nov_send_jobs o set status = 'failed', retried_at = now(),
           error = 'Meta did not deliver it (' || coalesce(left(o.err_code, 6), '?') || '). Sent again on ' || to_char(now() at time zone 'Asia/Dubai', 'DD Mon HH24:MI') || ' Dubai time.'
     where o.id = r.job_id and o.status = 'sent' and o.retried_at is null;
    if not found then continue; end if;
    insert into nov_send_jobs (blast_id, run, client_key, client_name, phone, branch, channel_id, tpl, language, params, body_text, image_url, dry, requested_by, resend_of)
    select o.blast_id, o.run, o.client_key, o.client_name, o.phone, o.branch, o.channel_id, o.tpl, o.language, o.params, o.body_text, o.image_url, false, who || ' (resend)', o.id
      from nov_send_jobs o where o.id = r.job_id
    returning id into new_id;
    first_id := coalesce(first_id, new_id);
    n := n + 1;
  end loop;
  select count(*), coalesce((select jsonb_object_agg(x.reason, x.n) from (select reason, count(*) n from nov_send_resend_pool(p_blast) where reason is not null group by 1) x), '{}'::jsonb)
    into tot, sk from nov_send_resend_pool(p_blast);
  if n > 0 then
    update nov_send_blasts set state = 'running', state_by = who, state_at = now() where blast_id = p_blast;
    -- the gate judges this resend on its own numbers, unless something else is still queued
    if not exists (select 1 from nov_send_jobs j where j.status in ('queued', 'sending') and not j.dry and not j.is_test and j.resend_of is null) then
      update nov_send_config set gate_from = first_id - 1 where id = 1;
    end if;
  end if;
  return jsonb_build_object('queued', n, 'skip', sk);
end $$;

-- nov_send_info, as before (nov_send.sql), plus: a job that was sent again no longer counts (the new job does), and each blast gets 'again_*' counts for its resends.
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
            'first_sent', min(j.sent_at), 'last_sent', max(j.sent_at),
            'again', count(*) filter (where j.resend_of is not null),
            'again_queued', count(*) filter (where j.resend_of is not null and j.status in ('queued', 'sending')),
            'again_delivered', count(*) filter (where j.resend_of is not null and j.status = 'sent' and j.delivery in ('delivered', 'read')),
            'again_failed', count(*) filter (where j.resend_of is not null and (j.status = 'failed' or j.delivery = 'failed')))
          from nov_send_jobs j where j.blast_id = b.blast_id and j.run = b.run and not j.is_test and j.retried_at is null),
        'errors', (select coalesce(jsonb_agg(jsonb_build_object('e', x.e, 'n', x.n) order by x.n desc), '[]'::jsonb)
          from (select coalesce(j.err_code, left(j.error, 90)) as e, count(*) as n from nov_send_jobs j
                where j.blast_id = b.blast_id and j.run = b.run and not j.is_test and j.retried_at is null and (j.status in ('failed', 'skipped') or j.delivery = 'failed') group by 1 order by 2 desc limit 5) x))), '{}'::jsonb)
      from nov_send_blasts b));
end $$;

revoke all on function public.nov_send_resend_pool(text), public.nov_send_resend_preview(text), public.nov_send_resend(text, text) from public, anon, authenticated;
grant execute on function public.nov_send_resend_preview(text), public.nov_send_resend(text, text) to authenticated;
