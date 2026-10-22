-- 22 Oct 2026 (Kate): Client's Last Visit counts from 1 Jan 2021 and leaves out staff.
--
-- "All time should mean hanggang 2020": the page said "Visits since 1 Jan 2025" because the five
-- functions below carried date '2025-01-01' as a literal. Sales Transaction lines start 23 May 2021
-- (Saadiyat), 26 May 2021 (Khalifa City A), 1 Dec 2022 (Motor City) and 29 Sep 2023 (Al Quoz), so
-- the earliest anyone can count from is 2021. The floor is now a parameter, p_since, that defaults
-- to 1 Jan 2025 so nothing else changes by itself; lost-clients.js (Client's Last Visit) passes
-- 2021-01-01. Lost Client Blasts is NOT touched: it reads lost_lists / lost_lists_base (its own
-- config, since = 2025-01-01, campaign finished 19 Oct), and nothing in the database calls these
-- functions. lost_clients_visits_bulk (the blasts file's "Visits since Jan 2025") is left alone.
-- Top Clients and Client Mix still call lost_client_detail with two arguments, so they keep 2025.
--
-- Staff: Phorest names staff who get services done "<First> Staff" ("Robyn Staff", "MOLLY STAFF",
-- "Mevil Staff Model", "Jhen Staff Acct."). Any client name with the WORD staff in it is left out
-- (Longstaff is not). 229 such names; on All time 3+ that is 109 of 5,587 rows, AED 73,197. Staff who
-- use their real name (the owner, some stylists) are not caught and stay in the list on purpose.
-- The test is written as case-when so the slow regex only runs on names that contain "staff"
-- (the plain regex over 416k lines cost seconds).
--
-- Run last_visit_2021_fast_base.sql after this one: it redefines lost_clients and lost_clients_summary with the
-- precomputed fast path (same signatures, same results). lost_client_detail and lost_clients_detail_bulk stay as here.
--
-- Undo: re-run these definitions with date '2025-01-01' in place of p_since and without the staff
-- line, or simply keep calling with the default (the page is the only caller that passes 2021).

drop function if exists public.lost_clients(text, integer, integer, integer);
drop function if exists public.lost_clients_summary(integer[], integer);
drop function if exists public.lost_client_detail(text, text);
drop function if exists public.lost_clients_detail_bulk(text, text[]);

create or replace function public.lost_clients(p_branch text, p_min_visits integer default 3, p_max_visits integer default null, p_days integer default 90, p_since date default date '2025-01-01')
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
 set statement_timeout to '60s'
 set enable_nestloop to 'off'
as $f$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with b0 as materialized (
    select s.client_name as cn, s.date, s.net, s.employee_name, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= p_since and s.client_name is not null
      and case when position('staff' in lower(s.client_name)) > 0 then s.client_name !~* '\mstaff\M' else true end
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b0) d
  ), b as materialized (
    select b0.cn, b0.date, b0.net, b0.employee_name
    from b0 join kinds using (raw_item)
    where kinds.kind not in ('non_sale', 'voucher')
  ), nm0 as materialized (
    select cn, name, public.stl_key_fold(name) as k
    from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from b) q) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), kk as materialized (
    select k, row_number() over (order by k)::int as kid, (array_agg(name order by length(name), name))[1] as name from nm0 group by k
  ), nm as materialized (
    select nm0.cn, kk.kid from nm0 join kk using (k)
  ), l as materialized (
    select nm.kid, b.date, b.net, b.employee_name from b join nm using (cn)
  ), c as materialized (
    select kid, count(distinct date)::int as visits,
           min(date) as first_visit, max(date) as last_visit, round(sum(coalesce(net, 0)), 2) as spend
    from l group by kid
  ), cf as materialized (
    select c.*, kk.k, kk.name as client_name from c join kk using (kid)
    where c.visits >= p_min_visits and (p_max_visits is null or c.visits <= p_max_visits)
      and c.last_visit < current_date - p_days
  ), st as materialized (
    select x.kid, x.employee_name, x.rn from (
      select l.kid, l.employee_name,
             row_number() over (partition by l.kid order by count(*) desc, max(l.date) desc) as rn
      from l where coalesce(l.employee_name, '') <> ''
      group by l.kid, l.employee_name
    ) x where x.rn = 1
  ), elsewhere as materialized (
    select public.stl_key_fold(s.client_name) as k,
           string_agg(distinct s.branch, ', ' order by s.branch) as now_at, max(s.date) as now_last
    from sales_transaction_lines s
    where p_branch is not null and s.branch <> p_branch and s.branch in ('SAA', 'KCA', 'MC', 'AQ')
      and s.date >= current_date - p_days
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
      and public.stl_item_kind(s.item) not in ('non_sale', 'voucher')
    group by 1
  ), bk as materialized (
    select distinct on (public.stl_key_fold(b2.client_key)) public.stl_key_fold(b2.client_key) as k, b2.date as booked_on, b2.branch as booked_at,
           b2.staff as booked_with, b2.services as booked_for
    from client_bookings b2
    where b2.date >= current_date
    order by public.stl_key_fold(b2.client_key), b2.date, (b2.branch = p_branch) desc
  ), cc as materialized (
    select distinct on (public.stl_key_fold(c2.client_key)) public.stl_key_fold(c2.client_key) as k, c2.mobile, c2.landline, c2.match,
           c2.email, c2.email_status, c2.email_match
    from client_contacts c2
    where p_branch is null or c2.branch = p_branch
    order by public.stl_key_fold(c2.client_key), c2.updated_at desc
  ), oo as materialized (
    select * from public.lost_optout_map()
  ), fv as materialized (select * from public.lost_first_visits()), r as (
    select cf.client_name, cf.visits, cf.first_visit, cf.last_visit,
           (current_date - cf.last_visit) as days_since, cf.spend,
           st.employee_name as stylist, cc.mobile, cc.landline, cc.match,
           cc.email, cc.email_status, cc.email_match, least(fv.first_ever, cf.first_visit) as first_ever,
           oo.optout, oo.optout_note, oo.optout_at,
           e.now_at, e.now_last,
           bk.booked_on, bk.booked_at, bk.booked_with, bk.booked_for
    from cf
    left join st on st.kid = cf.kid
    left join cc on cc.k = cf.k
    left join fv on fv.k = cf.k
    left join oo on oo.k = cf.k and (oo.hard or oo.optout_at is null or oo.optout_at >= cf.last_visit)
    left join elsewhere e on e.k = cf.k
    left join bk on bk.k = cf.k
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.spend desc), '[]'::jsonb) into out from r;
  return out;
end;
$f$;

create or replace function public.lost_clients_summary(p_days integer[] default array[30, 60, 90, 180], p_to integer default null, p_since date default date '2025-01-01')
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
 set statement_timeout to '60s'
as $f$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with b0 as materialized (
    select s.client_name as cn, s.branch, s.date, s.net, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= p_since and s.client_name is not null
      and case when position('staff' in lower(s.client_name)) > 0 then s.client_name !~* '\mstaff\M' else true end
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b0) d
  ), b as materialized (
    select b0.cn, b0.branch, b0.date, b0.net
    from b0 join kinds using (raw_item)
    where kinds.kind not in ('non_sale', 'voucher')
  ), nm0 as materialized (
    select cn, public.stl_key_fold(name) as k
    from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from b) q) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), kk as materialized (
    select k, row_number() over (order by k)::int as kid from (select distinct k from nm0) z
  ), nm as materialized (
    select nm0.cn, kk.kid from nm0 join kk using (k)
  ), c as (
    select b.branch, nm.kid, count(distinct b.date)::int visits, max(b.date) last_visit, sum(coalesce(b.net, 0)) spend
    from b join nm using (cn) group by b.branch, nm.kid
  ), rk as (
    select c.*, row_number() over (partition by kid order by last_visit desc) rn from c
  ), top2 as (
    select kid, max(last_visit) filter (where rn = 1) m1, max(branch) filter (where rn = 1) b1,
           max(last_visit) filter (where rn = 2) m2
    from rk group by kid
  ), bk as (
    select distinct kk.kid from client_bookings cb join kk on kk.k = public.stl_key_fold(cb.client_key) where cb.date >= current_date
  ), cx as (
    select c.*, case when c.branch = t.b1 then t.m2 else t.m1 end last_elsewhere,
           (bk.kid is not null) as booked
    from c join top2 t using (kid) left join bk using (kid)
  ), d as (select unnest(p_days) days), g0 as (
    select cx.branch, d.days,
      case when cx.visits >= 3 then 'regular' when cx.visits = 2 then 'twice' else 'once' end seg,
      (cx.last_visit < current_date - d.days
        and (p_to is null or cx.last_visit >= current_date - p_to)) as gone,
      coalesce(cx.last_elsewhere >= current_date - d.days, false) as moved,
      cx.booked, cx.spend
    from cx cross join d
  ), ca as (
    select nm.kid, count(distinct b.date)::int visits, max(b.date) last_visit, sum(coalesce(b.net, 0)) spend
    from b join nm using (cn) group by nm.kid
  ), ga as (
    select 'ALL'::text as branch, d.days,
      case when ca.visits >= 3 then 'regular' when ca.visits = 2 then 'twice' else 'once' end seg,
      (ca.last_visit < current_date - d.days
        and (p_to is null or ca.last_visit >= current_date - p_to)) as gone,
      false as moved,
      (bk.kid is not null) as booked, ca.spend
    from ca cross join d left join bk using (kid)
  ), g as (
    select * from g0 union all select * from ga
  )
  select jsonb_agg(jsonb_build_object('branch', branch, 'days', days, 'seg', seg,
           'lost', lost, 'lost_spend', lost_spend, 'moved', moved, 'booked', booked, 'active', active)
           order by branch, days, seg)
  into out
  from (
    select branch, days, seg,
      count(*) filter (where gone and not moved and not booked)::int lost,
      round(coalesce(sum(spend) filter (where gone and not moved and not booked), 0))::bigint lost_spend,
      count(*) filter (where gone and moved)::int moved,
      count(*) filter (where gone and not moved and booked)::int booked,
      count(*) filter (where not gone or (not moved and booked))::int active
    from g group by branch, days, seg
  ) x;
  return coalesce(out, '[]'::jsonb);
end;
$f$;

create or replace function public.lost_client_detail(p_branch text, p_client text, p_since date default date '2025-01-01')
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
 set statement_timeout to '15s'
as $f$
declare out jsonb; k text := public.stl_client_key(p_client); names text[] := public.stl_names_for_key(public.stl_client_key(p_client)) || public.stl_names_for_key(public.stl_client_key(p_client) || ' ' || public.stl_client_key(p_client));
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with l as (
    select s.date, s.branch, s.item, s.net, s.employee_name, public.stl_item_kind(s.item) kind,
           trim(regexp_replace(lower(coalesce(s.item, '')), '[^a-z0-9]+', ' ', 'g')) as ikey
    from sales_transaction_lines s
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA','KCA','MC','AQ')))
      and s.date >= p_since
      and s.client_name = any(names)
  ), svc as (
    select (array_agg(item order by date desc))[1] as item,
           count(distinct date)::int visits, max(date) last_date, round(sum(coalesce(net,0)))::int spend,
           (array_agg(employee_name order by date desc) filter (where coalesce(employee_name,'') <> '' and employee_name !~* '^\s*business\M'))[1] last_by
    from l where kind = 'service' group by ikey
  ), prod as (
    select item, count(*)::int times, round(sum(coalesce(net,0)))::int spend
    from l where kind = 'product' group by item
  ), st as (
    select employee_name, count(distinct date)::int visits
    from l where coalesce(employee_name,'') <> '' and employee_name !~* '^\s*business\M' group by employee_name
  ), vd as (
    select date,
           (select string_agg(distinct x.branch, ', ') from l x where x.date = l.date) as at,
           (select jsonb_agg(e order by e) from (select distinct x.employee_name e from l x
              where x.date = l.date and coalesce(x.employee_name,'') <> '' and x.employee_name !~* '^\s*business\M') q) as by_who,
           (select jsonb_agg(i order by i) from (select distinct x.item i from l x
              where x.date = l.date and x.kind = 'service') q) as services,
           count(*) filter (where kind = 'product')::int as products,
           round(sum(coalesce(net,0)))::int as total
    from l where kind not in ('non_sale', 'voucher') group by date
  ), mo as (
    select to_char(date, 'YYYY-MM') as m, round(sum(coalesce(net,0)))::int as spend
    from l where kind not in ('non_sale', 'voucher') group by 1
  ), br as (
    select s.branch, count(distinct s.date)::int as visits
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= p_since
      and s.client_name = any(names)
      and public.stl_item_kind(s.item) not in ('non_sale', 'voucher')
    group by s.branch
  )
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(to_jsonb(svc) order by visits desc, spend desc) from svc), '[]'),
    'products', coalesce((select jsonb_agg(to_jsonb(prod) order by spend desc) from (select * from prod order by spend desc limit 6) prod), '[]'),
    'stylists', coalesce((select jsonb_agg(to_jsonb(st) order by visits desc) from st), '[]'),
    'visits',   coalesce((select jsonb_agg(to_jsonb(vd) order by date desc) from vd), '[]'),
    'months',   coalesce((select jsonb_agg(to_jsonb(mo) order by m) from mo), '[]'),
    'branches', coalesce((select jsonb_agg(to_jsonb(br) order by visits desc) from br), '[]'),
    'first_visit', (select min(date) from l where kind not in ('non_sale', 'voucher')),
    'last_visit',  (select max(date) from l where kind not in ('non_sale', 'voucher'))
  ) into out;
  return out;
end;
$f$;

create or replace function public.lost_clients_detail_bulk(p_branch text, p_clients text[], p_since date default date '2025-01-01')
 returns table(client_name text, first_visit date, services text, products text, retail_spend integer)
 language plpgsql
 stable
 set search_path to 'public'
 set statement_timeout to '30s'
as $f$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  return query
  with want as (
    select distinct on (public.stl_client_key(c)) c as name, public.stl_client_key(c) k
    from unnest(p_clients) c
  ), l as (
    select w.name, s.date, s.item, s.net, public.stl_item_kind(s.item) kind
    from sales_transaction_lines s
    join want w on public.stl_client_key(s.client_name) in (w.k, w.k || ' ' || w.k)
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= p_since
  ), svc as (
    select name, item, count(distinct date) v,
           row_number() over (partition by name order by count(distinct date) desc, sum(coalesce(net,0)) desc) rn
    from l where kind = 'service' group by name, item
  ), prod as (
    select name, item, count(*) t, sum(coalesce(net,0)) sp,
           row_number() over (partition by name order by sum(coalesce(net,0)) desc) rn
    from l where kind = 'product' group by name, item
  )
  select w.name,
         (select min(l.date) from l where l.name = w.name and l.kind not in ('non_sale', 'voucher')),
         (select string_agg(svc.item || ' x' || svc.v, '; ' order by svc.rn) from svc where svc.name = w.name and svc.rn <= 8),
         (select string_agg(prod.item || ' x' || prod.t, '; ' order by prod.rn) from prod where prod.name = w.name and prod.rn <= 6),
         (select round(sum(coalesce(l.net,0)))::int from l where l.name = w.name and l.kind = 'product')
  from want w;
end;
$f$;

revoke all on function public.lost_clients(text, integer, integer, integer, date) from public, anon;
grant execute on function public.lost_clients(text, integer, integer, integer, date) to authenticated, service_role;
revoke all on function public.lost_clients_summary(integer[], integer, date) from public, anon;
grant execute on function public.lost_clients_summary(integer[], integer, date) to authenticated, service_role;
revoke all on function public.lost_client_detail(text, text, date) from public, anon;
grant execute on function public.lost_client_detail(text, text, date) to authenticated, service_role;
revoke all on function public.lost_clients_detail_bulk(text, text[], date) from public, anon;
grant execute on function public.lost_clients_detail_bulk(text, text[], date) to authenticated, service_role;
