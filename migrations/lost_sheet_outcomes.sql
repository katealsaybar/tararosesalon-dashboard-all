-- Lost Clients branch sheets: the "After our message" column (Kate, 18 Oct 2026).
-- lost_sheet_outcomes(pass) returns {client_key: "<what happened> · sent 16 Oct"} for every client who was sent (or is queued for) a real
-- message, newest sent message per client. Pass-gated like lost_sheet_rows; scripts/lost-sheets writes it into column N of each sheet.
--
-- Order of the states (the first that is true wins):
--   Waiting to be sent                     only queued so far
--   Opted out (STOP / DND)                 opted out since the message (lost_send_flags.stop)
--   Blocked us                             blocked in respond.io
--   Rebooked, deposit paid                 a booking from today on, and Phorest's Deposit item net of refunds (90 days) above zero
--   Rebooked for today, no deposit needed  booking is today (same-day needs no deposit)
--   Rebooked, deposit not paid yet         a booking from today on, no deposit
--   Replied                                wrote in after the message
--   No reply yet                           sent, nothing back
-- Delivered only / Seen only are not here: respond.io's message status is not stored yet (respond-status-sync would need to keep it).

create or replace function public.lost_sheet_outcomes(p_pass uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  with j as (
    select distinct on (f.client_key) f.client_key as k, f.status, f.sent_at, f.replied, f.stop, f.blocked, f.booked
    from public.lost_send_flags f where f.status in ('sent', 'queued', 'sending')
    order by f.client_key, (f.status = 'sent') desc, f.sent_at desc nulls last, f.id desc),
  nb as (
    select public.stl_key_fold(b.client_key) as k, min(b.date) as nxt from public.client_bookings b where b.date >= current_date group by 1),
  dep as (
    select public.stl_key_fold(public.stl_client_key(s.client_name)) as k, coalesce(sum(s.net), 0) as bal
    from public.sales_transaction_lines s
    where s.item in ('Deposit', 'Deposit (Refund)') and s.date >= current_date - 90 group by 1),
  r as (
    select j.k, j.sent_at, case
        when j.status <> 'sent' then 'Waiting to be sent'
        when j.stop then 'Opted out (STOP / DND)'
        when j.blocked then 'Blocked us'
        when j.booked and coalesce(d.bal, 0) > 0 then 'Rebooked, deposit paid'
        when j.booked and nb.nxt = current_date then 'Rebooked for today, no deposit needed'
        when j.booked then 'Rebooked, deposit not paid yet'
        when j.replied then 'Replied'
        else 'No reply yet' end as o
    from j left join nb on nb.k = j.k left join dep d on d.k = j.k)
  select coalesce(jsonb_object_agg(k, o || case when sent_at is not null then ' · sent ' || to_char(sent_at at time zone 'Asia/Dubai', 'FMDD Mon') else '' end), '{}'::jsonb)
  into out from r;
  return out;
end $$;

revoke all on function public.lost_sheet_outcomes(uuid) from public, anon, authenticated;
grant execute on function public.lost_sheet_outcomes(uuid) to anon, authenticated;
