-- Lost Client Blasts, Performance report: two extra lines under "Which message" (Kate, 27 Oct 2026).
--   1. Booked after the 31 Oct 2026 deadline without availing the Colour / Smoothing offer.
--   2. Booked after the 31 Oct 2026 deadline, Due only (nobody on this line was sent an offer).
-- A client counts when her next appointment (lost_client_facts.nxt) is after 31 Oct and she has NOT come in since our first message (came_on is null): a client
-- who already came in could have used the rate on that visit (the 26 Oct rule behind the send log's "still to come" filter), so she is shown beside the count, not in it.
-- "Offer" = she was sent a Colour or Smoothing message (lost_send_jobs.qtype). "Due only" = she was sent Due and nothing else. A client who got an offer message and a
-- Due one sits on line 1 only, so the two lines never share a client.
-- Additive: one new function, and lost_drill gains two per-client metrics (late_offer, late_due) so the numbers open the names. Level guard copied from lost_drill.

create or replace function public.lost_after_deadline(p_deadline date default date '2026-10-31') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 2 then raise exception 'Level 3 and above'; end if;
  with t as (
    select j.client_key, bool_or(j.qtype in ('colour', 'smoothing')) as offer
    from public.lost_send_jobs j where j.status = 'sent' and not j.is_test group by 1),
  x as (
    select t.offer, (f.nxt > p_deadline) as late, (f.came_on is not null) as came
    from t left join public.lost_client_facts f on f.client_key = t.client_key)
  select jsonb_build_object(
    'deadline', p_deadline, 'at', now(),
    'offer', jsonb_build_object('clients', count(*) filter (where offer),
        'late', count(*) filter (where offer and late and not came), 'late_came', count(*) filter (where offer and late and came)),
    'due', jsonb_build_object('clients', count(*) filter (where not offer),
        'late', count(*) filter (where not offer and late and not came), 'late_came', count(*) filter (where not offer and late and came)))
  into out from x;
  return out;
end $$;
revoke all on function public.lost_after_deadline(date) from public, anon;
grant execute on function public.lost_after_deadline(date) to authenticated;

-- lost_drill: the two new per-client metrics. The whole live function is replaced; the only changes are the two names in per_client and the two `when` lines.
create or replace function public.lost_drill(p_metric text, p_wave integer default null::integer, p_branch text default 'all'::text, p_tkey text default null::text, p_day text default null::text, p_type text default null::text)
 returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare total int; rows_ jsonb; per_client boolean := p_metric in ('booked', 'appts', 'paid', 'need', 'none', 'today', 'nodep', 'unpaid', 'since', 'ahead', 'done',
    'o_booked_nodep', 'o_booked_dep', 'o_done', 'o_rescheduled', 'o_cancelled', 'o_stop', 'late_offer', 'late_due');
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 2 then raise exception 'Level 3 and above'; end if;
  with f as (
    select fl.*, c.outcome, c.ahead, c.done, c.st, c.nxt, c.svc as next_svc, c.n_appts, c.bal, c.cid as cid, c.came_on as came_on, c.n_msgs as n_msgs,
      case when p_metric in ('seen', 'delivered', 'sent_only') and fl.status = 'sent' then
        (select case m->>'s' when 'read' then 'seen' when 'delivered' then 'delivered' when 'failed' then 'failed' when 'sent' then 'sent' else 'unknown' end
         from public.lost_wa_status w, jsonb_array_elements(coalesce(w.out_msgs, '[]'::jsonb)) m
         where w.phone = fl.phone and abs((m->>'t')::double precision - extract(epoch from fl.sent_at)) < 900
         order by abs((m->>'t')::double precision - extract(epoch from fl.sent_at)) limit 1) end as dst
    from public.lost_send_flags fl left join public.lost_client_facts c on c.client_key = fl.client_key
    where (p_wave is null or coalesce(fl.wave, 0) = p_wave)
      and (coalesce(p_branch, 'all') = 'all' or fl.branch = p_branch)
      and (p_tkey is null or fl.tkey = p_tkey)
      and (nullif(p_type, '') is null or fl.qtype = p_type)
      and (p_day is null or to_char(coalesce(fl.sent_at, fl.requested_at) at time zone 'Asia/Dubai', 'YYYY-MM-DD') = p_day)
  ), m as (
    select * from f where case p_metric
      when 'sent' then status = 'sent' when 'failed' then status = 'failed' when 'queued' then status in ('queued', 'sending') when 'skipped' then status = 'skipped'
      when 'replied' then replied and not coalesce(stop, false) when 'stop' then stop when 'blocked' then blocked
      when 'seen' then dst = 'seen' when 'delivered' then dst = 'delivered' when 'sent_only' then dst = 'sent'
      when 'booked' then status = 'sent' and ahead when 'appts' then status = 'sent' and ahead
      when 'paid' then status = 'sent' and st = 'paid' when 'need' then status = 'sent' and st = 'need'
      when 'none' then status = 'sent' and st = 'none' when 'today' then status = 'sent' and st = 'today'
      when 'nodep' then status = 'sent' and st in ('none', 'today') when 'unpaid' then status = 'sent' and st in ('need', 'none')
      when 'since' then status = 'sent' and (ahead or done) when 'ahead' then status = 'sent' and ahead when 'done' then status = 'sent' and done
      when 'o_booked_nodep' then outcome = 'booked_nodep' when 'o_booked_dep' then outcome = 'booked_dep' when 'o_done' then outcome = 'done'
      when 'o_rescheduled' then outcome = 'rescheduled' when 'o_cancelled' then outcome = 'cancelled' when 'o_stop' then outcome = 'stop'
      when 'late_offer' then status = 'sent' and nxt > date '2026-10-31' and came_on is null
        and exists (select 1 from public.lost_send_jobs j where j.client_key = f.client_key and j.status = 'sent' and not j.is_test and j.qtype in ('colour', 'smoothing'))
      when 'late_due' then status = 'sent' and nxt > date '2026-10-31' and came_on is null
        and not exists (select 1 from public.lost_send_jobs j where j.client_key = f.client_key and j.status = 'sent' and not j.is_test and j.qtype in ('colour', 'smoothing'))
      else false end
  ), g as (
    select * from m where not per_client
    union all
    select * from (select distinct on (client_key) * from m where per_client order by client_key, sent_at desc nulls last, id desc) d
  )
  select (select count(*) from g),
         coalesce((select jsonb_agg(r) from (select jsonb_build_object('id', id, 'client', initcap(client_key), 'last4', right(phone, 4), 'phone', phone, 'branch', branch, 'tkey', tkey,
           'wave', coalesce(wave, 0), 'status', status, 'error', error, 'd', to_char(sent_at at time zone 'Asia/Dubai', 'YYYY-MM-DD'),
           't', to_char(sent_at at time zone 'Asia/Dubai', 'HH24:MI'), 'outcome', outcome, 'next', nxt, 'svc', next_svc, 'appts', n_appts, 'st', st,
           'deposit', bal, 'dst', dst, 'cid', cid, 'came', came_on, 'msgs', n_msgs, 'offer', exists (select 1 from public.lost_send_jobs j3 where j3.client_key = g.client_key and j3.status = 'sent' and not j3.is_test and j3.body_text ~* '% off')) as r
           from g order by case when per_client then null else sent_at end desc nulls last, client_key limit 1000) z), '[]'::jsonb)
  into total, rows_;
  return jsonb_build_object('total', total, 'rows', rows_, 'per_client', per_client);
end $function$;
revoke all on function public.lost_drill(text, int, text, text, text, text) from public, anon;
grant execute on function public.lost_drill(text, int, text, text, text, text) to authenticated;
