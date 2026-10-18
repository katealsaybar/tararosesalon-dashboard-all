-- Lost Clients: keep respond.io's delivery status of our messages (Kate, 18 Oct 2026: "Delivered only", "Seen only" on the branch sheets).
-- NOT applied yet: Kate asked to see this and the edge function change before anything is deployed.
--
-- respond-status-sync already reads each number's last 50 messages every night. It now also keeps the newest 8 OUTGOING ones as
-- out_msgs = [{"t": <seconds>, "s": "read" | "delivered" | "sent" | "failed" | "other" | null}], never any text.
--   lost_wa_status.out_msgs   that list (kept as it was when a night's message read failed)
--   lost_wa_save              stores it
--   lost_sheet_outcomes       the sheet column: the status of OUR message is the outgoing one nearest the send time (within 15 minutes)
--
-- States on the sheet (first true wins): Waiting to be sent, Opted out (STOP / DND), Blocked us, Rebooked ... (3), Replied,
--   Seen only (read, no reply) / Delivered only / Sent, not delivered yet / Failed to deliver / Sent, no reply yet (status not read yet).
-- Statuses move on the nightly sync, so a message sent today shows its delivery the next morning.

alter table public.lost_wa_status add column if not exists out_msgs jsonb;

create or replace function public.lost_wa_save(p_rows jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int;
begin
  insert into lost_wa_status (phone, found, contact_id, is_blocked, last_in, last_out, err, checked_at, opted_out, opt_phrase, opt_at, opt_source, tags, out_msgs)
  select r->>'phone', coalesce((r->>'found')::boolean, false), nullif(r->>'contact_id', '')::bigint, coalesce((r->>'is_blocked')::boolean, false),
         to_timestamp(nullif(r->>'last_in', '')::double precision), to_timestamp(nullif(r->>'last_out', '')::double precision), r->>'err', now(),
         coalesce((r->>'opted_out')::boolean, false), r->>'opt_phrase', to_timestamp(nullif(r->>'opt_at', '')::double precision), r->>'opt_source',
         case when jsonb_typeof(r->'tags') = 'array' then (select array_agg(x) from jsonb_array_elements_text(r->'tags') x) end,
         case when jsonb_typeof(r->'out_msgs') = 'array' then r->'out_msgs' end
  from jsonb_array_elements(p_rows) r
  on conflict (phone) do update set found = excluded.found, contact_id = excluded.contact_id, is_blocked = excluded.is_blocked,
    last_in = excluded.last_in, last_out = excluded.last_out, err = excluded.err, checked_at = excluded.checked_at,
    opted_out = excluded.opted_out, opt_phrase = excluded.opt_phrase, opt_at = excluded.opt_at, opt_source = excluded.opt_source, tags = excluded.tags,
    out_msgs = coalesce(excluded.out_msgs, lost_wa_status.out_msgs);
  get diagnostics n = row_count;
  insert into lost_send_optout (phone, reason, added_by)
  select r->>'phone', left('respond.io: ' || coalesce(r->>'opt_source', '') || ' ' || coalesce(r->>'opt_phrase', ''), 120), 'respond-status-sync'
  from jsonb_array_elements(p_rows) r where coalesce((r->>'opted_out')::boolean, false)
  on conflict (phone) do nothing;
  return n;
end $function$;

create or replace function public.lost_sheet_outcomes(p_pass uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  with j as (
    select distinct on (f.client_key) f.client_key as k, f.phone, f.status, f.sent_at, f.replied, f.stop, f.blocked, f.booked
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
        else case ms.s when 'read' then 'Seen only' when 'delivered' then 'Delivered only' when 'failed' then 'Failed to deliver'
                       when 'sent' then 'Sent, not delivered yet' else 'Sent, no reply yet' end end as o
    from j
    left join nb on nb.k = j.k
    left join dep d on d.k = j.k
    left join public.lost_wa_status w on w.phone = j.phone
    left join lateral (
      select m->>'s' as s from jsonb_array_elements(coalesce(w.out_msgs, '[]'::jsonb)) m
      where j.sent_at is not null and abs((m->>'t')::double precision - extract(epoch from j.sent_at)) < 900
      order by abs((m->>'t')::double precision - extract(epoch from j.sent_at)) limit 1) ms on true)
  select coalesce(jsonb_object_agg(k, o || case when sent_at is not null then ' · sent ' || to_char(sent_at at time zone 'Asia/Dubai', 'FMDD Mon') else '' end), '{}'::jsonb)
  into out from r;
  return out;
end $$;

revoke all on function public.lost_sheet_outcomes(uuid) from public, anon, authenticated;
grant execute on function public.lost_sheet_outcomes(uuid) to anon, authenticated;
