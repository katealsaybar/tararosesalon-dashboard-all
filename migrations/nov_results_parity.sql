-- nov_results_parity.sql (5 Nov 2026, Kate: "saan clickable values? lalo na tong 7 clients booked ahead", "walang projected spend vs actual spend",
-- "kung anong meron sa oct blasts na info dapat meron din dito sa nov blasts", "except warm vs standard").
-- Brings the Results view of Database Blasts, November up to the October Lost Client Blasts Performance page: every count opens the clients behind it,
-- Money from the bookings (projected vs actual spend), delivery by branch and day, by day, and a send log with filters.
-- ADDITIVE: three internal views, one internal helper, three new functions (nov_drill, nov_send_log_get, nov_campaign_money) and nov_results_core replaced by a superset
-- (every key it returned before is still there, plus 'days' and more keys on 'branches'). READ ONLY: nothing here writes a table.
-- Same guard as nov_results (blast_plan_guard_read: Levels 3 and 5, and the campaignblasts extra page). Like October's lost_drill, the clients behind a number come back
-- with name, phone and the respond.io contact id (the page copies them and opens the chat); nov_results itself stays counts only.
-- LATEST ATTEMPT PER CLIENT (the 5 Nov Resend failed work added retried_at and resend_of): every view and function below ignores a job with retried_at not null, so a
-- client counts once, by her latest message. The first send day (for sales since the message) still comes from her earliest sent job.
-- Counting rules are the ones nov_results.sql already states (booked ahead = a booking from today on; came in / paid = till sales on or after her first send day, matched by
-- client name key like October). Projected and actual spend use lost_campaign_money's method (migrations/lost_campaign_money.sql) on the November jobs.

-- the till lines of the clients we sent to, since their first send day
create or replace view public.nov_client_lines as
with f0 as (
  select public.stl_key_fold(client_key) as k, min((sent_at at time zone 'Asia/Dubai')::date) as sent_d
  from public.nov_send_jobs where not is_test and not dry and status = 'sent' group by 1),
sl as (
  select public.stl_key_fold(public.stl_client_key(l.client_name)) as k, l.date, l.item, l.total,
         (coalesce(l.employee_name, '') !~* '^\s*business\M' and l.client_name !~* '\mstaff\M'
          and public.stl_item_kind(l.item) not in ('non_sale', 'voucher')
          and bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id)
          and l.day_spend_ok) as vis_ok
  from public.sales_transaction_lines l
  where l.date >= (select coalesce(min(sent_d), current_date) from f0) and nullif(trim(l.client_name), '') is not null)
select f0.k, sl.item, sl.total, sl.vis_ok, f0.sent_d
from f0 join sl on sl.k = f0.k and sl.date >= f0.sent_d;
revoke all on public.nov_client_lines from public, anon, authenticated;

-- one row per client we sent to (her latest message), with what came of it
create or replace view public.nov_client_facts as
with s as (
  select distinct on (public.stl_key_fold(j.client_key)) public.stl_key_fold(j.client_key) as k, j.id, j.blast_id, j.client_key, j.branch, j.phone, j.sent_at, j.delivery, j.stop
  from public.nov_send_jobs j where not j.is_test and not j.dry and j.status = 'sent' and j.retried_at is null
  order by public.stl_key_fold(j.client_key), j.sent_at),
f0 as (select public.stl_key_fold(client_key) as k, min((sent_at at time zone 'Asia/Dubai')::date) as sent_d from public.nov_send_jobs where not is_test and not dry and status = 'sent' group by 1),
nb as (select public.stl_key_fold(b.client_key) as k, min(b.date) as nxt, count(distinct b.date) as appts
       from public.client_bookings b where b.date >= (now() at time zone 'Asia/Dubai')::date group by 1),
sv as (select public.stl_key_fold(b.client_key) as k, b.date, string_agg(b.services, ', ') as svc
       from public.client_bookings b where b.date >= (now() at time zone 'Asia/Dubai')::date group by 1, 2),
cl as (select * from public.item_classes(coalesce((select array_agg(distinct item) from public.nov_client_lines), '{}'::text[]))),
pay as (
  select ln.k, sum(ln.total) as spent, bool_or(ln.vis_ok) as vis
  from public.nov_client_lines ln join cl c on c.item = ln.item where c.category <> 'SKIP' and c.family <> 'skip' group by 1)
select s.k, s.id, s.blast_id, s.client_key, s.branch, s.phone, s.sent_at, s.delivery, s.stop, f0.sent_d,
       (nb.k is not null) as ahead, nb.nxt, left(coalesce(sv.svc, ''), 90) as svc, coalesce(nb.appts, 0) as appts,
       (nb.k is null and pay.spent > 0 and pay.vis) as came_in,
       case when pay.spent > 0 and pay.vis then pay.spent else 0 end as spent
from s join f0 on f0.k = s.k left join nb on nb.k = s.k left join sv on sv.k = s.k and sv.date = nb.nxt left join pay on pay.k = s.k;
revoke all on public.nov_client_facts from public, anon, authenticated;

-- one row per job (latest attempt), with the client's facts: what the drill and the log read
create or replace view public.nov_job_rows as
select j.id, j.blast_id, j.client_key, initcap(j.client_key) as client, j.phone, j.branch, j.status, j.delivery, j.err_code, j.error, coalesce(j.stop, false) as stop,
       j.sent_at, j.requested_at, j.requested_by, coalesce(j.status_checks, 0) as status_checks, j.body_text, j.message_id,
       coalesce(j.contact_id, w.contact_id) as cid, w.last_in, coalesce(w.last_in > j.sent_at, false) as replied,
       coalesce(f.ahead, false) as ahead, f.nxt, f.svc, coalesce(f.appts, 0) as appts, coalesce(f.came_in, false) as came_in, coalesce(f.spent, 0) as spent
from public.nov_send_jobs j
left join public.lost_wa_status w on w.phone = j.phone
left join public.nov_client_facts f on f.k = public.stl_key_fold(j.client_key)
where not j.is_test and not j.dry and j.retried_at is null;
revoke all on public.nov_job_rows from public, anon, authenticated;

create or replace function public.nov_results_core() returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
           count(*) filter (where came_in) as came_in, count(*) filter (where ahead or came_in) as booked_or_in,
           count(*) filter (where spent > 0) as paid_clients, round(coalesce(sum(spent), 0), 2) as paid_aed
    from public.nov_client_facts group by rollup (blast_id)),
  bm as (
    select branch, count(*) filter (where ahead) as ahead, coalesce(sum(appts) filter (where ahead), 0) as appts, count(*) filter (where came_in) as came_in,
           count(*) filter (where ahead or came_in) as booked_or_in, count(*) filter (where spent > 0) as paid_clients, round(coalesce(sum(spent), 0), 2) as paid_aed
    from public.nov_client_facts group by 1)
  select jsonb_build_object(
    'at', now(),
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
    'blasts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', coalesce(nm.name, 'All blasts'), 'audience', aud.audience, 'queued', q.queued, 'still_queued', q.still_queued,
        'sent', x.sent, 'read', x.read, 'delivered', x.delivered, 'unconfirmed', x.unconfirmed, 'failed', x.failed, 'never_checked', x.never_checked,
        'stop', x.stop, 'wa_after', x.wa_after, 'replied', x.replied, 'first', x.first_at, 'last', x.last_at,
        'money', jsonb_build_object('clients', m.clients, 'ahead', m.ahead, 'appts', m.appts, 'came_in', m.came_in, 'booked_or_in', m.booked_or_in, 'paid_clients', m.paid_clients, 'paid_aed', m.paid_aed))
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
               coalesce(max(bm.ahead), 0) as ahead, coalesce(max(bm.appts), 0) as appts, coalesce(max(bm.came_in), 0) as came_in, coalesce(max(bm.booked_or_in), 0) as booked_or_in,
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
end $$;
revoke all on function public.nov_results_core() from public, anon, authenticated;

-- The clients behind a number on Results. p_metric is the figure: message numbers (sent, reached = delivered or read, read, delivered = delivered only, unconfirmed,
-- failed, checked, never_checked, stop, replied, queued) list one row per message; client numbers (ahead = booked ahead, appts, came_in, paid, since = booked or came in)
-- list one row per client. p_blast, p_branch and p_day narrow it the way the table row does (p_day is a Dubai day YYYY-MM-DD or a half-hour slot YYYY-MM-DD HH24:MI);
-- p_reason narrows failed to one Meta reason ('~none' = no reason saved yet), p_bucket narrows checked and failed to how recently she wrote to us (1 to 5, the Failed sends table).
create or replace function public.nov_drill(p_metric text, p_blast text default null, p_branch text default 'all', p_day text default null,
  p_reason text default null, p_bucket text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.blast_plan_guard_read(); total int; rows_ jsonb;
  per_client boolean := p_metric in ('ahead', 'appts', 'came_in', 'paid', 'since');
begin
  with f as (
    select r.*, regexp_replace(r.err_code, '\+?\d{8,}', '[number]', 'g') as reason,
           case when r.last_in is null then '5' when r.last_in >= r.sent_at - interval '30 days' then '1' when r.last_in >= r.sent_at - interval '90 days' then '2'
                when r.last_in >= r.sent_at - interval '180 days' then '3' else '4' end as bucket,
           (r.sent_at at time zone 'Asia/Dubai') as lt
    from public.nov_job_rows r
    where (nullif(p_blast, '') is null or r.blast_id = p_blast)
      and (coalesce(p_branch, 'all') = 'all' or r.branch = p_branch)
      and (p_day is null or case when length(p_day) = 10 then to_char(coalesce(r.sent_at, r.requested_at) at time zone 'Asia/Dubai', 'YYYY-MM-DD') = p_day
           else to_char(date_trunc('hour', r.sent_at at time zone 'Asia/Dubai') + case when extract(minute from r.sent_at at time zone 'Asia/Dubai') >= 30 then interval '30 min' else interval '0' end, 'YYYY-MM-DD HH24:MI') = p_day end)
  ), m as (
    select * from f where case p_metric
      when 'sent' then status = 'sent'
      when 'reached' then status = 'sent' and delivery in ('read', 'delivered')
      when 'read' then status = 'sent' and delivery = 'read'
      when 'delivered' then status = 'sent' and delivery = 'delivered'
      when 'unconfirmed' then status = 'sent' and delivery = 'sent'
      when 'failed' then status = 'sent' and delivery = 'failed'
      when 'checked' then status = 'sent' and delivery in ('read', 'delivered', 'failed')
      when 'never_checked' then status = 'sent' and status_checks = 0
      when 'stop' then status = 'sent' and stop
      when 'replied' then status = 'sent' and replied
      when 'queued' then status = 'queued'
      when 'ahead' then status = 'sent' and ahead
      when 'appts' then status = 'sent' and ahead
      when 'came_in' then status = 'sent' and came_in
      when 'paid' then status = 'sent' and spent > 0
      when 'since' then status = 'sent' and (ahead or came_in)
      else false end
      and (p_reason is null or (p_reason = '~none' and nullif(err_code, '') is null) or reason = p_reason)
      and (nullif(p_bucket, '') is null or bucket = p_bucket)
  )
  select (select count(*) from m),
         coalesce((select jsonb_agg(r) from (select jsonb_build_object('id', id, 'client', client, 'last4', right(phone, 4), 'phone', phone, 'branch', branch, 'blast', blast_id,
           'status', status, 'delivery', delivery, 'reason', reason, 'd', to_char(lt, 'YYYY-MM-DD'), 't', to_char(lt, 'HH24:MI'), 'stop', stop, 'replied', replied, 'cid', cid,
           'ahead', ahead, 'next', nxt, 'svc', svc, 'appts', appts, 'came', came_in, 'spent', round(spent, 2),
           'outcome', case when stop then 'stop' when ahead then 'booked' when came_in then 'done' end) as r
           from m order by sent_at desc nulls last, client_key limit 1000) z), '[]'::jsonb)
  into total, rows_;
  return jsonb_build_object('total', total, 'rows', rows_, 'per_client', per_client);
end $$;
revoke all on function public.nov_drill(text, text, text, text, text, text) from public, anon;
grant execute on function public.nov_drill(text, text, text, text, text, text) to authenticated;

-- The send log: every real November message (latest attempt per client), newest first, with the text. Filters: blast, branch, status (all, reached, read, delivered,
-- unconfirmed, failed, queued), outcome (all, booked, done, stop, replied, none), and a search on name or the last 4 digits. Pages of up to 500 rows.
create or replace function public.nov_send_log_get(p_blast text default null, p_branch text default 'all', p_status text default 'all', p_outcome text default 'all',
  p_q text default '', p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.blast_plan_guard_read(); total int; rows_ jsonb; lim int := least(greatest(coalesce(p_limit, 50), 1), 500); q text := lower(btrim(coalesce(p_q, '')));
begin
  with g as (
    select r.*, regexp_replace(r.err_code, '\+?\d{8,}', '[number]', 'g') as reason, (coalesce(r.sent_at, r.requested_at) at time zone 'Asia/Dubai') as lt
    from public.nov_job_rows r
    where (nullif(p_blast, '') is null or r.blast_id = p_blast)
      and (coalesce(p_branch, 'all') = 'all' or r.branch = p_branch)
      and case coalesce(p_status, 'all') when 'all' then true when 'queued' then r.status = 'queued'
            when 'reached' then r.status = 'sent' and r.delivery in ('read', 'delivered') when 'read' then r.status = 'sent' and r.delivery = 'read'
            when 'delivered' then r.status = 'sent' and r.delivery = 'delivered' when 'unconfirmed' then r.status = 'sent' and r.delivery = 'sent'
            when 'failed' then r.status = 'sent' and r.delivery = 'failed' else true end
      and case coalesce(p_outcome, 'all') when 'all' then true when 'booked' then r.ahead when 'done' then r.came_in when 'stop' then r.stop when 'replied' then r.replied
            when 'none' then not (r.ahead or r.came_in or r.stop) else true end
      and (q = '' or r.client_key like '%' || q || '%' or right(r.phone, 4) = q)
  ), page as (select * from g order by sent_at desc nulls last, id desc offset greatest(coalesce(p_offset, 0), 0) limit lim)
  select (select count(*) from g),
         coalesce((select jsonb_agg(jsonb_build_object('id', id, 'client', client, 'last4', right(phone, 4), 'phone', phone, 'branch', branch, 'blast', blast_id, 'status', status,
           'delivery', delivery, 'reason', reason, 'text', body_text, 'message_id', message_id, 'd', to_char(lt, 'YYYY-MM-DD'), 't', to_char(lt, 'HH24:MI:SS'), 'by', requested_by,
           'stop', stop, 'replied', replied, 'cid', cid, 'ahead', ahead, 'next', nxt, 'svc', svc, 'came', came_in,
           'outcome', case when stop then 'stop' when ahead then 'booked' when came_in then 'done' end) order by sent_at desc nulls last, id desc) from page), '[]'::jsonb)
  into total, rows_;
  return jsonb_build_object('total', total, 'rows', rows_);
end $$;
revoke all on function public.nov_send_log_get(text, text, text, text, text, int, int) from public, anon;
grant execute on function public.nov_send_log_get(text, text, text, text, text, int, int) to authenticated;

-- Money from the bookings, the November way (lost_campaign_money's method on the November jobs). Counts clients, never names.
--   sent / reached  messages accepted by respond.io (latest attempt) and the ones Meta delivered or the client read; the page multiplies by the AED rate (0.17 October, 0.21 assumed).
--   projected       the clients with a booking from today on (booked ahead): each service on those bookings priced at the MEDIAN of what that exact service charged
--                   (sales_transaction_lines.total, VAT included, above zero) in the last 120 days, at least 3 sales; a service with no price yet counts 0 and is counted in unpriced.
--   actual          what the clients we sent to have paid since their first send day (the same lines and the same visit rule as Paid at the till on Results, so the two agree),
--                   split by the family each item belongs to in Client Mix (item_classes), retail told apart the way lost_campaign_money does.
-- One row for all, one per blast, one per branch. A booking or a visit may have nothing to do with our message.
create or replace function public.nov_campaign_money() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.blast_plan_guard_read(); out jsonb;
begin
  with sf as (select * from public.nov_client_facts),
  pr as (
    select s.item, percentile_cont(0.5) within group (order by s.total) as med
    from public.sales_transaction_lines s
    where s.date >= current_date - 120 and s.total > 0 and s.item !~* '^\s*(deposit|outstanding balance payment)'
    group by s.item having count(*) >= 3),
  pl as (
    select sf.k, sf.blast_id, sf.branch, b.date, trim(sv) as svc
    from sf join public.client_bookings b on public.stl_key_fold(b.client_key) = sf.k and b.date >= (now() at time zone 'Asia/Dubai')::date
    cross join lateral unnest(string_to_array(b.services, ', ')) as sv
    where sf.ahead and nullif(trim(sv), '') is not null),
  pp as (select pl.*, pr.med from pl left join pr on pr.item = pl.svc),
  pb as (
    select blast_id, branch, count(distinct (k, date)) as appts, coalesce(sum(med), 0) as proj, count(*) as svcs, count(*) filter (where med is null) as unpriced
    from pp group by 1, 2),
  cl as (select * from public.item_classes(coalesce((select array_agg(distinct item) from public.nov_client_lines), '{}'::text[]))),
  bt as (select public.stl_name_key(product) as k, bool_or(brand ~* '(matis|image skin|pca skin|xitronix|nouveau|iolite|kinetics|alessandro|madi international|^luk\M|luke''s food)') as beauty
         from public.stock_levels group by 1),
  ac as (
    select sf.blast_id, sf.branch, ln.total,
           case c.family when 'colour' then 'hair_services' when 'cut' then 'hair_services' when 'extensions' then 'hair_services'
                         when 'treat' then 'hair_treat' when 'beauty' then 'beauty_services' when 'nails' then 'beauty_services'
                         when 'retail' then case when bt.k is not null then (case when bt.beauty then 'retail_beauty' else 'retail_hair' end)
                                                 when ln.item ~* '(\mopi\M|\mlash|\mnail|cuticle|facial|sheet mask|\mpeel\M|nutrient toner|\mspf|ormedic|\mskin\M|\meyes\M|papaya mask)' then 'retail_beauty'
                                                 else 'retail_hair' end
                         else 'other' end as b
    from public.nov_client_lines ln join sf on sf.k = ln.k and sf.spent > 0 join cl c on c.item = ln.item left join bt on bt.k = public.stl_name_key(ln.item)
    where c.category <> 'SKIP' and c.family <> 'skip'),
  ax as (
    select blast_id, branch,
           coalesce(sum(total) filter (where b = 'hair_services'), 0) as hair_services, coalesce(sum(total) filter (where b = 'hair_treat'), 0) as hair_treat,
           coalesce(sum(total) filter (where b = 'beauty_services'), 0) as beauty_services, coalesce(sum(total) filter (where b = 'retail_hair'), 0) as retail_hair,
           coalesce(sum(total) filter (where b = 'retail_beauty'), 0) as retail_beauty, coalesce(sum(total) filter (where b = 'other'), 0) as other
    from ac group by 1, 2),
  cells as (
    select sf.blast_id, sf.branch, count(*) as sent, count(*) filter (where sf.delivery in ('read', 'delivered')) as reached, count(*) filter (where sf.ahead) as ahead,
           count(*) filter (where sf.spent > 0) as visited, coalesce(sum(sf.spent), 0) as actual
    from sf group by 1, 2),
  c2 as (
    select cells.*, coalesce(pb.appts, 0) as appts, coalesce(pb.proj, 0) as proj, coalesce(pb.svcs, 0) as svcs, coalesce(pb.unpriced, 0) as unpriced,
           coalesce(ax.hair_services, 0) as hair_services, coalesce(ax.hair_treat, 0) as hair_treat, coalesce(ax.beauty_services, 0) as beauty_services,
           coalesce(ax.retail_hair, 0) as retail_hair, coalesce(ax.retail_beauty, 0) as retail_beauty, coalesce(ax.other, 0) as other
    from cells left join pb on pb.blast_id = cells.blast_id and pb.branch = cells.branch left join ax on ax.blast_id = cells.blast_id and ax.branch = cells.branch),
  r as (
    select blast_id, branch, grouping(blast_id) as gb, grouping(branch) as gr,
           sum(sent) as sent, sum(reached) as reached, sum(ahead) as ahead, sum(appts) as appts, round(sum(proj)::numeric, 2) as proj, sum(svcs) as svcs, sum(unpriced) as unpriced,
           sum(visited) as visited, round(sum(actual)::numeric, 2) as actual, round(sum(hair_services)::numeric, 2) as hair_services, round(sum(hair_treat)::numeric, 2) as hair_treat,
           round(sum(beauty_services)::numeric, 2) as beauty_services, round(sum(retail_hair)::numeric, 2) as retail_hair, round(sum(retail_beauty)::numeric, 2) as retail_beauty, round(sum(other)::numeric, 2) as other
    from c2 group by grouping sets ((blast_id), (branch), ())),
  js as (select to_jsonb(r) - 'gb' - 'gr' - 'blast_id' - 'branch' as j, r.gb, r.gr, r.blast_id, r.branch from r)
  select jsonb_build_object('at', now(),
    'all', (select j from js where gb = 1 and gr = 1),
    'by_blast', coalesce((select jsonb_agg(j || jsonb_build_object('k', blast_id) order by blast_id) from js where gb = 0 and gr = 1), '[]'::jsonb),
    'by_branch', coalesce((select jsonb_agg(j || jsonb_build_object('k', branch) order by branch) from js where gb = 1 and gr = 0), '[]'::jsonb))
  into out;
  return out;
end $$;
revoke all on function public.nov_campaign_money() from public, anon;
grant execute on function public.nov_campaign_money() to authenticated;
