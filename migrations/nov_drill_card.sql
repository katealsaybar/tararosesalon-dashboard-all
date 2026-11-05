-- nov_drill_card.sql (5 Nov 2026, Kate: "dapat clickable din tong numbers na to para kita sino sino yan", on the Send from the site card of a blast).
-- The numbers on the send card (Queued, Sent, Delivered or read, Failed, STOP, Sent again and its parts, Why some did not go) open the clients behind them, with the same nov_drill and
-- the same pop-up as Results. nov_drill gains the metrics the card counts in its own way, and the reason it filters by now also reads the saved error text when Meta gave no code:
--   sent_ok       sent and not failed (the card's Sent)        failed_any   failed to send, or Meta did not deliver (the card's Failed)      skipped   dropped just before it went      notgone   skipped or failed (Why some did not go)
--   again         sent again (a resend)                         again_delivered, again_failed, again_queued   the parts of Sent again
-- nov_job_rows gains resend_of (a new last column). Same guard, still read only, latest attempt per client. The clients dropped at queue time (Left out when it was queued) were
-- never saved as rows, only counted, so they cannot be listed.

create or replace view public.nov_job_rows as
select j.id, j.blast_id, j.client_key, initcap(j.client_key) as client, j.phone, j.branch, j.status, j.delivery, j.err_code, j.error, coalesce(j.stop, false) as stop,
       j.sent_at, j.requested_at, j.requested_by, coalesce(j.status_checks, 0) as status_checks, j.body_text, j.message_id,
       coalesce(j.contact_id, w.contact_id) as cid, w.last_in, coalesce(w.last_in > j.sent_at, false) as replied,
       coalesce(f.ahead, false) as ahead, f.nxt, f.svc, coalesce(f.appts, 0) as appts, coalesce(f.came_in, false) as came_in, coalesce(f.spent, 0) as spent,
       j.resend_of
from public.nov_send_jobs j
left join public.lost_wa_status w on w.phone = j.phone
left join public.nov_client_facts f on f.k = public.stl_key_fold(j.client_key)
where not j.is_test and not j.dry and j.retried_at is null;
revoke all on public.nov_job_rows from public, anon, authenticated;

create or replace function public.nov_drill(p_metric text, p_blast text default null, p_branch text default 'all', p_day text default null,
  p_reason text default null, p_bucket text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.blast_plan_guard_read(); total int; rows_ jsonb;
  per_client boolean := p_metric in ('ahead', 'appts', 'came_in', 'paid', 'since');
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
