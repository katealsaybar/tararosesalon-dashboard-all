-- 22 Oct 2026 (Kate): Client's Last Visit counts from 2021 (last_visit_2021_floor_no_staff.sql) and that
-- doubled the wait: on Kate's own login All time took 13 s and a 90+ chip 21 s, against 8 s and 12 s
-- from 2025, because every call re-read 416k sales lines, re-checked each item's kind and folded
-- 26k client names. This keeps those steps out of the call.
--
-- lv_lines            every counted line, one row each, from 1 Jan 2021: UAE branches, not staff, not walk-in,
--                     not a deposit / voucher / non-sale line, with the client key (stl_key_fold of the name).
-- lv_client_all       one row per client key across the four branches: visits (distinct days), first and last
--                     visit, spend, usual stylist.
-- lv_client_branch    the same per client key and branch.
-- lv_refresh()        rebuilds the three; pg_cron runs it at minute 14 every hour (client_directory is :07,
--                     lost_first_visit :12, oty :17), so the newest uploaded day can take up to an hour to
--                     show here. Run select public.lv_refresh(); after a big backfill, as with oty_refresh().
--
-- The three are not granted to anyone: security definer functions read them (lv_base, lv_summary_fast) after the
-- same Level 2 check as lost_clients, and only for a login with no branch scope (a scoped login keeps the slow path,
-- which runs under its row-level security). lost_clients stays security invoker so Phone, Email, bookings and opt-outs
-- still come through the tables' own policies (phones: owner only).
--
-- The slow path stays for any p_since after 2021-01-01 (that is the default 2025-01-01, what nothing calls now but
-- anyone can) and for scoped logins. Counts were checked equal to the slow path: All time 3+ 10,841 rows.
-- Undo: drop the fast pieces and re-run last_visit_2021_floor_no_staff.sql; cron.unschedule('lv-refresh-hourly').

create materialized view if not exists public.lv_lines as
with b0 as (
  select s.client_name as cn, s.branch, s.date, s.net, s.employee_name, coalesce(s.item, '') as raw_item
  from public.sales_transaction_lines s
  where s.branch in ('SAA', 'KCA', 'MC', 'AQ') and s.date >= date '2021-01-01' and s.client_name is not null
    and case when position('staff' in lower(s.client_name)) > 0 then s.client_name !~* '\mstaff\M' else true end
), kinds as (
  select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b0) d
), b as (
  select b0.cn, b0.branch, b0.date, b0.net, b0.employee_name
  from b0 join kinds using (raw_item)
  where kinds.kind not in ('non_sale', 'voucher')
), nm0 as (
  select cn, name, public.stl_key_fold(name) as k
  from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from b) q) x
  where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
)
select nm0.k, nm0.name, b.branch, b.date, b.net, b.employee_name
from b join nm0 using (cn);

create index if not exists lv_lines_k_idx on public.lv_lines (k);

create materialized view if not exists public.lv_client_all as
with a as (
  select k, count(distinct date)::int as visits, min(date) as first_visit, max(date) as last_visit,
         round(sum(coalesce(net, 0)), 2) as spend, (array_agg(name order by length(name), name))[1] as name
  from public.lv_lines group by k
), sty as (
  select k, employee_name from (
    select k, employee_name, row_number() over (partition by k order by count(*) desc, max(date) desc) as rn
    from public.lv_lines where coalesce(employee_name, '') <> '' group by k, employee_name
  ) x where rn = 1
)
select a.k, a.name, a.visits, a.first_visit, a.last_visit, a.spend, sty.employee_name as stylist
from a left join sty using (k);

create unique index if not exists lv_client_all_k_idx on public.lv_client_all (k);

create materialized view if not exists public.lv_client_branch as
with a as (
  select k, branch, count(distinct date)::int as visits, min(date) as first_visit, max(date) as last_visit,
         round(sum(coalesce(net, 0)), 2) as spend, (array_agg(name order by length(name), name))[1] as name
  from public.lv_lines group by k, branch
), sty as (
  select k, branch, employee_name from (
    select k, branch, employee_name, row_number() over (partition by k, branch order by count(*) desc, max(date) desc) as rn
    from public.lv_lines where coalesce(employee_name, '') <> '' group by k, branch, employee_name
  ) x where rn = 1
)
select a.k, a.branch, a.name, a.visits, a.first_visit, a.last_visit, a.spend, sty.employee_name as stylist
from a left join sty using (k, branch);

create unique index if not exists lv_client_branch_kb_idx on public.lv_client_branch (k, branch);
create index if not exists lv_client_branch_b_idx on public.lv_client_branch (branch);

revoke all on public.lv_lines, public.lv_client_all, public.lv_client_branch from public, anon, authenticated;

create or replace function public.lv_refresh() returns void
 language plpgsql
 security definer
 set search_path to 'public'
 set statement_timeout to '300s'
as $f$
begin
  refresh materialized view public.lv_lines;
  refresh materialized view concurrently public.lv_client_all;
  refresh materialized view concurrently public.lv_client_branch;
end;
$f$;
revoke all on function public.lv_refresh() from public, anon, authenticated;

create or replace function public.lv_base(p_branch text, p_min integer, p_max integer, p_days integer)
 returns table(k text, client_name text, visits integer, first_visit date, last_visit date, spend numeric, stylist text)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
 set statement_timeout to '60s'
as $f$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  if public.dashboard_scope() is not null then
    raise exception 'Not available for this login';
  end if;
  return query
    select v.k, v.name, v.visits, v.first_visit, v.last_visit, v.spend, v.stylist
    from public.lv_client_all v
    where p_branch is null and v.visits >= p_min and (p_max is null or v.visits <= p_max)
      and v.last_visit < current_date - p_days
    union all
    select v.k, v.name, v.visits, v.first_visit, v.last_visit, v.spend, v.stylist
    from public.lv_client_branch v
    where p_branch is not null and v.branch = p_branch and v.visits >= p_min and (p_max is null or v.visits <= p_max)
      and v.last_visit < current_date - p_days;
end;
$f$;
revoke all on function public.lv_base(text, integer, integer, integer) from public, anon;
grant execute on function public.lv_base(text, integer, integer, integer) to authenticated, service_role;

create or replace function public.lv_summary_fast(p_days integer[], p_to integer)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
 set statement_timeout to '60s'
as $f$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  if public.dashboard_scope() is not null then
    raise exception 'Not available for this login';
  end if;
  with c as (
    select branch, k, visits, last_visit, spend from public.lv_client_branch
  ), rk as (
    select c.*, row_number() over (partition by k order by last_visit desc) rn from c
  ), top2 as (
    select k, max(last_visit) filter (where rn = 1) m1, max(branch) filter (where rn = 1) b1,
           max(last_visit) filter (where rn = 2) m2
    from rk group by k
  ), bk as (
    select distinct public.stl_key_fold(cb.client_key) as k from client_bookings cb where cb.date >= current_date
  ), cx as (
    select c.*, case when c.branch = t.b1 then t.m2 else t.m1 end last_elsewhere,
           (bk.k is not null) as booked
    from c join top2 t using (k) left join bk using (k)
  ), d as (select unnest(p_days) days), g0 as (
    select cx.branch, d.days,
      case when cx.visits >= 3 then 'regular' when cx.visits = 2 then 'twice' else 'once' end seg,
      (cx.last_visit < current_date - d.days
        and (p_to is null or cx.last_visit >= current_date - p_to)) as gone,
      coalesce(cx.last_elsewhere >= current_date - d.days, false) as moved,
      cx.booked, cx.spend
    from cx cross join d
  ), ga as (
    select 'ALL'::text as branch, d.days,
      case when ca.visits >= 3 then 'regular' when ca.visits = 2 then 'twice' else 'once' end seg,
      (ca.last_visit < current_date - d.days
        and (p_to is null or ca.last_visit >= current_date - p_to)) as gone,
      false as moved,
      (bk.k is not null) as booked, ca.spend
    from public.lv_client_all ca cross join d left join bk on bk.k = ca.k
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
revoke all on function public.lv_summary_fast(integer[], integer) from public, anon;
grant execute on function public.lv_summary_fast(integer[], integer) to authenticated, service_role;

-- lost_clients_summary: the fast path first, the slow body below untouched.
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
  if p_since <= date '2021-01-01' and public.dashboard_scope() is null then
    return public.lv_summary_fast(p_days, p_to);
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

-- lost_clients: cf now comes from lv_base (fast) when p_since is 2021-01-01 or earlier and the login has no
-- branch scope, else from the slow CTEs (b0 .. cfs), which are switched off when the fast path runs.
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
    where (p_since > date '2021-01-01' or public.dashboard_scope() is not null)
      and (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
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
  ), cfs as materialized (
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
  ), cf as materialized (
    select cs.k, cs.client_name, cs.visits, cs.first_visit, cs.last_visit, cs.spend, st.employee_name as stylist
    from cfs cs left join st on st.kid = cs.kid
    union all
    select v.k, v.client_name, v.visits, v.first_visit, v.last_visit, v.spend, v.stylist
    from public.lv_base(p_branch, p_min_visits, p_max_visits, p_days) v
    where p_since <= date '2021-01-01' and public.dashboard_scope() is null
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
           cf.stylist, cc.mobile, cc.landline, cc.match,
           cc.email, cc.email_status, cc.email_match, least(fv.first_ever, cf.first_visit) as first_ever,
           oo.optout, oo.optout_note, oo.optout_at,
           e.now_at, e.now_last,
           bk.booked_on, bk.booked_at, bk.booked_with, bk.booked_for
    from cf
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

revoke all on function public.lost_clients(text, integer, integer, integer, date) from public, anon;
grant execute on function public.lost_clients(text, integer, integer, integer, date) to authenticated, service_role;
revoke all on function public.lost_clients_summary(integer[], integer, date) from public, anon;
grant execute on function public.lost_clients_summary(integer[], integer, date) to authenticated, service_role;

select cron.schedule('lv-refresh-hourly', '14 * * * *', 'select public.lv_refresh()');
