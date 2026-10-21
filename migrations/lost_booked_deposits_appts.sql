-- Lost Client Blasts, Performance report: how many APPOINTMENTS are booked, next to how many clients (Kate, 21 Oct 2026).
-- NOT applied yet: Kate said to show her first. Additive on lost_booked_deposits_policy.sql: every key already there keeps its meaning.
--
-- Why: the Booked card said 43, which counts messages (a client sent two different blasts counts twice). Staff read it as clients. The
-- report now says Clients booked (each client once) and Appointments booked (each client on each date, from today on).
--   total.appts       appointments from today on for the booked clients (one client on one date = one appointment)
--   by_branch[].appts the same per branch (the branch the message came from)
--   who[].n           how many dates that client has booked from today on
-- Everything else is unchanged. Level 2 and above, with the optional message filter, as it is live.

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
  ap as (
    select public.stl_key_fold(b.client_key) as k, count(distinct b.date) as n
    from public.client_bookings b where b.date >= current_date group by 1),
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
           coalesce(ap.n, 0) as n,
           case when coalesce(d.bal, 0) > 0 then 'paid' when nb.nxt = current_date then 'today'
                when coalesce(sv.svc, '') ~* 'balayage|foil|highlight|all over colo|restyle|extension' then 'need' else 'none' end as st
    from bk join nb on nb.k = bk.k
         left join sv on sv.k = bk.k and sv.date = nb.nxt
         left join ap on ap.k = bk.k
         left join dep d on d.k = bk.k
         left join lv on lv.k = bk.k)
  select jsonb_build_object(
    'at', now(),
    'total', (select jsonb_build_object('booked', count(*), 'appts', coalesce(sum(n), 0), 'paid', count(*) filter (where st = 'paid'),
                'today', count(*) filter (where st = 'today'), 'unpaid', count(*) filter (where st in ('need', 'none')),
                'need', count(*) filter (where st = 'need'), 'none', count(*) filter (where st = 'none')) from x),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', branch, 'booked', c, 'appts', a, 'paid', p, 'today', t, 'unpaid', nd + nn, 'need', nd, 'none', nn) order by c desc, branch), '[]'::jsonb)
                  from (select branch, count(*) c, coalesce(sum(n), 0) a, count(*) filter (where st = 'paid') p, count(*) filter (where st = 'today') t,
                               count(*) filter (where st = 'need') nd, count(*) filter (where st = 'none') nn from x group by branch) q),
    'soon', (select coalesce(jsonb_agg(jsonb_build_object('k', o, 'n', c) order by o), '[]'::jsonb)
             from (select case when nxt - current_date <= 1 then 1 when nxt - current_date <= 3 then 2 when nxt - current_date <= 7 then 3
                               when nxt - current_date <= 14 then 4 else 5 end as o, count(*) c
                   from x where st in ('need', 'none') group by 1) q),
    'soon_need', (select coalesce(jsonb_agg(jsonb_build_object('k', o, 'n', c) order by o), '[]'::jsonb)
             from (select case when nxt - current_date <= 1 then 1 when nxt - current_date <= 3 then 2 when nxt - current_date <= 7 then 3
                               when nxt - current_date <= 14 then 4 else 5 end as o, count(*) c
                   from x where st = 'need' group by 1) q),
    'who', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'branch', branch, 'next', nxt, 'n', n,
                'status', case when st in ('need', 'none') then 'unpaid' else st end, 'deposit', bal, 'st', st, 'svc', svc, 'away', away)
                order by case st when 'need' then 1 when 'none' then 2 when 'paid' then 3 else 4 end, nxt, name), '[]'::jsonb) from x))
  into out;
  return out;
end $$;
