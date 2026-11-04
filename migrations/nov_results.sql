-- nov_results.sql (4 Nov 2026, Kate: "build na" for the November blasts results report)
-- The figures behind the Results view on Database Blasts, November (?view=novblasts&blast=RESULTS).
-- ADDITIVE and READ ONLY: two new functions, no table is created, changed or written. Counts only: no client name and no phone number
-- ever leaves this function (err_code text has any long digit string masked). Same guard as the other November blast reads
-- (blast_plan_guard_read: Levels 3 and 5, and the campaignblasts extra page).
-- Same counting rules as docs/NOV-2026-BLASTS-RESULTS.sql in the cowork repo (and as October's lost_delivery_report / lost_booked_since / lost_campaign_money):
--   sent = respond.io accepted it (status sent), real clients only (not tests, not dry runs); delivery = best status returned (read > delivered > failed > sent,
--   sent meaning nothing more read yet); replies = lost_wa_status.last_in after the send (only readable once the WhatsApp status check ran after the send);
--   booked ahead = a booking from today on (client_bookings is a daily snapshot); came in / paid = till sales on or after the client's first send day, matched by
--   client name key like October (the send jobs carry no Phorest client id).
create or replace function public.nov_results_core() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  with j as (
    select x.id, x.blast_id, x.client_key, x.branch, x.sent_at, x.status, x.delivery, x.err_code, x.stop, x.status_checks,
           w.last_in, w.checked_at as wa_checked, public.stl_key_fold(x.client_key) as fk
    from public.nov_send_jobs x left join public.lost_wa_status w on w.phone = x.phone
    where not x.is_test and not x.dry),
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
  bk as (select public.stl_key_fold(b.client_key) as k, count(distinct b.date) as appts
         from public.client_bookings b where b.date >= (now() at time zone 'Asia/Dubai')::date group by 1),
  fs as (select distinct on (fk) fk as k, blast_id, (sent_at at time zone 'Asia/Dubai')::date as sent_d from s order by fk, sent_at),
  sl as (
    select public.stl_key_fold(public.stl_client_key(l.client_name)) as k, l.date, l.item, l.total,
           (coalesce(l.employee_name, '') !~* '^\s*business\M' and l.client_name !~* '\mstaff\M'
            and public.stl_item_kind(l.item) not in ('non_sale', 'voucher')
            and bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id)
            and l.day_spend_ok) as vis_ok
    from public.sales_transaction_lines l
    where l.date >= (select coalesce(min(sent_d), current_date) from fs) and nullif(trim(l.client_name), '') is not null),
  ln as (select fs.k, sl.item, sl.total, sl.vis_ok from fs join sl on sl.k = fs.k and sl.date >= fs.sent_d),
  cl as (select * from public.item_classes(coalesce((select array_agg(distinct item) from ln), '{}'::text[]))),
  pay as (
    select ln.k, sum(ln.total) as spent, bool_or(ln.vis_ok) as vis
    from ln join cl c on c.item = ln.item where c.category <> 'SKIP' and c.family <> 'skip' group by 1),
  y as (
    select fs.blast_id, (bk.k is not null) as ahead, coalesce(bk.appts, 0) as appts,
           (bk.k is null and pay.k is not null and pay.spent > 0 and pay.vis) as came_in,
           case when pay.spent > 0 and pay.vis then pay.spent else 0 end as spent
    from fs left join bk on bk.k = fs.k left join pay on pay.k = fs.k),
  money as (
    select coalesce(blast_id, 'ALL') as id, count(*) as clients, count(*) filter (where ahead) as ahead, coalesce(sum(appts), 0) as appts,
           count(*) filter (where came_in) as came_in, count(*) filter (where ahead or came_in) as booked_or_in,
           count(*) filter (where spent > 0) as paid_clients, round(coalesce(sum(spent), 0), 2) as paid_aed
    from y group by rollup (blast_id))
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
        select branch, count(*) as sent, count(*) filter (where delivery in ('read', 'delivered')) as reached, count(*) filter (where delivery = 'sent') as unconfirmed,
               count(*) filter (where delivery = 'failed') as failed, count(*) filter (where stop) as stop
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

create or replace function public.nov_results() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.blast_plan_guard_read();
begin
  return public.nov_results_core();
end $$;

revoke all on function public.nov_results_core() from public, anon, authenticated;
revoke all on function public.nov_results() from public, anon, authenticated;
grant execute on function public.nov_results() to authenticated;
