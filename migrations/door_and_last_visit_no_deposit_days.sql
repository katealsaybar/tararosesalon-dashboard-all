-- Kate, 8 Oct 2026: a deposit is not a visit. Six live functions counted any sales line as a
-- client coming in, so a booking deposit, an "Outstanding balance payment" or a voucher bought
-- on its own put a client in the salon on a day she was not there. Top Clients already left
-- those two kinds out (stl_item_kind: 'non_sale', 'voucher'); now these do too, so the same
-- client has the same visits and spend on every page.
--
--   door_clients, door_clients_daily  Clients through the door (the Pulse, Branch Performance and
--                                     Comparison headline). A client-day now needs at least one
--                                     line that is not a deposit, balance payment or voucher sale,
--                                     and a "Walk-in" name is no longer counted as one client a day
--                                     (the Last Visit pages already left it out). September 2026:
--                                     AQ 318 to 306, KCA 1,051 to 1,006, MC 325 to 302,
--                                     SAA 1,066 to 1,028.
--   lost_clients, lost_clients_summary, lost_client_detail, lost_clients_detail_bulk
--                                     Client's Last Visit: visits, first and last visit, spend and
--                                     "seen elsewhere" no longer count those lines. The tuning from
--                                     final_7oct_top_clients_last_visit.sql is kept: the kind is worked
--                                     out once per distinct item, not once per sales line, and
--                                     lost_clients keeps enable_nestloop = off.
--
-- NOT changed: top_clients / top_clients_board take a client's "last seen" from her newest line of
-- any kind (a deposit paid ahead of a booking can show as last seen). Doing that per line would undo
-- the speed work, so it is left for its own change.
--
-- Run this file as it is; it replaces the live definitions (all six already exist).

-- ── Clients through the door ────────────────────────────────────────────────
create or replace function public.door_clients(p_from date, p_to date)
returns table (branch text, clients bigint, days bigint)
language sql stable security invoker
set search_path = public
as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  )
  select l.branch,
         count(distinct (l.date, lower(trim(l.client_name)))) as clients,
         count(distinct l.date) as days
  from sales_transaction_lines l
  join k on k.ik = coalesce(l.item, '')
  where l.date between p_from and p_to
    and coalesce(trim(l.client_name), '') <> ''
    and l.client_name !~* '^\s*walk[\s-]*in\M'
    and k.kind not in ('non_sale', 'voucher')
  group by l.branch
$$;
grant execute on function public.door_clients(date, date) to authenticated, anon;

create or replace function public.door_clients_daily(p_from date, p_to date)
returns table (branch text, date date, clients bigint)
language sql stable security invoker
set search_path = public
as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  )
  select l.branch, l.date,
         count(distinct lower(trim(l.client_name))) as clients
  from sales_transaction_lines l
  join k on k.ik = coalesce(l.item, '')
  where l.date between p_from and p_to
    and coalesce(trim(l.client_name), '') <> ''
    and l.client_name !~* '^\s*walk[\s-]*in\M'
    and k.kind not in ('non_sale', 'voucher')
  group by l.branch, l.date
$$;
grant execute on function public.door_clients_daily(date, date) to authenticated, anon;

-- ── Client's Last Visit: the board and the list ─────────────────────────────
create or replace function public.lost_clients(p_branch text, p_min_visits integer default 3, p_max_visits integer default null, p_days integer default 90)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
set enable_nestloop to 'off'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with b0 as materialized (
    select s.client_name as cn, s.date, s.net, s.employee_name, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= date '2025-01-01' and s.client_name is not null
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b0) d
  ), b as materialized (
    select b0.cn, b0.date, b0.net, b0.employee_name
    from b0 join kinds using (raw_item)
    where kinds.kind not in ('non_sale', 'voucher')
  ), nm0 as materialized (
    select cn, name, lower(name) as k
    from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from b) q) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), kk as materialized (
    select k, row_number() over (order by k)::int as kid, max(name) as name from nm0 group by k
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
    select public.stl_client_key(s.client_name) as k,
           string_agg(distinct s.branch, ', ' order by s.branch) as now_at, max(s.date) as now_last
    from sales_transaction_lines s
    where p_branch is not null and s.branch <> p_branch and s.branch in ('SAA', 'KCA', 'MC', 'AQ')
      and s.date >= current_date - p_days
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
      and public.stl_item_kind(s.item) not in ('non_sale', 'voucher')
    group by 1
  ), bk as materialized (
    select distinct on (b2.client_key) b2.client_key as k, b2.date as booked_on, b2.branch as booked_at,
           b2.staff as booked_with, b2.services as booked_for
    from client_bookings b2
    where b2.date >= current_date
    order by b2.client_key, b2.date, (b2.branch = p_branch) desc
  ), cc as materialized (
    select distinct on (c2.client_key) c2.client_key as k, c2.mobile, c2.landline, c2.match
    from client_contacts c2
    where p_branch is null or c2.branch = p_branch
    order by c2.client_key, c2.updated_at desc
  ), r as (
    select cf.client_name, cf.visits, cf.first_visit, cf.last_visit,
           (current_date - cf.last_visit) as days_since, cf.spend,
           st.employee_name as stylist, cc.mobile, cc.landline, cc.match,
           e.now_at, e.now_last,
           bk.booked_on, bk.booked_at, bk.booked_with, bk.booked_for
    from cf
    left join st on st.kid = cf.kid
    left join cc on cc.k = cf.k
    left join elsewhere e on e.k = cf.k
    left join bk on bk.k = cf.k
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.spend desc), '[]'::jsonb) into out from r;
  return out;
end;
$function$;

create or replace function public.lost_clients_summary(p_days integer[] default array[30, 60, 90, 180], p_to integer default null)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with b0 as materialized (
    select s.client_name as cn, s.branch, s.date, s.net, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= date '2025-01-01' and s.client_name is not null
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b0) d
  ), b as materialized (
    select b0.cn, b0.branch, b0.date, b0.net
    from b0 join kinds using (raw_item)
    where kinds.kind not in ('non_sale', 'voucher')
  ), nm0 as materialized (
    select cn, lower(name) as k
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
    select distinct kk.kid from client_bookings cb join kk on kk.k = cb.client_key where cb.date >= current_date
  ), cx as (
    select c.*, case when c.branch = t.b1 then t.m2 else t.m1 end last_elsewhere,
           (bk.kid is not null) as booked
    from c join top2 t using (kid) left join bk using (kid)
  ), d as (select unnest(p_days) days), g as (
    select cx.branch, d.days,
      case when cx.visits >= 3 then 'regular' when cx.visits = 2 then 'twice' else 'once' end seg,
      (cx.last_visit < current_date - d.days
        and (p_to is null or cx.last_visit >= current_date - p_to)) as gone,
      coalesce(cx.last_elsewhere >= current_date - d.days, false) as moved,
      cx.booked, cx.spend
    from cx cross join d
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
end $function$;

-- ── Client's Last Visit: one client's panel ─────────────────────────────────
create or replace function public.lost_client_detail(p_branch text, p_client text)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '15s'
as $function$
declare out jsonb; k text := public.stl_client_key(p_client); names text[] := public.stl_names_for_key(public.stl_client_key(p_client));
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with l as (
    select s.date, s.branch, s.item, s.net, s.employee_name, public.stl_item_kind(s.item) kind,
           trim(regexp_replace(lower(coalesce(s.item, '')), '[^a-z0-9]+', ' ', 'g')) as ikey
    from sales_transaction_lines s
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA','KCA','MC','AQ')))
      and s.date >= date '2025-01-01'
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
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= date '2025-01-01'
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
end $function$;

-- ── Client's Last Visit: the first-visit column of the list ─────────────────
create or replace function public.lost_clients_detail_bulk(p_branch text, p_clients text[])
returns table(client_name text, first_visit date, services text, products text, retail_spend integer)
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
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
    join want w on public.stl_client_key(s.client_name) = w.k
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= date '2025-01-01'
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
end $function$;
