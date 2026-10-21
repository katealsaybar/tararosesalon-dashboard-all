-- Lost Client Blasts, Performance report: "Not paid yet" split by the deposit policy (Kate, 21 Oct 2026).
-- NOT applied yet: Kate said to build it and not deploy. Run this before (or with) the push of lost-report.js. It is additive: every key the
-- live page reads today (total.unpaid, by_branch[].unpaid, soon, who[].status) is still there with the same meaning, so applying it first
-- changes nothing on the live page.
--
-- Why: the report called every booked client without a deposit "not paid yet", but the Booking and Deposit policy (Existing client) only asks
-- for one on a longer or higher-value service (balayage, full-head foils or highlights, a big colour change, a restyle), an appointment over
-- two hours, several guests booked at once, a return after 12 months or more for a longer service, or a recent missed or short-notice-changed
-- visit. Same day never needs one, and neither does a next visit booked before leaving the salon. Phorest shows the services and the date, not
-- the length, the guests, the missed visits or where the booking was made, so the split uses the services only.
--
--   st (new)  paid   net deposit above zero (Deposit items, net of refunds, last 90 days, as before)
--             today  next booking is today and no deposit
--             need   no deposit, and the next appointment has balayage, foil(s), highlight(s), all over colo(u)r, restyle or extension(s)
--             none   no deposit, and anything else (a short service)
--   unpaid (kept)  need + none
--   soon (kept)    the unpaid by how soon;  soon_need (new)  the same for need only
--   who[]  adds st, svc (the next day's services, cut to 90 characters) and away (days since her last visit before today, null if none)
-- Counted per client, grouped by the branch the message came from. Level 2 and above, with the optional message filter, as it is live.

create or replace function public.lost_booked_deposits(p_type text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if lost_send_level() < 2 then raise exception 'Level 3 and above'; end if;
  with bk as (
    select distinct on (f.client_key) f.client_key as k, f.branch
    from public.lost_send_flags f where f.booked and (nullif(p_type, '') is null or f.qtype = p_type) order by f.client_key, f.sent_at desc),
  nb as (
    select distinct on (public.stl_key_fold(b.client_key)) public.stl_key_fold(b.client_key) as k, b.client_name as name, b.date as nxt
    from public.client_bookings b where b.date >= current_date order by public.stl_key_fold(b.client_key), b.date),
  sv as (
    select public.stl_key_fold(b.client_key) as k, b.date, string_agg(b.services, ', ') as svc
    from public.client_bookings b where b.date >= current_date group by 1, 2),
  dep as (
    select public.stl_key_fold(public.stl_client_key(s.client_name)) as k,
           coalesce(sum(s.net), 0) as bal
    from public.sales_transaction_lines s
    where s.item in ('Deposit', 'Deposit (Refund)') and s.date >= current_date - 90
    group by 1),
  lv as (
    select public.stl_key_fold(public.stl_client_key(s.client_name)) as k, max(s.date) as last_visit
    from public.sales_transaction_lines s
    where s.item not in ('Deposit', 'Deposit (Refund)') and s.date < current_date
    group by 1),
  x as (
    select bk.branch, nb.name, nb.nxt, coalesce(d.bal, 0) as bal, left(coalesce(sv.svc, ''), 90) as svc, nb.nxt - lv.last_visit as away,
           case when coalesce(d.bal, 0) > 0 then 'paid' when nb.nxt = current_date then 'today'
                when coalesce(sv.svc, '') ~* 'balayage|foil|highlight|all over colo|restyle|extension' then 'need' else 'none' end as st
    from bk join nb on nb.k = bk.k
         left join sv on sv.k = bk.k and sv.date = nb.nxt
         left join dep d on d.k = bk.k
         left join lv on lv.k = bk.k)
  select jsonb_build_object(
    'at', now(),
    'total', (select jsonb_build_object('booked', count(*), 'paid', count(*) filter (where st = 'paid'),
                'today', count(*) filter (where st = 'today'), 'unpaid', count(*) filter (where st in ('need', 'none')),
                'need', count(*) filter (where st = 'need'), 'none', count(*) filter (where st = 'none')) from x),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', branch, 'booked', n, 'paid', p, 'today', t, 'unpaid', nd + nn, 'need', nd, 'none', nn) order by n desc, branch), '[]'::jsonb)
                  from (select branch, count(*) n, count(*) filter (where st = 'paid') p, count(*) filter (where st = 'today') t,
                               count(*) filter (where st = 'need') nd, count(*) filter (where st = 'none') nn from x group by branch) q),
    'soon', (select coalesce(jsonb_agg(jsonb_build_object('k', o, 'n', c) order by o), '[]'::jsonb)
             from (select case when nxt - current_date <= 1 then 1 when nxt - current_date <= 3 then 2 when nxt - current_date <= 7 then 3
                               when nxt - current_date <= 14 then 4 else 5 end as o, count(*) c
                   from x where st in ('need', 'none') group by 1) q),
    'soon_need', (select coalesce(jsonb_agg(jsonb_build_object('k', o, 'n', c) order by o), '[]'::jsonb)
             from (select case when nxt - current_date <= 1 then 1 when nxt - current_date <= 3 then 2 when nxt - current_date <= 7 then 3
                               when nxt - current_date <= 14 then 4 else 5 end as o, count(*) c
                   from x where st = 'need' group by 1) q),
    'who', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'branch', branch, 'next', nxt,
                'status', case when st in ('need', 'none') then 'unpaid' else st end, 'deposit', bal, 'st', st, 'svc', svc, 'away', away)
                order by case st when 'need' then 1 when 'none' then 2 when 'paid' then 3 else 4 end, nxt, name), '[]'::jsonb) from x))
  into out;
  return out;
end $$;
