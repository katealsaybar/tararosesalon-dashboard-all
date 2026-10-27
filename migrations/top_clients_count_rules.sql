-- Kate, 27 Oct 2026: Top Clients follows the same client-count rules as clients through the door
-- (door_clients_payment_entry.sql).
--
--   * A client name with the word Staff in it (Emma Staff, Mona Staff) is a staff booking: no row, no spend.
--   * A visit is a client-day with a sale that has an entry in Payment Type and a line that is not a
--     deposit, balance payment or voucher sale and was not rung to BUSINESS TRS. One client, one day, one visit.
--   * Spend stays what the client paid (every sale line that is not a deposit, balance payment or voucher sale),
--     so retail rung to BUSINESS TRS still counts as her spend, but never as a visit on its own.
--   * "Last seen" (days away) uses the same visit rule.
--
-- top_clients, top_clients_board and get_top_clients keep their signatures, guards and settings.
-- Run this file as it is; it replaces the live definitions.

create or replace function public.top_clients(p_from date, p_to date, p_branch text DEFAULT NULL::text, p_min_visits integer DEFAULT 1, p_max_visits integer DEFAULT NULL::integer, p_min_spend numeric DEFAULT 0, p_away_min integer DEFAULT NULL::integer, p_away_max integer DEFAULT NULL::integer, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
declare out jsonb; scope text[];
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 1 then
    raise exception 'Sign in to see Top Clients';
  end if;
  scope := case when p_branch is null then array['SAA','KCA','MC','AQ'] else array[p_branch] end;
  with b as materialized (
    select s.client_name as cn, s.branch, s.date, s.net, coalesce(s.item, '') as raw_item,
           (coalesce(s.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit_line
    from sales_transaction_lines s
    where s.branch = any(scope) and s.date >= least(date '2025-01-01', p_from) and s.client_name is not null
      and s.client_name !~* '\mstaff\M'
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b) d
  ), dn as materialized (
    select b.cn, max(b.date) as last_any
    from b join kinds kd using (raw_item)
    where kd.kind not in ('non_sale', 'voucher') and b.visit_line
    group by b.cn
  ), nm as materialized (
    select cn, name, lower(name) as k, last_any
    from (select cn, last_any, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from dn) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), seen as (
    select k, max(last_any) as last_visit from nm group by k
  ), p as materialized (
    select nm.k, nm.name, b.branch, b.date, b.net, b.raw_item, kd.kind, b.visit_line
    from b join nm using (cn) join kinds kd using (raw_item)
    where b.date between p_from and p_to and kd.kind not in ('non_sale', 'voucher')
  ), c as (
    select p.k, max(p.name) as client_name, round(sum(coalesce(p.net, 0)), 2) as rev,
           count(distinct ((p.date - date '2000-01-01') * 8 + array_position(array['SAA','KCA','MC','AQ','FRT'], p.branch))) filter (where p.visit_line)::int as visits
    from p group by p.k
  ), tot as (
    select coalesce(sum(rev), 0) as total_rev from c
  ), f as (
    select c.*, sn.last_visit, (current_date - sn.last_visit) as days_since
    from c join seen sn on sn.k = c.k
    where c.visits >= p_min_visits and (p_max_visits is null or c.visits <= p_max_visits)
      and c.rev >= p_min_spend
      and (p_away_min is null or (current_date - sn.last_visit) >= p_away_min)
      and (p_away_max is null or (current_date - sn.last_visit) <= p_away_max)
  ), cnt as (
    select count(*)::int as matched from f
  ), t as materialized (
    select * from f order by rev desc limit greatest(p_limit, 1)
  ), names as (
    select array_agg(nm.cn) as cns from nm join t on t.k = nm.k
  ), pb as (
    select distinct on (p.k) p.k, p.branch
    from p join t on t.k = p.k
    group by p.k, p.branch order by p.k, sum(coalesce(p.net, 0)) desc
  ), team as (
    select lower(regexp_replace(trim(x.client_name), '\s+', ' ', 'g')) as k, x.employee_name,
           row_number() over (partition by lower(regexp_replace(trim(x.client_name), '\s+', ' ', 'g'))
                              order by count(distinct x.date) desc, max(x.date) desc) as rn
    from sales_transaction_lines x
    where x.client_name = any(coalesce((select cns from names), array[]::text[])) and x.branch = any(scope) and x.date >= least(date '2025-01-01', p_from)
      and coalesce(x.employee_name, '') <> '' and x.employee_name !~* '^\s*business\M'
    group by 1, x.employee_name
  ), tm as (
    select k, max(employee_name) filter (where rn = 1) as stylist,
           string_agg(employee_name, ', ' order by rn) filter (where rn between 2 and 8) as also_saw
    from team group by k
  ), fav as (
    select p.k, regexp_replace(p.raw_item, '\s*\(Refund\)\s*$', '', 'i') as item,
           row_number() over (partition by p.k order by count(*) desc, sum(coalesce(p.net, 0)) desc) as rn
    from p join t on t.k = p.k
    where p.kind = 'service' and p.raw_item !~* '\(Refund\)\s*$'
    group by p.k, regexp_replace(p.raw_item, '\s*\(Refund\)\s*$', '', 'i')
  ), r as (
    select t.client_name, t.rev, t.visits, t.last_visit, t.days_since, pb.branch,
           tm.stylist, tm.also_saw, fav.item as fav, cc.mobile, cc.landline, cc.match
    from t
    left join pb on pb.k = t.k
    left join tm on tm.k = t.k
    left join fav on fav.k = t.k and fav.rn = 1
    left join lateral (
      select c2.mobile, c2.landline, c2.match from client_contacts c2
      where c2.client_key = t.k order by (c2.branch = pb.branch) desc, c2.updated_at desc limit 1
    ) cc on true
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.rev desc) from r), '[]'::jsonb),
    'matched', (select matched from cnt),
    'total_rev', (select total_rev from tot)
  ) into out;
  return out;
end $function$;

create or replace function public.top_clients_board(p_from date, p_to date, p_min_visits integer DEFAULT 1, p_max_visits integer DEFAULT NULL::integer, p_min_spend numeric DEFAULT 0, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 1 then
    raise exception 'Sign in to see Top Clients';
  end if;
  with b as materialized (
    select s.client_name as cn, s.branch, s.date, s.net, coalesce(s.item, '') as raw_item,
           (coalesce(s.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit_line
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= least(date '2025-01-01', p_from) and s.client_name is not null
      and s.client_name !~* '\mstaff\M'
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b) d
  ), dn as materialized (
    select b.cn, b.branch, max(b.date) as last_any
    from b join kinds kd using (raw_item)
    where kd.kind not in ('non_sale', 'voucher') and b.visit_line
    group by b.cn, b.branch
  ), nm as materialized (
    select cn, lower(name) as k from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from dn) q) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), seen as (
    select dn.branch, nm.k, max(dn.last_any) as last_visit from dn join nm using (cn) group by dn.branch, nm.k
  ), c as (
    select b.branch, nm.k, sum(coalesce(b.net, 0)) as rev, count(distinct b.date) filter (where b.visit_line)::int as visits
    from b join nm using (cn) join kinds kd using (raw_item)
    where b.date between p_from and p_to and kd.kind not in ('non_sale', 'voucher')
    group by b.branch, nm.k
  ), tot as (
    select branch, sum(rev) as total_rev from c group by branch
  ), f as (
    select c.*, (current_date - sn.last_visit) as away,
           row_number() over (partition by c.branch order by c.rev desc) as rn
    from c join seen sn on sn.branch = c.branch and sn.k = c.k
    where c.visits >= p_min_visits and (p_max_visits is null or c.visits <= p_max_visits)
      and c.rev >= p_min_spend
  ), top as (
    select * from f where rn <= greatest(p_limit, 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'branch', g.branch, 'n', g.n, 'rev', round(g.rev), 'total_rev', round(coalesce(tot.total_rev, 0)),
      'now_n', g.now_n, 'now_rev', round(g.now_rev), 'cool_n', g.cool_n, 'cool_rev', round(g.cool_rev),
      'slip_n', g.slip_n, 'slip_rev', round(g.slip_rev)) order by g.branch), '[]'::jsonb)
  into out
  from (
    select branch, count(*)::int n, coalesce(sum(rev), 0) rev,
           count(*) filter (where away <= 30)::int now_n,  coalesce(sum(rev) filter (where away <= 30), 0) now_rev,
           count(*) filter (where away between 31 and 60)::int cool_n, coalesce(sum(rev) filter (where away between 31 and 60), 0) cool_rev,
           count(*) filter (where away > 60)::int slip_n,  coalesce(sum(rev) filter (where away > 60), 0) slip_rev
    from top group by branch
  ) g left join tot on tot.branch = g.branch;
  return out;
end $function$;

create or replace function public.get_top_clients(p_year integer, p_branches text[], p_from date, p_to date, p_limit integer DEFAULT 25)
 RETURNS TABLE(client_name text, total_revenue numeric, visit_count bigint, top_service text)
 LANGUAGE sql
 STABLE
AS $function$
  with base as (
    select public.stl_client_key(s.client_name) as ckey,
           regexp_replace(trim(s.client_name), '\s+', ' ', 'g') as cname,
           s.branch, s.date, s.total,
           regexp_replace(s.item, '\s*\(Refund\)\s*$', '', 'i') as item,
           s.item ~* '\(Refund\)\s*$' as is_refund,
           coalesce(s.item, '') as raw_item,
           (coalesce(s.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit_line
    from sales_transaction_lines s
    where s.year   = p_year
      and s.branch = any(p_branches)
      and s.date between p_from and p_to
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
      and s.client_name !~* '\mstaff\M'
  ),
  kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind
    from (select distinct raw_item from base) d
  ),
  kept as (
    select b.*, k.kind from base b
    join kinds k on k.raw_item = b.raw_item
    where k.kind not in ('non_sale', 'voucher')
  ),
  client_stats as (
    select ckey, max(cname) as cname, sum(total) as total_revenue,
           count(distinct (branch, date)) filter (where visit_line) as visit_count
    from kept group by ckey
  ),
  svc_counts as (
    select ckey, item,
           row_number() over (partition by ckey order by count(*) desc, sum(total) desc) as rn
    from kept
    where kind = 'service' and not is_refund
    group by ckey, item
  )
  select cs.cname, cs.total_revenue, cs.visit_count, sc.item
  from client_stats cs
  left join svc_counts sc on sc.ckey = cs.ckey and sc.rn = 1
  where cs.visit_count > 0
  order by cs.total_revenue desc
  limit p_limit;
$function$;
