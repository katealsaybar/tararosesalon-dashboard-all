-- Lost Clients, Performance report: the Booked card split by deposit (Kate, 18 Oct 2026).
-- NOT applied yet: Kate said to build it and not deploy. Run this, then ship lost-report.js (the page copes with the function not
-- being there yet: the section just stays out).
--
-- Of the clients who booked after our message (lost_send_flags.booked), who has paid a deposit and who has not.
-- Phorest rings a deposit up as a sales line with item 'Deposit' (and 'Deposit (Refund)', negative) in sales_transaction_lines, so
-- there is no new report or sync: a client has a deposit when her Deposit lines, net of refunds, over the last 90 days are above zero.
-- Matched on the client key (the same name key the lists use), so two clients with one name share a deposit.
-- Same-day bookings need no deposit (policy), so a booking for today without a deposit is its own group, not "not paid yet".
-- Deposit lines arrive with the nightly sales upload, so a deposit paid today shows tomorrow.
--
--   status: paid     net deposit above zero
--           today    next booking is today and no deposit
--           unpaid   anything else
--   Counted per client (not per message), grouped by the branch the message came from, like the By branch table.
--   soon = the unpaid ones by how far ahead their next booking is: 1 tomorrow, 2 in 2 to 3 days, 3 in 4 to 7, 4 in 8 to 14, 5 later.
--   who = one row per client for the Table view: name, branch, next booking date, status, deposit net.
-- Level 3 and above, like the rest of the report.

create or replace function public.lost_booked_deposits() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with bk as (
    select distinct on (f.client_key) f.client_key as k, f.branch
    from public.lost_send_flags f where f.booked order by f.client_key, f.sent_at desc),
  nb as (
    select distinct on (public.stl_key_fold(b.client_key)) public.stl_key_fold(b.client_key) as k, b.client_name as name, b.date as nxt
    from public.client_bookings b where b.date >= current_date order by public.stl_key_fold(b.client_key), b.date),
  dep as (
    select public.stl_key_fold(public.stl_client_key(s.client_name)) as k,
           coalesce(sum(s.net), 0) as bal
    from public.sales_transaction_lines s
    where s.item in ('Deposit', 'Deposit (Refund)') and s.date >= current_date - 90
    group by 1),
  x as (
    select bk.branch, nb.name, nb.nxt, coalesce(d.bal, 0) as bal,
           case when coalesce(d.bal, 0) > 0 then 'paid' when nb.nxt = current_date then 'today' else 'unpaid' end as st
    from bk join nb on nb.k = bk.k left join dep d on d.k = bk.k)
  select jsonb_build_object(
    'at', now(),
    'total', (select jsonb_build_object('booked', count(*), 'paid', count(*) filter (where st = 'paid'),
                'today', count(*) filter (where st = 'today'), 'unpaid', count(*) filter (where st = 'unpaid')) from x),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', branch, 'booked', n, 'paid', p, 'today', t, 'unpaid', u) order by n desc, branch), '[]'::jsonb)
                  from (select branch, count(*) n, count(*) filter (where st = 'paid') p, count(*) filter (where st = 'today') t,
                               count(*) filter (where st = 'unpaid') u from x group by branch) q),
    'soon', (select coalesce(jsonb_agg(jsonb_build_object('k', o, 'n', c) order by o), '[]'::jsonb)
             from (select case when nxt - current_date <= 1 then 1 when nxt - current_date <= 3 then 2 when nxt - current_date <= 7 then 3
                               when nxt - current_date <= 14 then 4 else 5 end as o, count(*) c
                   from x where st = 'unpaid' group by 1) q),
    'who', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'branch', branch, 'next', nxt, 'status', st, 'deposit', bal) order by nxt, name), '[]'::jsonb) from x))
  into out;
  return out;
end $$;

revoke all on function public.lost_booked_deposits() from public, anon;
grant execute on function public.lost_booked_deposits() to authenticated;
