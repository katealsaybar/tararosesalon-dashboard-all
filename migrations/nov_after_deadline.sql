-- Database Blasts, November: bookings beyond the offer end date are counted apart (Kate, 11 Nov 2026: "wag mong isama sa count yung nag book beyond nov 30. ibang count na lang sila").
-- WHY: the offers run to 30 Nov 2026. A client whose next appointment is after 30 Nov (for example 18 Dec) booked outside the offer window, so she must not sit inside
--      "Booked ahead", "Booked since the message", "Booked or came in", cost per booking or the deposit sections. She gets her own count, `late`.
-- RULE: ahead = her next booking from today on is on or before 30 Nov. late = her next booking is after 30 Nov and she has not paid at the till since our message
--       (a client who already came in and paid counts as came in, the same way October's lost_after_deadline treats late_came). booked_since only counts bookings dated on or before 30 Nov.
-- Additive: nov_client_facts and nov_job_rows gain a trailing column `late`; nov_results_core gains `late` in money, branches and bookdays; nov_drill gains the metric 'late';
--           nov_send_log_get gains the outcome 'late'. Everything else is the live function text with exact-match replacements, and a replacement that finds nothing aborts the whole migration.
-- The date is written in one place per object (date '2026-11-30'); a later campaign copies this file and changes it.

create or replace function pg_temp.rep(src text, a text, b text) returns text language plpgsql as $f$
begin
  if position(a in src) = 0 then raise exception 'pattern not found: %', left(a, 80); end if;
  return replace(src, a, b);
end $f$;

do $do$
declare d text; dl text := 'date ''2026-11-30''';
begin
  -- 1. the facts view
  d := pg_get_viewdef('public.nov_client_facts'::regclass, true);
  d := pg_temp.rep(d, 'nb.k IS NOT NULL AS ahead,', '(nb.k IS NOT NULL AND nb.nxt <= ' || dl || ') AS ahead,');
  d := pg_temp.rep(d, 'nb.k IS NULL AND pay.spent > 0::numeric AND pay.vis AS came_in,', 'NOT (nb.k IS NOT NULL AND nb.nxt <= ' || dl || ') AND pay.spent > 0::numeric AND pay.vis AS came_in,');
  d := pg_temp.rep(d, 'AND c.first_seen_on >= f0_1.sent_d', 'AND c.first_seen_on >= f0_1.sent_d AND c.date <= ' || dl);
  d := pg_temp.rep(d, 'WHEN nb.k IS NULL THEN NULL::text', 'WHEN nb.k IS NULL OR nb.nxt > ' || dl || ' THEN NULL::text');
  d := pg_temp.rep(d, 'WHEN nb.k IS NOT NULL AND COALESCE(dep.bal, 0::numeric) <= 0::numeric', 'WHEN nb.k IS NOT NULL AND nb.nxt <= ' || dl || ' AND COALESCE(dep.bal, 0::numeric) <= 0::numeric');
  d := pg_temp.rep(d, E'END AS dep_soon\n   FROM s', E'END AS dep_soon,\n    (nb.k IS NOT NULL AND nb.nxt > ' || dl || E' AND NOT COALESCE(pay.spent > 0::numeric AND pay.vis, false)) AS late\n   FROM s');
  execute 'create or replace view public.nov_client_facts as ' || rtrim(d, E';\n ');

  -- 2. the job rows view
  d := pg_get_viewdef('public.nov_job_rows'::regclass, true);
  d := pg_temp.rep(d, E'f.dep_soon\n   FROM nov_send_jobs j', E'f.dep_soon,\n    COALESCE(f.late, false) AS late\n   FROM nov_send_jobs j');
  execute 'create or replace view public.nov_job_rows as ' || rtrim(d, E';\n ');

  -- 3. the results function: late beside ahead in money, by branch and by first send day
  d := pg_get_functiondef('public.nov_results_core()'::regprocedure);
  d := pg_temp.rep(d, 'count(*) filter (where ahead) as ahead,', 'count(*) filter (where ahead) as ahead, count(*) filter (where late) as late,');
  d := pg_temp.rep(d, '''ahead'', m.ahead,', '''ahead'', m.ahead, ''late'', m.late,');
  d := pg_temp.rep(d, 'coalesce(max(bm.ahead), 0) as ahead,', 'coalesce(max(bm.ahead), 0) as ahead, coalesce(max(bm.late), 0) as late,');
  execute d;

  -- 4. the drill: metric late, and the late flag on every row
  d := pg_get_functiondef('public.nov_drill(text,text,text,text,text,text)'::regprocedure);
  d := pg_temp.rep(d, '''since'', ''bsince'') or', '''since'', ''bsince'', ''late'') or');
  d := pg_temp.rep(d, E'when ''appts'' then status = ''sent'' and ahead\n', E'when ''appts'' then status = ''sent'' and ahead\n      when ''late'' then status = ''sent'' and late\n');
  d := pg_temp.rep(d, '''ahead'', ahead, ''next'', nxt,', '''ahead'', ahead, ''late'', late, ''next'', nxt,');
  d := pg_temp.rep(d, 'when came_in then ''done'' end) as r', 'when came_in then ''done'' when late then ''late'' end) as r');
  execute d;

  -- 5. the send log: outcome late
  d := pg_get_functiondef('public.nov_send_log_get(text,text,text,text,text,integer,integer)'::regprocedure);
  d := pg_temp.rep(d, 'when ''booked'' then r.ahead', 'when ''booked'' then r.ahead when ''late'' then r.late');
  d := pg_temp.rep(d, 'not (r.ahead or r.came_in or r.stop)', 'not (r.ahead or r.came_in or r.stop or r.late)');
  d := pg_temp.rep(d, 'when came_in then ''done'' end) order by', 'when came_in then ''done'' when late then ''late'' end) order by');
  execute d;
end $do$;
