-- Lost Clients, Performance report: "Booked since the message", a count that does not drop once she has been in (Kate, 26 Oct 2026).
-- NOT applied yet: Kate said to build it and not deploy. Additive only: one new function, nothing existing is touched. Run this, then ship lost-report.js
-- (the page copes with the function not being there yet: the new tiles just stay out).
--
-- Why: the Booked tile (lost_send_flags.booked, lost_booked_deposits) counts clients with a booking from today on. client_bookings only ever holds
-- the latest Staff Appointments pull, so the moment a booked client comes in and her date passes she leaves the count, and the number slides down all
-- week while the blast is working. On 26 Oct 34 were booked, and 29 more had already been in since our message (Kate saw 39 clients / 42 appointments the week before).
--
-- A messaged client counts as "booked since the message" when EITHER
--   ahead   she has a booking from today on (client_bookings), OR
--   done    she has a sales line on or after the day our first message to her went, and no booking ahead (so each client is counted once).
-- A sales line is any line of 0 or more that is not a Deposit: a package redemption rings up at AED 0 and is a real visit, a refund line is not.
-- Sales lines arrive with the nightly upload, so someone who came in today shows as ahead until tomorrow, and nobody falls through the gap.
-- "Came in" includes a walk-in who never booked ahead: a lost client who comes in after a message is counted as the message working. The tile says so.
--
-- Counted per client, from her first sent message (so a client messaged twice is one client). p_type cuts it to one message type like the other report functions.
-- Level guard copied from lost_booked_deposits, so it shows to whoever sees the Bookings and deposits section.

create or replace function public.lost_booked_since(p_type text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if lost_send_level() < 2 then raise exception 'Level 3 and above'; end if;
  with s as (
    select distinct on (j.client_key) j.client_key as k, j.branch, (j.sent_at at time zone 'Asia/Dubai')::date as sent_d
    from public.lost_send_jobs j
    where j.status = 'sent' and not j.is_test and (nullif(p_type, '') is null or j.qtype = p_type)
    order by j.client_key, j.sent_at),
  bk as (select distinct public.stl_key_fold(b.client_key) as k from public.client_bookings b where b.date >= current_date),
  vis as (
    select public.stl_key_fold(public.stl_client_key(l.client_name)) as k, min(l.date) as first_d
    from public.sales_transaction_lines l
    where l.date >= (select min(sent_d) from s) and l.net >= 0 and l.item not in ('Deposit', 'Deposit (Refund)')
    group by 1),
  x as (
    select s.branch, (bk.k is not null) as ahead, (bk.k is null and v.k is not null and v.first_d >= s.sent_d) as done
    from s left join bk on bk.k = s.k left join vis v on v.k = s.k)
  select jsonb_build_object(
    'at', now(),
    'first_send', (select min(sent_d) from s),
    'total', (select jsonb_build_object('sent', count(*), 'since', count(*) filter (where ahead or done),
                'ahead', count(*) filter (where ahead), 'done', count(*) filter (where done)) from x),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', branch, 'sent', n, 'since', a + d, 'ahead', a, 'done', d) order by a + d desc, branch), '[]'::jsonb)
                  from (select branch, count(*) n, count(*) filter (where ahead) a, count(*) filter (where done) d from x group by branch) q))
  into out;
  return out;
end $$;

revoke all on function public.lost_booked_since(text) from public, anon;
grant execute on function public.lost_booked_since(text) to authenticated;
