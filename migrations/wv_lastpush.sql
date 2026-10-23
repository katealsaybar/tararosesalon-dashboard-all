-- Wellness Voucher last push (Kate, 23 Oct 2026). The final WhatsApp push before the voucher closes on 31 Oct, launched Mon 26 Oct 2026 from
-- respond.io by hand (not through the site queue). 312 clients in two lists:
--   warm   20 clients who tapped Tell me more or Reserve mine in the 15/16 Oct blast and have not bought
--   clean 292 top spenders (2026 spend AED 2,000+, net) who were never messaged, visited in the last 90 days, no lightening line in the last 12 months
--             (kept for the Blonde campaign, which is now deferred to January), confirmed reachable on WhatsApp in respond.io, not on the Lost Clients stop lists
-- Additive: one table and two functions, nothing existing is touched. Tables have RLS on and no policy; everything reads through the functions.
--
--   wv_lastpush                     one row per client on the list (a snapshot taken 23 Oct from the 21 Oct scratch tables, see wv_lastpush_seed.sql)
--   wv_lastpush_get()               Level 3 and 5: the rows, each with whether she has bought a voucher (before or since the launch) and whether she is on a stop list now
--   wv_lastpush_performance(rate)   Level 3 and above: the money. Listed, left out (already bought, stop list), TO MESSAGE, estimated cost, and from the launch day
--                                   who bought, AED collected, by list / branch / WhatsApp balance (SA = Saadiyat's own WABA, Shared = KCA, MC and AQ)
--
-- "Bought" = a Phorest voucher sale line (item 'Voucher WV-..') matched on name, the way wv_blast_performance does (wv_blast_alias holds the odd spelling).
-- A sale dated BEFORE the launch day means she bought after the list was built, so she is left out of the send. A sale from the launch day on is a result.
-- The sales scan starts 1 Aug 2026 (the first voucher sale was 22 Aug) so it can use the date index; without it each call took seconds.
-- The sales feed runs a day behind, so the count of who to message firms up on the morning of the send.

create table if not exists public.wv_lastpush (
  branch      text not null,
  client_key  text not null,
  client      text not null,
  phone       text,
  seg         text not null check (seg in ('warm', 'clean')),
  spend       numeric,
  last_visit  date,
  last_wrote  timestamptz,               -- newest message from her on a branch number (respond.io)
  listed_on   date not null default current_date,
  primary key (branch, client_key)
);
alter table public.wv_lastpush enable row level security;
revoke all on public.wv_lastpush from public, anon, authenticated;

create or replace function public.wv_lastpush_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lvl int; v_launch constant date := date '2026-10-26';
begin
  select coalesce(max(m.level), 0) into lvl from public.dashboard_me() m;
  if lvl < 3 or lvl = 4 then raise exception 'Level 3 and 5 only'; end if;
  return (
    with sales as materialized (
      select distinct on (s.item) s.item as serial, s.date, s.total::numeric as aed,
             regexp_replace(coalesce(s.payment_raw, ''), '\([^)]*\)', '', 'g') as pay, lower(btrim(s.client_name)) as ck
        from public.sales_transaction_lines s
       where s.date >= date '2026-08-01' and s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$'
       order by s.item, s.date),
    l as (select w.*, coalesce(a.sales_name, w.client_key) as mk from public.wv_lastpush w left join public.wv_blast_alias a on a.client_key = w.client_key)
    select coalesce(jsonb_agg(jsonb_build_object(
             'branch', l.branch, 'client_key', l.client_key, 'client', l.client, 'phone', l.phone, 'seg', l.seg, 'spend', round(l.spend),
             'last_visit', l.last_visit, 'last_wrote', l.last_wrote, 'listed_on', l.listed_on,
             'stop', coalesce(o.hit, e.hit, false), 'stop_why', coalesce(o.reason, e.reason),
             'bought_on', bx.d, 'bought_serial', bx.serial, 'bought_aed', bx.aed, 'bought_pay', bx.pay,
             'bought_before', coalesce(bx.n_before, 0) > 0)
           order by l.seg desc, l.branch, l.spend desc), '[]'::jsonb)
      from l
      left join lateral (
        select min(sa.date) as d, (array_agg(sa.serial order by sa.date))[1] as serial, sum(sa.aed) as aed, (array_agg(sa.pay order by sa.date))[1] as pay,
               count(*) filter (where sa.date < v_launch) as n_before
          from sales sa where sa.ck = l.mk) bx on true
      left join lateral (select true as hit, oo.reason from public.lost_send_optout oo
                          where l.phone is not null and right(regexp_replace(oo.phone, '\D', '', 'g'), 9) = right(regexp_replace(l.phone, '\D', '', 'g'), 9) limit 1) o on true
      left join lateral (select true as hit, ee.reason from public.lost_excluded ee
                          where ee.client_key = l.client_key and ee.reason in ('Do not contact', 'Wrong number') limit 1) e on true);
end $$;

create or replace function public.wv_lastpush_performance(p_rate numeric default 0.175) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lvl int; out jsonb; v_launch constant date := date '2026-10-26';
begin
  select coalesce(max(m.level), 0) into lvl from public.dashboard_me() m;
  if lvl < 3 then raise exception 'Level 3 and above'; end if;
  with sales as materialized (
    select distinct on (s.item) s.item as serial, s.date, s.total::numeric as aed,
           regexp_replace(coalesce(s.payment_raw, ''), '\([^)]*\)', '', 'g') as pay, lower(btrim(s.client_name)) as ck
      from public.sales_transaction_lines s
     where s.date >= date '2026-08-01' and s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$'
     order by s.item, s.date),
  l as (select w.*, coalesce(a.sales_name, w.client_key) as mk from public.wv_lastpush w left join public.wv_blast_alias a on a.client_key = w.client_key),
  x as (
    select l.branch, l.seg, case when l.branch = 'SAA' then 'SA' else 'Shared' end as waba,
           coalesce(bx.n_before, 0) as n_before, coalesce(bx.n_since, 0) as n_since, coalesce(bx.aed_since, 0) as aed_since, coalesce(st.hit, false) as stop
      from l
      left join lateral (
        select count(*) filter (where sa.date < v_launch) as n_before, count(*) filter (where sa.date >= v_launch) as n_since,
               sum(sa.aed) filter (where sa.date >= v_launch) as aed_since
          from sales sa where sa.ck = l.mk) bx on true
      left join lateral (
        select exists (select 1 from public.lost_send_optout oo where l.phone is not null and right(regexp_replace(oo.phone, '\D', '', 'g'), 9) = right(regexp_replace(l.phone, '\D', '', 'g'), 9))
            or exists (select 1 from public.lost_excluded ee where ee.client_key = l.client_key and ee.reason in ('Do not contact', 'Wrong number')) as hit) st on true),
  grp as (
    select 'seg' as d, seg as k, x.* from x
    union all select 'branch', branch, x.* from x
    union all select 'waba', waba, x.* from x),
  agg as (
    select d, k, count(*) as listed, count(*) filter (where n_before = 0 and not stop) as to_message,
           count(*) filter (where n_before > 0) as bought_before, count(*) filter (where n_before = 0 and stop) as stopped,
           count(*) filter (where n_since > 0) as bought, coalesce(sum(n_since), 0) as vouchers, coalesce(sum(aed_since), 0) as aed
      from grp group by d, k),
  bought as (select sa.serial, sa.aed, sa.pay from sales sa join l on sa.ck = l.mk where sa.date >= v_launch),
  other as (select sa.* from sales sa where sa.date >= v_launch and sa.ck not in (select mk from l))
  select jsonb_build_object(
    'at', now(), 'rate', p_rate, 'launch', v_launch,
    'totals', (select jsonb_build_object('listed', count(*), 'to_message', count(*) filter (where n_before = 0 and not stop),
                 'bought_before', count(*) filter (where n_before > 0), 'stopped', count(*) filter (where n_before = 0 and stop),
                 'bought', count(*) filter (where n_since > 0), 'vouchers', coalesce(sum(n_since), 0), 'aed', coalesce(sum(aed_since), 0)) from x),
    'other', (select jsonb_build_object('clients', count(distinct ck), 'vouchers', count(*), 'aed', coalesce(sum(aed), 0)) from other),
    'by_seg', (select coalesce(jsonb_agg(to_jsonb(a) - 'd' order by a.k desc), '[]'::jsonb) from agg a where d = 'seg'),
    'by_branch', (select coalesce(jsonb_agg(to_jsonb(a) - 'd' order by a.listed desc, a.k), '[]'::jsonb) from agg a where d = 'branch'),
    'by_waba', (select coalesce(jsonb_agg(to_jsonb(a) - 'd' order by a.k desc), '[]'::jsonb) from agg a where d = 'waba'),
    'by_tier', (select coalesce(jsonb_agg(jsonb_build_object('k', t, 'vouchers', v, 'aed', a) order by t), '[]'::jsonb)
                from (select left(split_part(serial, '-', 2), 1) as t, count(*) as v, sum(aed) as a from bought group by 1) q),
    'by_pay', (select coalesce(jsonb_agg(jsonb_build_object('k', t, 'vouchers', v, 'aed', a) order by a desc), '[]'::jsonb)
               from (select btrim(pay) as t, count(*) as v, sum(aed) as a from bought group by 1) q))
  into out;
  return out;
end $$;

revoke all on function public.wv_lastpush_get() from public, anon;
revoke all on function public.wv_lastpush_performance(numeric) from public, anon;
grant execute on function public.wv_lastpush_get() to authenticated;
grant execute on function public.wv_lastpush_performance(numeric) to authenticated;
