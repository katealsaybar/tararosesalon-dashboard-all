-- Lost Client Blasts, Performance report: click a number to see who, and an Outcome column in the send log (Kate, 26 Oct 2026, from Belle's review).
-- Additive, plus one replaced function (lost_send_log_get gains p_outcome and returns the outcome per row; every key it returned before is still there,
-- and an old copy of the page that does not send p_outcome gets the same answer as before).
--
--   lost_booking_track      one row per messaged client with a booking: the first date we saw, the date she holds now, whether she moved it
--                           (resched_on) or it vanished before its day (cancelled_on). client_bookings only ever holds the latest pull, so the
--                           history starts the day this is first run (26 Oct 2026): moves and cancels from before that are not known.
--   lost_booking_track_run() compares today's pull with the tracked dates. Cron 18:00 UTC (22:00 Dubai). It does nothing unless all four
--                           branches were pulled today, so a day without a pull can never read as a cancel.
--   lost_client_facts       one row per messaged client: booked ahead, deposit state, came in, STOP, and the one outcome the log shows:
--                             stop > rescheduled > booked_dep (deposit needed by the policy) > booked_nodep > cancelled > done
--   lost_drill(metric, wave, branch, tkey, day, type)   the clients behind a number on the page, same filters as the table cell.
--   lost_send_log_get(..., p_outcome)                   the log cut to one or more outcomes (p_outcome is one outcome or a comma list, 'none' = no outcome yet; one row per client), with the count of each outcome.
-- Level 2 and above, like the rest of the report.

create table if not exists public.lost_booking_track (
  client_key  text primary key,
  first_seen  date not null,
  first_date  date not null,
  cur_date    date not null,
  moves       int  not null default 0,
  resched_on  date,
  cancelled_on date,
  updated_on  date not null
);
alter table public.lost_booking_track enable row level security;
revoke all on public.lost_booking_track from public, anon, authenticated;

create or replace function public.lost_booking_track_run() returns text
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Dubai')::date; fresh int; ins int; mv int; cx int;
begin
  select count(distinct branch) into fresh from public.client_bookings where pulled_on = today;
  if fresh < 4 then return 'skipped: only ' || fresh || ' branches pulled today'; end if;
  create temp table _cur on commit drop as
    select public.stl_key_fold(b.client_key) as k, min(b.date) as cur from public.client_bookings b where b.date >= today group by 1;
  create temp table _s on commit drop as
    select distinct j.client_key as k from public.lost_send_jobs j where j.status = 'sent' and not j.is_test;

  -- moved: a new earliest date while the old one was still ahead, or a new booking after a cancel
  update public.lost_booking_track t set moves = t.moves + 1, resched_on = today, cur_date = c.cur, cancelled_on = null, updated_on = today
  from _cur c where c.k = t.client_key and c.cur <> t.cur_date and (t.cur_date >= today or t.cancelled_on is not null);
  get diagnostics mv = row_count;
  -- a new booking after the last one was kept: not a move
  update public.lost_booking_track t set cur_date = c.cur, resched_on = null, updated_on = today
  from _cur c where c.k = t.client_key and c.cur <> t.cur_date and t.cur_date < today and t.cancelled_on is null;
  -- gone before its day (today's own appointment is left alone: it may simply have been taken off the list after she came in)
  update public.lost_booking_track t set cancelled_on = today, updated_on = today
  where t.cancelled_on is null and t.cur_date > today and not exists (select 1 from _cur c where c.k = t.client_key);
  get diagnostics cx = row_count;
  insert into public.lost_booking_track (client_key, first_seen, first_date, cur_date, updated_on)
  select c.k, today, c.cur, c.cur, today from _cur c join _s s on s.k = c.k
  on conflict (client_key) do nothing;
  get diagnostics ins = row_count;
  return format('tracked %s new, %s moved, %s cancelled', ins, mv, cx);
end $$;
revoke all on function public.lost_booking_track_run() from public, anon, authenticated;

create or replace view public.lost_client_facts as
with s as (
  select distinct on (j.client_key) j.client_key as k, (j.sent_at at time zone 'Asia/Dubai')::date as sent_d
  from public.lost_send_jobs j where j.status = 'sent' and not j.is_test order by j.client_key, j.sent_at),
nb as (
  select distinct on (public.stl_key_fold(b.client_key)) public.stl_key_fold(b.client_key) as k, b.date as nxt
  from public.client_bookings b where b.date >= current_date order by public.stl_key_fold(b.client_key), b.date),
sv as (
  select public.stl_key_fold(b.client_key) as k, b.date, string_agg(b.services, ', ') as svc
  from public.client_bookings b where b.date >= current_date group by 1, 2),
ap as (
  select public.stl_key_fold(b.client_key) as k, count(distinct b.date) as n from public.client_bookings b where b.date >= current_date group by 1),
dep as (
  select public.stl_key_fold(public.stl_client_key(l.client_name)) as k, coalesce(sum(l.net), 0) as bal
  from public.sales_transaction_lines l where l.item in ('Deposit', 'Deposit (Refund)') and l.date >= current_date - 90 group by 1),
vis as (
  select public.stl_key_fold(public.stl_client_key(l.client_name)) as k, min(l.date) as first_d, max(l.date) as last_d
  from public.sales_transaction_lines l
  where l.date >= (select min(sent_d) from s) and l.net >= 0 and l.item not in ('Deposit', 'Deposit (Refund)') group by 1),
stp as (select f.client_key as k, bool_or(f.stop) as stop from public.lost_send_flags f group by 1),
x as (
  select s.k as client_key, s.sent_d, (nb.k is not null) as ahead, nb.nxt, left(coalesce(sv.svc, ''), 90) as svc, coalesce(ap.n, 0) as n_appts,
         coalesce(d.bal, 0) as bal,
         (nb.k is null and v.first_d is not null and v.first_d >= s.sent_d) as done, v.last_d,
         coalesce(p.stop, false) as stop, t.resched_on, t.cancelled_on,
         (nb.k is not null and nb.nxt <> current_date and coalesce(sv.svc, '') ~* 'balayage|foil|highlight|all over colo|restyle|extension') as needs_dep
  from s left join nb on nb.k = s.k left join sv on sv.k = s.k and sv.date = nb.nxt left join ap on ap.k = s.k left join dep d on d.k = s.k
         left join vis v on v.k = s.k left join stp p on p.k = s.k left join public.lost_booking_track t on t.client_key = s.k)
select x.client_key, x.sent_d, x.ahead, x.nxt, x.svc, x.n_appts, x.bal, x.done, x.stop, x.resched_on, x.cancelled_on, x.needs_dep,
       case when not x.ahead then null when x.bal > 0 then 'paid' when x.nxt = current_date then 'today' when x.needs_dep then 'need' else 'none' end as st,
       case when x.stop then 'stop'
            when x.ahead and x.resched_on is not null then 'rescheduled'
            when x.ahead and x.needs_dep then 'booked_dep'
            when x.ahead then 'booked_nodep'
            when x.cancelled_on is not null and not coalesce(x.last_d >= x.cancelled_on, false) then 'cancelled'
            when x.done then 'done' end as outcome
from x;
revoke all on public.lost_client_facts from public, anon, authenticated;

drop function if exists public.lost_send_log_get(int, text, text, text, int, int, text);
create or replace function public.lost_send_log_get(p_wave int default null, p_branch text default 'all', p_status text default 'all',
  p_q text default '', p_offset int default 0, p_limit int default 50, p_type text default null, p_outcome text default 'all') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total int; rows_ jsonb; oc jsonb; lim int := least(greatest(coalesce(p_limit, 50), 1), 500); q text := lower(btrim(coalesce(p_q, '')));
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 2 then raise exception 'Level 3 and above'; end if;
  with f as (
    select fl.*, c.outcome, c.nxt, c.svc as next_svc, ws.contact_id as cid
    from public.lost_send_flags fl left join public.lost_client_facts c on c.client_key = fl.client_key left join public.lost_wa_status ws on ws.phone = fl.phone
    where (p_wave is null or coalesce(fl.wave, 0) = p_wave)
      and (coalesce(p_branch, 'all') = 'all' or fl.branch = p_branch)
      and (coalesce(p_status, 'all') = 'all' or (p_status = 'queued' and fl.status in ('queued', 'sending')) or fl.status = p_status)
      and (nullif(p_type, '') is null or fl.qtype = p_type)
      and (q = '' or fl.client_key like '%' || q || '%' or right(fl.phone, 4) = q)
  ), g as (
    select * from f where coalesce(p_outcome, 'all') = 'all'
    union all
    select * from (select distinct on (client_key) * from f where coalesce(p_outcome, 'all') <> 'all' and coalesce(outcome, 'none') = any (string_to_array(p_outcome, ','))
                   order by client_key, sent_at desc nulls last, id desc) d
  ), page as (
    select * from g order by sent_at desc nulls last, id desc offset greatest(coalesce(p_offset, 0), 0) limit lim
  )
  select (select count(*) from g),
         coalesce((select jsonb_agg(jsonb_build_object('id', id, 'client', initcap(client_key), 'last4', right(phone, 4), 'phone', phone, 'branch', branch, 'qtype', qtype,
           'tkey', tkey, 'arm', arm, 'wave', coalesce(wave, 0), 'status', status, 'error', error, 'text', body_text, 'message_id', message_id,
           'd', to_char(sent_at at time zone 'Asia/Dubai', 'YYYY-MM-DD'), 't', to_char(sent_at at time zone 'Asia/Dubai', 'HH24:MI:SS'),
           'qd', to_char(requested_at at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI'), 'by', requested_by,
           'replied', replied, 'booked', booked, 'stop', stop, 'blocked', blocked, 'outcome', outcome, 'next', nxt, 'svc', next_svc, 'cid', cid)
           order by sent_at desc nulls last, id desc) from page), '[]'::jsonb),
         coalesce((select jsonb_object_agg(o, n) from (select coalesce(outcome, 'none') as o, count(distinct client_key) n from f group by 1) x), '{}'::jsonb)
  into total, rows_, oc;
  return jsonb_build_object('total', total, 'rows', rows_, 'outcomes', oc);
end $$;
revoke all on function public.lost_send_log_get(int, text, text, text, int, int, text, text) from public, anon;
grant execute on function public.lost_send_log_get(int, text, text, text, int, int, text, text) to authenticated;

-- The clients behind a number. p_metric is the card or table column; the wave, branch, message, day and type narrow it the way the table row does.
-- Message numbers (sent, replied, STOP, blocked, failed, queued, skipped, seen, delivered, not delivered) list one row per message.
-- Client numbers (booked, appointments, deposit paid / likely needed / none needed / today, booked since the message, booked ahead, already came in,
-- and the six outcomes o_booked_nodep o_booked_dep o_done o_rescheduled o_cancelled o_stop) list one row per client, her latest message.
create or replace function public.lost_drill(p_metric text, p_wave int default null, p_branch text default 'all', p_tkey text default null,
  p_day text default null, p_type text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total int; rows_ jsonb; per_client boolean := p_metric in ('booked', 'appts', 'paid', 'need', 'none', 'today', 'nodep', 'unpaid', 'since', 'ahead', 'done',
    'o_booked_nodep', 'o_booked_dep', 'o_done', 'o_rescheduled', 'o_cancelled', 'o_stop');
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 2 then raise exception 'Level 3 and above'; end if;
  with f as (
    select fl.*, c.outcome, c.ahead, c.done, c.st, c.nxt, c.svc as next_svc, c.n_appts, c.bal, ws.contact_id as cid,
      case when p_metric in ('seen', 'delivered', 'sent_only') and fl.status = 'sent' then
        (select case m->>'s' when 'read' then 'seen' when 'delivered' then 'delivered' when 'failed' then 'failed' when 'sent' then 'sent' else 'unknown' end
         from public.lost_wa_status w, jsonb_array_elements(coalesce(w.out_msgs, '[]'::jsonb)) m
         where w.phone = fl.phone and abs((m->>'t')::double precision - extract(epoch from fl.sent_at)) < 900
         order by abs((m->>'t')::double precision - extract(epoch from fl.sent_at)) limit 1) end as dst
    from public.lost_send_flags fl left join public.lost_client_facts c on c.client_key = fl.client_key left join public.lost_wa_status ws on ws.phone = fl.phone
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
           'deposit', bal, 'dst', dst, 'cid', cid) as r
           from g order by case when per_client then null else sent_at end desc nulls last, client_key limit 1000) z), '[]'::jsonb)
  into total, rows_;
  return jsonb_build_object('total', total, 'rows', rows_, 'per_client', per_client);
end $$;
revoke all on function public.lost_drill(text, int, text, text, text, text) from public, anon;
grant execute on function public.lost_drill(text, int, text, text, text, text) to authenticated;

-- 26 Oct 2026, later: the welcome-back terms (section 6) need the appointment AND the booking on or before 31 Oct 2026, so the send log can be cut to the clients whose
-- next appointment is after 31 Oct, and to those of them whose message carried an offer ("% off"). lost_send_log_get gains p_after (date) and p_offer (boolean) and each
-- row gains offer. Applied live by rewriting the live function (replace in its text, drop the 8-argument signature, create the 10-argument one):
--   and (p_after is null or c.nxt > p_after)
--   and (not coalesce(p_offer, false) or exists (select 1 from public.lost_send_jobs j2 where j2.client_key = fl.client_key and j2.status = 'sent' and not j2.is_test and j2.body_text ~* '% off'))
--   'offer', coalesce(body_text ~* '% off', false)
-- Same grants as before: execute for authenticated only.
-- Later the same day: the row's 'offer' is per client (any message she was sent carried "% off"), not per message:
--   'offer', exists (select 1 from public.lost_send_jobs j3 where j3.client_key = page.client_key and j3.status = 'sent' and not j3.is_test and j3.body_text ~* '% off')

-- 26 Oct 2026, evening: the report would not load for Kate. The page asks for six functions at once and lost_client_facts (a live view over every sent job,
-- the sales lines and lost_wa_status, about one second a call, twice per log page) pushed the total over the limit when the database was busy.
-- Fixed (applied live): the view's old definition is kept as lost_client_facts_live; lost_client_facts is now a plain view over the table
-- lost_client_facts_cache, filled by lost_facts_refresh() (cron lost-facts-refresh, every 10 minutes, delete and insert in one transaction so a reader never sees
-- it empty). The cache also carries cid, the respond.io contact id, so the log and the pop-ups no longer join lost_wa_status a second time.
-- Whole report now loads in about 1.4 s and a pop-up in 0.2 s. The numbers can run up to ten minutes behind (the underlying data is nightly or daily anyway).
-- To refresh by hand: select public.lost_facts_refresh();

-- 26 Oct 2026, later: came_on. A client with a booking after 31 Oct who already came in between our message and now (Sarah Adib: in on 23 Oct, AED 1,676, and
-- booked her next visit for 6 Mar 2027 at the chair) is not a booking that missed the deadline: her rate could be used on the visit she had. lost_client_facts_live
-- gains came_on (the first day she came in on or after her first message, also when she has a booking ahead); lost_client_facts_cache gains it too and
-- lost_facts_refresh() fills it; lost_send_log_get gains p_pending (only clients who have not come in yet, with p_after) and returns came per row, and lost_drill
-- returns came. Applied live. 8 of the 18 clients booked after 31 Oct had already come in; 10 had the offer and have not.
