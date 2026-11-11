-- Lost Client Blasts, October: bookings after the 31 Oct end date are counted apart (Kate, 11 Nov 2026: "same for october pls, bigyan mo separate box"; "Move all to box").
-- WHY: the offer ended 31 Oct 2026. The facts are a snapshot of bookings from TODAY on, so since 1 Nov every "Booked ahead" client is after the deadline (on 11 Nov: 37 of 37,
--      earliest 11 Nov). They must not sit in Booked ahead, Booked since the message, the deposit section or the money projection. They get their own count, `late`.
-- RULE (same as November, migrations/nov_after_deadline.sql in this repo): ahead = her next booking is on or before 31 Oct. late = her next booking is after 31 Oct and she has not
--       come in since our first message (came_on null). A client with a booking after 31 Oct who already came in counts as Already came in (done), the way lost_after_deadline shows late_came.
-- WHAT IS LEFT ALONE: lost_client_facts_cache, lost_client_facts_live and lost_facts_refresh are untouched, so nothing that sends, queues or filters reads a different value. Only the VIEW
--       lost_client_facts (what the report, the drill and the warm/standard split read) is changed, plus the four report functions that read client_bookings directly.
-- Additive: lost_client_facts gains a trailing column `late`; lost_booked_since gains late in total and by_branch; lost_drill gains the metric 'late'. A replacement that finds nothing
--       aborts the whole migration. lost_after_deadline (the Exempt from 31 Oct notice) is unchanged and still correct.

create or replace function pg_temp.rep(src text, a text, b text) returns text language plpgsql as $f$
begin
  if position(a in src) = 0 then raise exception 'pattern not found: %', left(a, 80); end if;
  return replace(src, a, b);
end $f$;

create or replace view public.lost_client_facts as
 select c.client_key,
    c.sent_d,
    (c.ahead and c.nxt <= date '2026-10-31') as ahead,
    c.nxt,
    c.svc,
    c.n_appts,
    c.bal,
    (c.done or (c.ahead and c.nxt > date '2026-10-31' and c.came_on is not null)) as done,
    c.stop,
    c.resched_on,
    c.cancelled_on,
    c.needs_dep,
    case when c.ahead and c.nxt > date '2026-10-31' then null else c.st end as st,
    case when c.stop then 'stop'
         when c.ahead and c.nxt > date '2026-10-31' then case when c.came_on is not null then 'done' else 'late' end
         else c.outcome end as outcome,
    c.cid,
    c.n_msgs,
    c.came_on,
    (c.ahead and c.nxt > date '2026-10-31' and c.came_on is null) as late
   from public.lost_client_facts_cache c;

do $do$
declare d text; dl text := 'date ''2026-10-31''';
begin
  -- Booked since the message
  d := pg_get_functiondef('public.lost_booked_since(text)'::regprocedure);
  d := pg_temp.rep(d, 'where b.date >= current_date),', 'where b.date >= current_date and b.date <= ' || dl || '),');
  -- late and done come from the same view the drill opens, so a number and its list agree; a client who is late is never also done
  d := pg_temp.rep(d, E'(bk.k is null and v.k is not null and v.first_d >= s.sent_d) as done
    from s left join bk on bk.k = s.k left join vis v on v.k = s.k)', E'(bk.k is null and v.k is not null and v.first_d >= s.sent_d and not coalesce(f.late, false)) as done,
      coalesce(f.late, false) as late
    from s left join bk on bk.k = s.k left join vis v on v.k = s.k left join public.lost_client_facts f on f.client_key = s.k)');
  d := pg_temp.rep(d, '''done'', count(*) filter (where done)) from x),', '''done'', count(*) filter (where done), ''late'', count(*) filter (where late)) from x),');
  d := pg_temp.rep(d, '''ahead'', a, ''done'', d)', '''ahead'', a, ''done'', d, ''late'', l)');
  d := pg_temp.rep(d, 'count(*) filter (where done) d from x group by branch', 'count(*) filter (where done) d, count(*) filter (where late) l from x group by branch');
  execute d;

  -- the deposit section and the money projection only look at bookings up to the end date
  d := pg_get_functiondef('public.lost_booked_deposits(text)'::regprocedure);
  d := pg_temp.rep(d, 'b.date >= current_date', 'b.date >= current_date and b.date <= ' || dl);
  execute d;
  d := pg_get_functiondef('public.lost_campaign_money(text,numeric)'::regprocedure);
  d := pg_temp.rep(d, 'b.date >= current_date', 'b.date >= current_date and b.date <= ' || dl);
  execute d;

  -- the by message / branch / day tables and the money's client count: "booked" there is lost_send_flags.booked (a booking from today on), which lost_resend_pool also reads to keep
  -- booked clients out of a resend, so the VIEW lost_send_flags is not touched; the two report functions count only a booking up to the end date instead
  d := pg_get_functiondef('public.lost_send_report_get(text)'::regprocedure);
  d := pg_temp.rep(d, 'src text := format(''(select * from public.lost_send_flags where %1$L::text is null or qtype = %1$L) f'', nullif(p_type, ''''));',
    'src text := format(''(select f0.*, exists (select 1 from public.client_bookings b0 where public.stl_key_fold(b0.client_key) = f0.client_key and b0.date >= current_date and b0.date <= ' || replace(dl, '''', '''''') || ') as in_win from public.lost_send_flags f0 where %1$L::text is null or f0.qtype = %1$L) f'', nullif(p_type, ''''));');
  d := pg_temp.rep(d, 'count(*) filter (where booked),', 'count(*) filter (where booked and in_win),');
  execute d;
  d := pg_get_functiondef('public.lost_campaign_money(text,numeric)'::regprocedure);
  d := pg_temp.rep(d, 'from public.lost_send_flags f where f.booked and (nullif(p_type', 'from public.lost_send_flags f where f.booked and exists (select 1 from public.client_bookings b0 where public.stl_key_fold(b0.client_key) = f.client_key and b0.date >= current_date and b0.date <= ' || dl || ') and (nullif(p_type');
  execute d;

  -- the drill: metric late
  d := pg_get_functiondef('public.lost_drill(text,integer,text,text,text,text)'::regprocedure);
  d := pg_temp.rep(d, '''late_offer'', ''late_due'')', '''late_offer'', ''late_due'', ''late'')');
  d := pg_temp.rep(d, 'c.outcome, c.ahead, c.done,', 'c.outcome, c.ahead, c.late, c.done,');
  d := pg_temp.rep(d, 'when ''late_offer'' then', E'when ''late'' then status = ''sent'' and late\n      when ''late_offer'' then');
  execute d;
end $do$;
