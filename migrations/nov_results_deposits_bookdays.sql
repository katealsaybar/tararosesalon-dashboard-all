-- nov_results_deposits_bookdays.sql, Kate, 9 Nov 2026 ("ok go" on the October-style sections for Database Blasts, November, Results).
-- Part 2 of nov_booked_since_and_stale.sql (apply that one first). Additive, read only, nothing is sent.
--   nov_client_facts: dep_st (paid, today, need, none, only for a client with a booking from today on) and dep_soon (1 to 5, how soon the "need" ones come),
--     the October deposit policy (lost_booked_deposits_policy.sql) on the November clients: paid = net Deposit items above zero in the last 90 days;
--     today = next booking is today; need = balayage, foil, highlight, all over colour, restyle or extension; none = a short service.
--   nov_job_rows: dep_st, dep_soon.  nov_drill: metrics dep_paid, dep_today, dep_need, dep_none, dep_nodep (none or today) and dep_need_1..5 (need, by how soon).
--   nov_results_core: 'deposits' {total, by_branch, soon_need} and 'bookdays' (one row per first send day: clients, ahead, booked_since, came_in, booked_or_in).
-- nov_results_core and nov_drill are restated in full here (they supersede the versions in nov_results.sql, nov_results_parity.sql and the first file).

create or replace view public.nov_client_facts as
 WITH s AS (
         SELECT DISTINCT ON ((stl_key_fold(j.client_key))) stl_key_fold(j.client_key) AS k,
            j.id, j.blast_id, j.client_key, j.branch, j.phone, j.sent_at, j.delivery, j.stop
           FROM nov_send_jobs j
          WHERE NOT j.is_test AND NOT j.dry AND j.status = 'sent'::text AND j.retried_at IS NULL
          ORDER BY (stl_key_fold(j.client_key)), j.sent_at
        ), f0 AS (
         SELECT stl_key_fold(nov_send_jobs.client_key) AS k,
            min((nov_send_jobs.sent_at AT TIME ZONE 'Asia/Dubai'::text)::date) AS sent_d
           FROM nov_send_jobs
          WHERE NOT nov_send_jobs.is_test AND NOT nov_send_jobs.dry AND nov_send_jobs.status = 'sent'::text
          GROUP BY (stl_key_fold(nov_send_jobs.client_key))
        ), nb AS (
         SELECT stl_key_fold(b.client_key) AS k, min(b.date) AS nxt, count(DISTINCT b.date) AS appts
           FROM client_bookings b
          WHERE b.date >= (now() AT TIME ZONE 'Asia/Dubai'::text)::date
          GROUP BY (stl_key_fold(b.client_key))
        ), sv AS (
         SELECT stl_key_fold(b.client_key) AS k, b.date, string_agg(b.services, ', '::text) AS svc
           FROM client_bookings b
          WHERE b.date >= (now() AT TIME ZONE 'Asia/Dubai'::text)::date
          GROUP BY (stl_key_fold(b.client_key)), b.date
        ), cl AS (
         SELECT item_classes.item, item_classes.kind, item_classes.category, item_classes.family, item_classes.stem, item_classes.via
           FROM item_classes(COALESCE(( SELECT array_agg(DISTINCT nov_client_lines.item) AS array_agg
                   FROM nov_client_lines), '{}'::text[])) item_classes(item, kind, category, family, stem, via)
        ), pay AS (
         SELECT ln.k, sum(ln.total) AS spent, bool_or(ln.vis_ok) AS vis
           FROM nov_client_lines ln JOIN cl c ON c.item = ln.item
          WHERE c.category <> 'SKIP'::text AND c.family <> 'skip'::text
          GROUP BY ln.k
        ), bs AS (
         SELECT stl_key_fold(c.client_key) AS k, min(c.first_seen_on) AS first_seen
           FROM client_booking_first_seen c JOIN f0 ON f0.k = stl_key_fold(c.client_key)
          WHERE c.date >= f0.sent_d AND c.first_seen_on >= f0.sent_d
          GROUP BY (stl_key_fold(c.client_key))
        ), dep AS (
         SELECT stl_key_fold(stl_client_key(l.client_name)) AS k, COALESCE(sum(l.net), 0::numeric) AS bal
           FROM sales_transaction_lines l
          WHERE (l.item = ANY (ARRAY['Deposit'::text, 'Deposit (Refund)'::text])) AND l.date >= ((now() AT TIME ZONE 'Asia/Dubai'::text)::date - 90)
          GROUP BY (stl_key_fold(stl_client_key(l.client_name)))
        )
 SELECT s.k, s.id, s.blast_id, s.client_key, s.branch, s.phone, s.sent_at, s.delivery, s.stop, f0.sent_d,
    nb.k IS NOT NULL AS ahead,
    nb.nxt,
    "left"(COALESCE(sv.svc, ''::text), 90) AS svc,
    COALESCE(nb.appts, 0::bigint) AS appts,
    nb.k IS NULL AND pay.spent > 0::numeric AND pay.vis AS came_in,
        CASE WHEN pay.spent > 0::numeric AND pay.vis THEN pay.spent ELSE 0::numeric END AS spent,
    bs.k IS NOT NULL AS booked_since,
    bs.first_seen AS booked_first_seen,
        CASE WHEN nb.k IS NULL THEN NULL::text
             WHEN COALESCE(dep.bal, 0::numeric) > 0::numeric THEN 'paid'::text
             WHEN nb.nxt = (now() AT TIME ZONE 'Asia/Dubai'::text)::date THEN 'today'::text
             WHEN COALESCE(sv.svc, ''::text) ~* 'balayage|foil|highlight|all over colo|restyle|extension'::text THEN 'need'::text
             ELSE 'none'::text END AS dep_st,
        CASE WHEN nb.k IS NOT NULL AND COALESCE(dep.bal, 0::numeric) <= 0::numeric AND nb.nxt <> (now() AT TIME ZONE 'Asia/Dubai'::text)::date
                  AND COALESCE(sv.svc, ''::text) ~* 'balayage|foil|highlight|all over colo|restyle|extension'::text THEN
             CASE WHEN nb.nxt - (now() AT TIME ZONE 'Asia/Dubai'::text)::date <= 1 THEN 1 WHEN nb.nxt - (now() AT TIME ZONE 'Asia/Dubai'::text)::date <= 3 THEN 2
                  WHEN nb.nxt - (now() AT TIME ZONE 'Asia/Dubai'::text)::date <= 7 THEN 3 WHEN nb.nxt - (now() AT TIME ZONE 'Asia/Dubai'::text)::date <= 14 THEN 4 ELSE 5 END
             ELSE NULL::integer END AS dep_soon
   FROM s
     JOIN f0 ON f0.k = s.k
     LEFT JOIN nb ON nb.k = s.k
     LEFT JOIN sv ON sv.k = s.k AND sv.date = nb.nxt
     LEFT JOIN pay ON pay.k = s.k
     LEFT JOIN bs ON bs.k = s.k
     LEFT JOIN dep ON dep.k = s.k;

create or replace view public.nov_job_rows as
 SELECT j.id, j.blast_id, j.client_key, initcap(j.client_key) AS client, j.phone, j.branch, j.status, j.delivery, j.err_code, j.error,
    COALESCE(j.stop, false) AS stop, j.sent_at, j.requested_at, j.requested_by, COALESCE(j.status_checks, 0) AS status_checks,
    j.body_text, j.message_id, COALESCE(j.contact_id, w.contact_id) AS cid, w.last_in,
    COALESCE(w.last_in > j.sent_at, false) AS replied,
    COALESCE(f.ahead, false) AS ahead, f.nxt, f.svc, COALESCE(f.appts, 0::bigint) AS appts,
    COALESCE(f.came_in, false) AS came_in, COALESCE(f.spent, 0::numeric) AS spent,
    j.resend_of,
    COALESCE(f.booked_since, false) AS booked_since,
    f.dep_st, f.dep_soon
   FROM nov_send_jobs j
     LEFT JOIN lost_wa_status w ON w.phone = j.phone
     LEFT JOIN nov_client_facts f ON f.k = stl_key_fold(j.client_key)
  WHERE NOT j.is_test AND NOT j.dry AND j.retried_at IS NULL;

CREATE OR REPLACE FUNCTION public.nov_drill(p_metric text, p_blast text DEFAULT NULL::text, p_branch text DEFAULT 'all'::text, p_day text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_bucket text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text := public.blast_plan_guard_read(); total int; rows_ jsonb;
  per_client boolean := p_metric in ('ahead', 'appts', 'came_in', 'paid', 'since', 'bsince') or p_metric like 'dep\_%';
begin
  with f as (
    select r.*, regexp_replace(coalesce(r.err_code, left(r.error, 90)), '\+?\d{8,}', '[number]', 'g') as reason,
           case when r.last_in is null then '5' when r.last_in >= r.sent_at - interval '30 days' then '1' when r.last_in >= r.sent_at - interval '90 days' then '2'
                when r.last_in >= r.sent_at - interval '180 days' then '3' else '4' end as bucket,
           (coalesce(r.sent_at, r.requested_at) at time zone 'Asia/Dubai') as lt
    from public.nov_job_rows r
    where (nullif(p_blast, '') is null or r.blast_id = p_blast)
      and (coalesce(p_branch, 'all') = 'all' or r.branch = p_branch)
      and (p_day is null or case when length(p_day) = 10 then to_char(coalesce(r.sent_at, r.requested_at) at time zone 'Asia/Dubai', 'YYYY-MM-DD') = p_day
           else to_char(date_trunc('hour', r.sent_at at time zone 'Asia/Dubai') + case when extract(minute from r.sent_at at time zone 'Asia/Dubai') >= 30 then interval '30 min' else interval '0' end, 'YYYY-MM-DD HH24:MI') = p_day end)
  ), m as (
    select * from f where case p_metric
      when 'sent' then status = 'sent'
      when 'sent_ok' then status = 'sent' and coalesce(delivery, '') <> 'failed'
      when 'reached' then status = 'sent' and delivery in ('read', 'delivered')
      when 'read' then status = 'sent' and delivery = 'read'
      when 'delivered' then status = 'sent' and delivery = 'delivered'
      when 'unconfirmed' then status = 'sent' and delivery = 'sent'
      when 'failed' then status = 'sent' and delivery = 'failed'
      when 'failed_any' then status = 'failed' or delivery = 'failed'
      when 'skipped' then status = 'skipped'
      when 'notgone' then status in ('failed', 'skipped') or delivery = 'failed'
      when 'checked' then status = 'sent' and delivery in ('read', 'delivered', 'failed')
      when 'never_checked' then status = 'sent' and status_checks = 0
      when 'stop' then status = 'sent' and stop
      when 'replied' then status = 'sent' and replied
      when 'queued' then status = 'queued'
      when 'again' then resend_of is not null
      when 'again_delivered' then resend_of is not null and status = 'sent' and delivery in ('read', 'delivered')
      when 'again_failed' then resend_of is not null and (status = 'failed' or delivery = 'failed')
      when 'again_queued' then resend_of is not null and status in ('queued', 'sending')
      when 'ahead' then status = 'sent' and ahead
      when 'appts' then status = 'sent' and ahead
      when 'came_in' then status = 'sent' and came_in
      when 'paid' then status = 'sent' and spent > 0
      when 'bsince' then status = 'sent' and booked_since
      when 'since' then status = 'sent' and (ahead or booked_since or came_in)
      when 'dep_paid' then status = 'sent' and dep_st = 'paid'
      when 'dep_today' then status = 'sent' and dep_st = 'today'
      when 'dep_need' then status = 'sent' and dep_st = 'need'
      when 'dep_none' then status = 'sent' and dep_st = 'none'
      when 'dep_nodep' then status = 'sent' and dep_st in ('none', 'today')
      when 'dep_need_1' then status = 'sent' and dep_st = 'need' and dep_soon = 1
      when 'dep_need_2' then status = 'sent' and dep_st = 'need' and dep_soon = 2
      when 'dep_need_3' then status = 'sent' and dep_st = 'need' and dep_soon = 3
      when 'dep_need_4' then status = 'sent' and dep_st = 'need' and dep_soon = 4
      when 'dep_need_5' then status = 'sent' and dep_st = 'need' and dep_soon = 5
      else false end
      and (p_reason is null or (p_reason = '~none' and nullif(err_code, '') is null) or reason = p_reason)
      and (nullif(p_bucket, '') is null or bucket = p_bucket)
  )
  select (select count(*) from m),
         coalesce((select jsonb_agg(r) from (select jsonb_build_object('id', id, 'client', client, 'last4', right(phone, 4), 'phone', phone, 'branch', branch, 'blast', blast_id,
           'status', status, 'delivery', delivery, 'reason', reason, 'd', to_char(lt, 'YYYY-MM-DD'), 't', to_char(lt, 'HH24:MI'), 'stop', stop, 'replied', replied, 'cid', cid,
           'ahead', ahead, 'next', nxt, 'svc', svc, 'appts', appts, 'came', came_in, 'spent', round(spent, 2), 'booked_since', booked_since, 'dep', dep_st,
           'outcome', case when stop then 'stop' when ahead or booked_since then 'booked' when came_in then 'done' end) as r
           from m order by sent_at desc nulls last, client_key limit 1000) z), '[]'::jsonb)
  into total, rows_;
  return jsonb_build_object('total', total, 'rows', rows_, 'per_client', per_client);
end $function$;

CREATE OR REPLACE FUNCTION public.nov_results_core()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb;
begin
  with j as (
    select x.id, x.blast_id, x.client_key, x.branch, x.sent_at, x.status, x.delivery, x.err_code, x.stop, x.status_checks,
           w.last_in, w.checked_at as wa_checked, public.stl_key_fold(x.client_key) as fk
    from public.nov_send_jobs x left join public.lost_wa_status w on w.phone = x.phone
    where not x.is_test and not x.dry and x.retried_at is null),
  s as (select * from j where status = 'sent'),
  nm as (select id, coalesce(data->>'short', data->>'title') as name, sort from public.nov_blast_items where id in ('A', 'B', 'E3', 'F', 'F2')),
  aud as (select blast_id, count(*) as audience from public.nov_blast_snap group by 1),
  q as (select blast_id, count(*) as queued, count(*) filter (where status = 'queued') as still_queued from j group by 1),
  x as (
    select coalesce(blast_id, 'ALL') as id,
      count(*) as sent,
      count(*) filter (where delivery = 'read') as read,
      count(*) filter (where delivery = 'delivered') as delivered,
      count(*) filter (where delivery = 'sent') as unconfirmed,
      count(*) filter (where delivery = 'failed') as failed,
      count(*) filter (where status_checks = 0) as never_checked,
      count(*) filter (where stop) as stop,
      count(*) filter (where wa_checked > sent_at) as wa_after,
      count(*) filter (where last_in > sent_at) as replied,
      min(sent_at) as first_at, max(sent_at) as last_at
    from s group by grouping sets ((blast_id), ())),
  gsn as (select distinct on (blast_id, k) blast_id, k, grp from public.nov_blast_snap order by blast_id, k),
  money as (
    select coalesce(blast_id, 'ALL') as id, count(*) as clients, count(*) filter (where ahead) as ahead, coalesce(sum(appts) filter (where ahead), 0) as appts,
           count(*) filter (where came_in) as came_in, count(*) filter (where booked_since) as booked_since,
           count(*) filter (where ahead or booked_since or came_in) as booked_or_in,
           count(*) filter (where spent > 0) as paid_clients, round(coalesce(sum(spent), 0), 2) as paid_aed
    from public.nov_client_facts group by rollup (blast_id)),
  bm as (
    select branch, count(*) filter (where ahead) as ahead, coalesce(sum(appts) filter (where ahead), 0) as appts, count(*) filter (where came_in) as came_in,
           count(*) filter (where booked_since) as booked_since,
           count(*) filter (where ahead or booked_since or came_in) as booked_or_in, count(*) filter (where spent > 0) as paid_clients, round(coalesce(sum(spent), 0), 2) as paid_aed
    from public.nov_client_facts group by 1),
  dp as (select * from public.nov_client_facts where ahead),
  fresh as (
    select (now() at time zone 'Asia/Dubai')::date as today,
           (select max(pulled_on) from public.client_bookings) as bk_on,
           (select max(date) from public.sales_transaction_lines) as sl_to)
  select jsonb_build_object(
    'at', now(),
    'today', (select today from fresh),
    'bookings_age_days', (select today - bk_on from fresh),
    'sales_age_days', (select today - sl_to from fresh),
    'stale', (select jsonb_build_object('bookings', coalesce(today - bk_on > 1, true), 'sales', coalesce(today - sl_to > 2, true)) from fresh),
    'rates', jsonb_build_object('oct', 0.17, 'nov', 0.21),
    'first_send', (select min(sent_at) from s),
    'last_send', (select max(sent_at) from s),
    'still_queued', (select count(*) from j where status = 'queued'),
    'other_status', (select count(*) from j where status not in ('queued', 'sent')),
    'sales_to', (select max(date) from public.sales_transaction_lines),
    'bookings_pulled', (select max(pulled_on) from public.client_bookings),
    'wa_check', (select max(checked_at) from public.lost_wa_status),
    'delivery_check', (select max(checked_at) from public.nov_send_jobs),
    'stop_optouts', (select count(*) from public.lost_send_optout where reason = 'Wrote STOP after a November blast'),
    'gate', (select jsonb_build_object('enabled', enabled, 'dry_run', dry_run, 'paused', paused, 'paused_reason', paused_reason, 'fail_pct', fail_pct, 'stop_pct', stop_pct) from public.nov_send_config where id = 1),
    'deposits', jsonb_build_object(
      'total', (select jsonb_build_object('booked', count(*), 'paid', count(*) filter (where dep_st = 'paid'), 'today', count(*) filter (where dep_st = 'today'),
                  'need', count(*) filter (where dep_st = 'need'), 'none', count(*) filter (where dep_st = 'none')) from dp),
      'by_branch', coalesce((select jsonb_agg(jsonb_build_object('k', branch, 'booked', n, 'paid', p, 'today', t, 'need', nd, 'none', nn) order by n desc, branch)
                  from (select branch, count(*) n, count(*) filter (where dep_st = 'paid') p, count(*) filter (where dep_st = 'today') t,
                               count(*) filter (where dep_st = 'need') nd, count(*) filter (where dep_st = 'none') nn from dp group by branch) q), '[]'::jsonb),
      'soon_need', coalesce((select jsonb_agg(jsonb_build_object('k', dep_soon, 'n', c) order by dep_soon)
                  from (select dep_soon, count(*) c from dp where dep_st = 'need' group by 1) q), '[]'::jsonb)),
    'bookdays', coalesce((select jsonb_agg(t order by t.d) from (
        select to_char(sent_d, 'YYYY-MM-DD') as d, count(*) as clients, count(*) filter (where ahead) as ahead, count(*) filter (where booked_since) as booked_since,
               count(*) filter (where came_in) as came_in, count(*) filter (where ahead or booked_since or came_in) as booked_or_in
        from public.nov_client_facts group by 1) t), '[]'::jsonb),
    'blasts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', coalesce(nm.name, 'All blasts'), 'audience', aud.audience, 'queued', q.queued, 'still_queued', q.still_queued,
        'sent', x.sent, 'read', x.read, 'delivered', x.delivered, 'unconfirmed', x.unconfirmed, 'failed', x.failed, 'never_checked', x.never_checked,
        'stop', x.stop, 'wa_after', x.wa_after, 'replied', x.replied, 'first', x.first_at, 'last', x.last_at,
        'money', jsonb_build_object('clients', m.clients, 'ahead', m.ahead, 'appts', m.appts, 'came_in', m.came_in, 'booked_since', m.booked_since, 'booked_or_in', m.booked_or_in, 'paid_clients', m.paid_clients, 'paid_aed', m.paid_aed))
        order by (x.id = 'ALL'), nm.sort)
      from x left join nm on nm.id = x.id left join aud on aud.blast_id = x.id left join q on q.blast_id = x.id left join money m on m.id = x.id), '[]'::jsonb),
    'reasons', coalesce((select jsonb_agg(t order by t.blast_id, t.n desc) from (
        select blast_id, regexp_replace(err_code, '\+?\d{8,}', '[number]', 'g') as reason, count(*) as n
        from s where delivery = 'failed' group by 1, 2) t), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(t order by t.blast_id, t.grp) from (
        select s.blast_id, gsn.grp, count(*) as sent,
               count(*) filter (where s.delivery in ('read', 'delivered')) as reached, count(*) filter (where s.delivery = 'sent') as unconfirmed,
               count(*) filter (where s.delivery = 'failed') as failed
        from s left join gsn on gsn.blast_id = s.blast_id and gsn.k = s.client_key group by 1, 2) t), '[]'::jsonb),
    'branches', coalesce((select jsonb_agg(t order by t.branch) from (
        select s.branch, count(*) as sent, count(*) filter (where s.delivery in ('read', 'delivered')) as reached, count(*) filter (where s.delivery = 'sent') as unconfirmed,
               count(*) filter (where s.delivery = 'failed') as failed, count(*) filter (where s.stop) as stop, count(*) filter (where s.last_in > s.sent_at) as replied,
               coalesce(max(bm.ahead), 0) as ahead, coalesce(max(bm.appts), 0) as appts, coalesce(max(bm.came_in), 0) as came_in, coalesce(max(bm.booked_since), 0) as booked_since, coalesce(max(bm.booked_or_in), 0) as booked_or_in,
               coalesce(max(bm.paid_clients), 0) as paid_clients, coalesce(max(bm.paid_aed), 0) as paid_aed
        from s left join bm on bm.branch = s.branch group by s.branch) t), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(t order by t.d) from (
        select to_char(sent_at at time zone 'Asia/Dubai', 'YYYY-MM-DD') as d, count(*) as sent, count(*) filter (where delivery in ('read', 'delivered')) as reached,
               count(*) filter (where delivery = 'read') as read, count(*) filter (where delivery = 'sent') as unconfirmed, count(*) filter (where delivery = 'failed') as failed,
               count(*) filter (where stop) as stop, count(*) filter (where last_in > sent_at) as replied, min(sent_at) as first_at, max(sent_at) as last_at
        from s group by 1) t), '[]'::jsonb),
    'recency', coalesce((select jsonb_agg(t order by t.b) from (
        select case when last_in is null then '5 never' when last_in >= sent_at - interval '30 days' then '1 In the last 30 days'
                    when last_in >= sent_at - interval '90 days' then '2 31 to 90 days ago' when last_in >= sent_at - interval '180 days' then '3 91 to 180 days ago'
                    else '4 Over 180 days ago' end as b,
               count(*) as checked, count(*) filter (where delivery = 'failed') as failed
        from s where delivery in ('read', 'delivered', 'failed') group by 1) t), '[]'::jsonb),
    'pace', coalesce((select jsonb_agg(t order by t.slot) from (
        select to_char(date_trunc('hour', sent_at at time zone 'Asia/Dubai') + case when extract(minute from sent_at at time zone 'Asia/Dubai') >= 30 then interval '30 min' else interval '0' end, 'YYYY-MM-DD HH24:MI') as slot,
               count(*) as sent, count(*) filter (where delivery in ('read', 'delivered', 'failed')) as checked, count(*) filter (where delivery = 'failed') as failed
        from s group by 1) t), '[]'::jsonb)
  ) into out
  from (select 1) one;
  return out;
end $function$;
