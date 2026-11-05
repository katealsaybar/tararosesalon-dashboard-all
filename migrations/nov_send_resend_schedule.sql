-- nov_send_resend_schedule.sql (5 Nov 2026, Kate: "after Sending time row pa add ng scheduled time toggle to send this out pls", on the Resend failed dialog).
-- Resend failed can now be set for a time (Dubai) instead of now. Nothing new is needed in the worker: nov_send_claim already takes only jobs with next_try_at <= now(),
-- inside the send window, with the gate and the claim re-check as before. So a scheduled resend is the same queued jobs with next_try_at set to the chosen time.
--
--   nov_send_resend_pool(blast, at)      at = when it would go (default now). The 24 hours Meta asks for are counted to that time, so a client whose 24 hours end before it is
--                                        eligible now; the reason 'Waiting: 24 hours have not passed yet' only names the ones still inside the 24 hours at that time.
--   nov_send_resend_preview(blast, at)   the same preview, for that time.
--   nov_send_resend(blast, confirm, at)  queues them with next_try_at = at (live mode only, sending on, typed RESEND <blast>, as before). A time in the past is refused; at most 3 days ahead.
--   nov_send_resend_when()               per blast, when the next scheduled resend goes (null when none is waiting), for the card.
-- The three old two-argument signatures are dropped and replaced by the same functions with one more argument that defaults to now, so a caller that does not send it behaves as before.
-- Stop a scheduled resend with Cancel on the card (nov_send_cancel), as for any queued message. Every UPDATE has a WHERE (the API role loads safeupdate).

drop function if exists public.nov_send_resend_pool(text);
drop function if exists public.nov_send_resend_preview(text);
drop function if exists public.nov_send_resend(text, text);

create or replace function public.nov_send_resend_pool(p_blast text, p_at timestamptz default null)
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
      when f.sent_at > coalesce(p_at, now()) - interval '24 hours' then 'Waiting: 24 hours have not passed yet'
      when w.last_out >= coalesce(p_at, now()) - interval '24 hours'
           or exists (select 1 from lost_send_jobs l where l.phone = f.phone and l.status = 'sent' and not l.is_test and l.sent_at > coalesce(p_at, now()) - interval '24 hours')
        then 'Messaged in the last 24 hours'
    end,
    f.sent_at + interval '24 hours'
  from f left join lost_wa_status w on w.phone = f.phone
$$;

create or replace function public.nov_send_resend_preview(p_blast text, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '90s' as $$
declare tot int; ok int; sk jsonb; nxt timestamptz; codes jsonb;
begin
  perform nov_send_guard();
  if p_at is not null and p_at < now() - interval '1 minute' then raise exception 'Pick a time that has not passed'; end if;
  if p_at is not null and p_at > now() + interval '3 days' then raise exception 'Pick a time within the next 3 days'; end if;
  perform 1 from nov_send_blasts where blast_id = p_blast;
  if not found then raise exception 'That blast has not been sent'; end if;
  with c as materialized (select * from nov_send_resend_pool(p_blast, p_at))
  select count(*), count(*) filter (where reason is null),
         coalesce((select jsonb_object_agg(r.reason, r.n) from (select reason, count(*) n from c where reason is not null group by 1) r), '{}'::jsonb),
         (select min(ready_at) from c where reason like 'Waiting%'),
         coalesce((select jsonb_object_agg(r.code, r.n) from (select left(err_code, 6) code, count(*) n from c where reason is null group by 1) r), '{}'::jsonb)
    into tot, ok, sk, nxt, codes from c;
  return jsonb_build_object('total', tot, 'ok', ok, 'skip', sk, 'next_ready', nxt, 'codes', codes, 'at', p_at);
end $$;

create or replace function public.nov_send_resend(p_blast text, p_confirm text default null, p_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '90s' as $$
declare
  cfg nov_send_config; who text; b nov_send_blasts; r record; n int := 0; first_id bigint; new_id bigint; sk jsonb; tot int; go_at timestamptz;
begin
  who := nov_send_guard();
  select * into cfg from nov_send_config where id = 1;
  if cfg.dry_run then raise exception 'Resend works on a live send. Go live first'; end if;
  if not cfg.enabled then raise exception 'Sending from the site is switched off'; end if;
  if upper(btrim(coalesce(p_confirm, ''))) <> 'RESEND ' || upper(p_blast) then raise exception 'Type RESEND % to confirm', upper(p_blast); end if;
  if p_at is not null and p_at < now() - interval '1 minute' then raise exception 'Pick a time that has not passed'; end if;
  if p_at is not null and p_at > now() + interval '3 days' then raise exception 'Pick a time within the next 3 days'; end if;
  go_at := greatest(coalesce(p_at, now()), now());
  select * into b from nov_send_blasts where blast_id = p_blast;
  if not found then raise exception 'That blast has not been sent'; end if;
  if b.dry then raise exception 'That blast was a dry run'; end if;
  if exists (select 1 from nov_send_jobs j where j.blast_id = p_blast and j.run = b.run and not j.is_test and j.status in ('queued', 'sending')) then
    raise exception 'This blast still has messages queued. Wait for them, or cancel the rest first';
  end if;
  perform pg_advisory_xact_lock(hashtext('nov_send_resend'));
  for r in select * from nov_send_resend_pool(p_blast, p_at) p where p.reason is null order by p.job_id loop
    -- one at a time: the old job leaves the one-per-phone index, then its replacement takes the place
    update nov_send_jobs o set status = 'failed', retried_at = now(),
           error = 'Meta did not deliver it (' || coalesce(left(o.err_code, 6), '?') || '). Sent again ' || case when go_at > now() + interval '1 minute' then 'from ' else 'on ' end || to_char(go_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI') || ' Dubai time.'
     where o.id = r.job_id and o.status = 'sent' and o.retried_at is null;
    if not found then continue; end if;
    insert into nov_send_jobs (blast_id, run, client_key, client_name, phone, branch, channel_id, tpl, language, params, body_text, image_url, dry, requested_by, resend_of, next_try_at)
    select o.blast_id, o.run, o.client_key, o.client_name, o.phone, o.branch, o.channel_id, o.tpl, o.language, o.params, o.body_text, o.image_url, false, who || ' (resend)', o.id, go_at
      from nov_send_jobs o where o.id = r.job_id
    returning id into new_id;
    first_id := coalesce(first_id, new_id);
    n := n + 1;
  end loop;
  select count(*), coalesce((select jsonb_object_agg(x.reason, x.n) from (select reason, count(*) n from nov_send_resend_pool(p_blast, p_at) where reason is not null group by 1) x), '{}'::jsonb)
    into tot, sk from nov_send_resend_pool(p_blast, p_at);
  if n > 0 then
    update nov_send_blasts set state = 'running', state_by = who, state_at = now() where blast_id = p_blast;
    -- the gate judges this resend on its own numbers, unless something else is still queued
    if not exists (select 1 from nov_send_jobs j where j.status in ('queued', 'sending') and not j.dry and not j.is_test and j.resend_of is null) then
      update nov_send_config set gate_from = first_id - 1 where id = 1;
    end if;
  end if;
  return jsonb_build_object('queued', n, 'skip', sk, 'at', go_at);
end $$;

-- When the next scheduled resend of each blast goes (only those still in the future); the card says so under Sent again.
create or replace function public.nov_send_resend_when() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform nov_send_guard();
  return coalesce((select jsonb_object_agg(x.blast_id, x.t) from (
    select j.blast_id, min(j.next_try_at) as t from nov_send_jobs j
    where j.resend_of is not null and j.status = 'queued' and j.next_try_at > now() and not j.dry and not j.is_test group by 1) x), '{}'::jsonb);
end $$;

revoke all on function public.nov_send_resend_pool(text, timestamptz), public.nov_send_resend_preview(text, timestamptz), public.nov_send_resend(text, text, timestamptz), public.nov_send_resend_when() from public, anon, authenticated;
grant execute on function public.nov_send_resend_preview(text, timestamptz), public.nov_send_resend(text, text, timestamptz), public.nov_send_resend_when() to authenticated;
