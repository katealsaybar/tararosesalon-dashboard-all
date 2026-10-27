-- Kate, 27 Oct 2026: Client's Last Visit counts a visit the same way as clients through the door
-- (door_clients_payment_entry.sql).
--
--   A visit is a client-day with a sale that has an entry in Payment Type, on a line that was not rung to
--   BUSINESS TRS and is not a deposit, balance payment or voucher sale. A client name with the word Staff in it
--   was already left out. Visits, first visit, last visit and "seen elsewhere" use that rule, so a zero-value
--   consultation or a staff booking no longer makes a client "seen". Spend is still everything the client paid.
--   BUSINESS TRS is no longer picked as a client's stylist.
--
--   lv_lines gets a visit flag; lv_client_all and lv_client_branch count visits off it (a client with no visit
--   line is not in them). lost_clients and lost_clients_summary (the slow path, used for 2025 onwards) follow
--   the same rule.
--
-- NOT changed here: lost_lists_refresh, which builds lost_lists_base for the Lost Client Blasts campaign, and
-- the single-client panel and bulk functions (lost_client_detail, lost_clients_detail_bulk,
-- lost_clients_visits_bulk, lost_consults). They still use the old visit rule.
--
-- 2025 onwards, all branches, regulars (3+ visits) gone 90 days: 2,649 lost before. See the live numbers.
-- Run this file as it is. It drops and rebuilds the three lv_ materialized views, then refreshes them.

drop materialized view if exists public.lv_client_all;
drop materialized view if exists public.lv_client_branch;
drop materialized view if exists public.lv_lines;

create materialized view public.lv_lines as
 with b0 as (
   select s.client_name as cn, s.branch, s.date, s.net, s.employee_name, coalesce(s.item, ''::text) as raw_item,
          (coalesce(s.employee_name, '') !~* '^\s*business\M'
           and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit
   from sales_transaction_lines s
   where s.branch = any (array['SAA'::text, 'KCA'::text, 'MC'::text, 'AQ'::text]) and s.date >= date '2021-01-01'
     and s.client_name is not null
     and case when position('staff' in lower(s.client_name)) > 0 then s.client_name !~* '\mstaff\M' else true end
 ), kinds as (
   select d.raw_item, stl_item_kind(d.raw_item) as kind from (select distinct b0.raw_item from b0) d
 ), b as (
   select b0.cn, b0.branch, b0.date, b0.net, b0.employee_name, b0.visit
   from b0 join kinds using (raw_item)
   where kinds.kind <> all (array['non_sale'::text, 'voucher'::text])
 ), nm0 as (
   select x.cn, x.name, stl_key_fold(x.name) as k
   from (select q.cn, regexp_replace(trim(both from q.cn), '\s+', ' ', 'g') as name
         from (select distinct b_1.cn from b b_1) q) x
   where x.name <> '' and x.cn !~* '^\s*walk[\s-]*in\M'
 )
 select nm0.k, nm0.name, b.branch, b.date, b.net, b.employee_name, b.visit
 from b join nm0 using (cn);

create index lv_lines_k_idx on public.lv_lines using btree (k);

create materialized view public.lv_client_all as
 with a as (
   select lv_lines.k,
          (count(distinct lv_lines.date) filter (where lv_lines.visit))::integer as visits,
          min(lv_lines.date) filter (where lv_lines.visit) as first_visit,
          max(lv_lines.date) filter (where lv_lines.visit) as last_visit,
          round(sum(coalesce(lv_lines.net, 0::numeric)), 2) as spend,
          (array_agg(lv_lines.name order by length(lv_lines.name), lv_lines.name))[1] as name
   from lv_lines group by lv_lines.k having bool_or(lv_lines.visit)
 ), sty as (
   select x.k, x.employee_name
   from (select lv_lines.k, lv_lines.employee_name,
                row_number() over (partition by lv_lines.k order by count(*) desc, max(lv_lines.date) desc) as rn
         from lv_lines
         where coalesce(lv_lines.employee_name, '') <> '' and lv_lines.employee_name !~* '^\s*business\M'
         group by lv_lines.k, lv_lines.employee_name) x
   where x.rn = 1
 )
 select a.k, a.name, a.visits, a.first_visit, a.last_visit, a.spend, sty.employee_name as stylist
 from a left join sty using (k);

create unique index lv_client_all_k_idx on public.lv_client_all using btree (k);

create materialized view public.lv_client_branch as
 with a as (
   select lv_lines.k, lv_lines.branch,
          (count(distinct lv_lines.date) filter (where lv_lines.visit))::integer as visits,
          min(lv_lines.date) filter (where lv_lines.visit) as first_visit,
          max(lv_lines.date) filter (where lv_lines.visit) as last_visit,
          round(sum(coalesce(lv_lines.net, 0::numeric)), 2) as spend,
          (array_agg(lv_lines.name order by length(lv_lines.name), lv_lines.name))[1] as name
   from lv_lines group by lv_lines.k, lv_lines.branch having bool_or(lv_lines.visit)
 ), sty as (
   select x.k, x.branch, x.employee_name
   from (select lv_lines.k, lv_lines.branch, lv_lines.employee_name,
                row_number() over (partition by lv_lines.k, lv_lines.branch order by count(*) desc, max(lv_lines.date) desc) as rn
         from lv_lines
         where coalesce(lv_lines.employee_name, '') <> '' and lv_lines.employee_name !~* '^\s*business\M'
         group by lv_lines.k, lv_lines.branch, lv_lines.employee_name) x
   where x.rn = 1
 )
 select a.k, a.branch, a.name, a.visits, a.first_visit, a.last_visit, a.spend, sty.employee_name as stylist
 from a left join sty using (k, branch);

create unique index lv_client_branch_kb_idx on public.lv_client_branch using btree (k, branch);
create index lv_client_branch_b_idx on public.lv_client_branch using btree (branch);

create or replace function public.lost_clients(p_branch text, p_min_visits integer DEFAULT 3, p_max_visits integer DEFAULT NULL::integer, p_days integer DEFAULT 90, p_since date DEFAULT '2025-01-01'::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
 SET enable_nestloop TO 'off'
AS $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with b0 as materialized (
    select s.client_name as cn, s.date, s.net, s.employee_name, coalesce(s.item, '') as raw_item,
           (coalesce(s.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit_line
    from sales_transaction_lines s
    where (p_since > date '2021-01-01' or public.dashboard_scope() is not null)
      and (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= p_since and s.client_name is not null
      and case when position('staff' in lower(s.client_name)) > 0 then s.client_name !~* '\mstaff\M' else true end
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b0) d
  ), b as materialized (
    select b0.cn, b0.date, b0.net, b0.employee_name, b0.visit_line
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
    select nm.kid, b.date, b.net, b.employee_name, b.visit_line from b join nm using (cn)
  ), c as materialized (
    select kid, (count(distinct date) filter (where visit_line))::int as visits,
           min(date) filter (where visit_line) as first_visit, max(date) filter (where visit_line) as last_visit,
           round(sum(coalesce(net, 0)), 2) as spend
    from l group by kid having bool_or(visit_line)
  ), cfs as materialized (
    select c.*, kk.k, kk.name as client_name from c join kk using (kid)
    where c.visits >= p_min_visits and (p_max_visits is null or c.visits <= p_max_visits)
      and c.last_visit < current_date - p_days
  ), st as materialized (
    select x.kid, x.employee_name, x.rn from (
      select l.kid, l.employee_name,
             row_number() over (partition by l.kid order by count(*) desc, max(l.date) desc) as rn
      from l where coalesce(l.employee_name, '') <> '' and l.employee_name !~* '^\s*business\M'
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
    select x.k, string_agg(distinct x.branch, ', ' order by x.branch) as now_at, max(x.date) as now_last
    from (
      select public.stl_key_fold(s.client_name) as k, s.branch, s.date, s.item, s.employee_name,
             bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id) as paid
      from sales_transaction_lines s
      where p_branch is not null and s.branch <> p_branch and s.branch in ('SAA', 'KCA', 'MC', 'AQ')
        and s.date >= current_date - p_days
        and nullif(trim(s.client_name), '') is not null
        and s.client_name !~* '^\s*walk[\s-]*in\M'
        and s.client_name !~* '\mstaff\M'
    ) x
    where x.paid and coalesce(x.employee_name, '') !~* '^\s*business\M'
      and public.stl_item_kind(x.item) not in ('non_sale', 'voucher')
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
$function$;

create or replace function public.lost_clients_summary(p_days integer[] DEFAULT ARRAY[30, 60, 90, 180], p_to integer DEFAULT NULL::integer, p_since date DEFAULT '2025-01-01'::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  if p_since <= date '2021-01-01' and public.dashboard_scope() is null then
    return public.lv_summary_fast(p_days, p_to);
  end if;
  with b0 as materialized (
    select s.client_name as cn, s.branch, s.date, s.net, coalesce(s.item, '') as raw_item,
           (coalesce(s.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit_line
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= p_since and s.client_name is not null
      and case when position('staff' in lower(s.client_name)) > 0 then s.client_name !~* '\mstaff\M' else true end
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b0) d
  ), b as materialized (
    select b0.cn, b0.branch, b0.date, b0.net, b0.visit_line
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
    select b.branch, nm.kid, (count(distinct b.date) filter (where b.visit_line))::int visits,
           max(b.date) filter (where b.visit_line) last_visit, sum(coalesce(b.net, 0)) spend
    from b join nm using (cn) group by b.branch, nm.kid having bool_or(b.visit_line)
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
    select nm.kid, (count(distinct b.date) filter (where b.visit_line))::int visits,
           max(b.date) filter (where b.visit_line) last_visit, sum(coalesce(b.net, 0)) spend
    from b join nm using (cn) group by nm.kid having bool_or(b.visit_line)
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
$function$;
