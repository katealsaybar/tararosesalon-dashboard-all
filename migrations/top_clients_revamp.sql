-- SUPERSEDED (7 Oct 2026): first version, slow. Run final_7oct_top_clients_last_visit.sql instead.
-- Kate, 7 Oct 2026: Top Clients rebuilt from Downloads/top-clients-mockup.html, on the
-- same footing as Client's Last Visit. Three calls, all over sales_transaction_lines
-- (from 1 Jan 2025), all security invoker so the table's own policies decide which
-- branches and which phone numbers a login can see.
--
--   top_clients(...)        the ranked list: revenue in the window, visits, last seen,
--                           her stylist and others, favourite service, phone
--   top_clients_board(...)  per branch, the top N split by when we last saw them
--   lost_client_detail(...) the row panel (from lost_client_detail_visits.sql), now
--                           also for "all branches" (p_branch null), with her spend by
--                           month and the branches she came to
--
-- Revenue is net (ex VAT), like Client's Last Visit. The old get_top_clients summed
-- total, which includes VAT (about 4.75% more); it stays in place, unused by the page.
-- Lines that are not sales (deposits, balance payments) and voucher lines are left out,
-- as before. Visits = days she came in, per branch. Last seen = her newest line at the
-- branch picked (any of the four on "all"), whatever the window. Walk-ins are left out.

create or replace function public.top_clients(
  p_from date, p_to date, p_branch text default null,
  p_min_visits int default 1, p_max_visits int default null, p_min_spend numeric default 0,
  p_away_min int default null, p_away_max int default null, p_limit int default 25)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb; scope text[];
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 1 then
    raise exception 'Sign in to see Top Clients';
  end if;
  scope := case when p_branch is null then array['SAA','KCA','MC','AQ'] else array[p_branch] end;
  with a as (
    select public.stl_client_key(s.client_name) as k,
           regexp_replace(trim(s.client_name), '\s+', ' ', 'g') as name,
           s.branch, s.date, s.net, s.employee_name, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch = any(scope) and s.date >= date '2025-01-01'
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from a) d
  ), seen as (
    select k, max(date) as last_visit from a group by k
  ), p as (
    select a.*, kd.kind from a join kinds kd using (raw_item)
    where a.date between p_from and p_to and kd.kind not in ('non_sale', 'voucher')
  ), cb as (
    select k, branch, row_number() over (partition by k order by sum(coalesce(net, 0)) desc) as rn
    from p group by k, branch
  ), c as (
    select p.k, max(p.name) as client_name, round(sum(coalesce(p.net, 0)), 2) as rev,
           count(distinct (p.branch, p.date))::int as visits
    from p group by p.k
  ), tot as (
    select coalesce(sum(rev), 0) as total_rev from c
  ), f as (
    select c.*, sn.last_visit, (current_date - sn.last_visit) as days_since, cb.branch as pbranch
    from c join seen sn on sn.k = c.k join cb on cb.k = c.k and cb.rn = 1
    where c.visits >= p_min_visits and (p_max_visits is null or c.visits <= p_max_visits)
      and c.rev >= p_min_spend
      and (p_away_min is null or (current_date - sn.last_visit) >= p_away_min)
      and (p_away_max is null or (current_date - sn.last_visit) <= p_away_max)
  ), cnt as (
    select count(*)::int as matched from f
  ), t as (
    select * from f order by rev desc limit greatest(p_limit, 1)
  ), team as (
    select x.k, x.employee_name,
           row_number() over (partition by x.k order by count(distinct x.date) desc, max(x.date) desc) as rn
    from a x join t on t.k = x.k
    where coalesce(x.employee_name, '') <> '' and x.employee_name !~* '^\s*business\M'
    group by x.k, x.employee_name
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
    select t.client_name, t.rev, t.visits, t.last_visit, t.days_since, t.pbranch as branch,
           tm.stylist, tm.also_saw, fav.item as fav, cc.mobile, cc.landline, cc.match
    from t
    left join tm on tm.k = t.k
    left join fav on fav.k = t.k and fav.rn = 1
    left join lateral (
      select c2.mobile, c2.landline, c2.match from client_contacts c2
      where c2.client_key = t.k order by (c2.branch = t.pbranch) desc, c2.updated_at desc limit 1
    ) cc on true
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.rev desc) from r), '[]'::jsonb),
    'matched', (select matched from cnt),
    'total_rev', (select total_rev from tot)
  ) into out;
  return out;
end $function$;
revoke all on function public.top_clients(date, date, text, int, int, numeric, int, int, int) from public, anon;
grant execute on function public.top_clients(date, date, text, int, int, numeric, int, int, int) to authenticated;


-- The every-branch board: each branch's top N (same visits and spend filters as the list,
-- not the last-seen one), split by days since she was last at THAT branch:
-- 0 to 30 "now", 31 to 60 "cool", 61+ "slip". total_rev is everything the branch took
-- from named clients in the window, for the "share of the branch" figure.
create or replace function public.top_clients_board(
  p_from date, p_to date,
  p_min_visits int default 1, p_max_visits int default null, p_min_spend numeric default 0,
  p_limit int default 25)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 1 then
    raise exception 'Sign in to see Top Clients';
  end if;
  with a as (
    select public.stl_client_key(s.client_name) as k, s.branch, s.date, s.net, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= date '2025-01-01'
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from a) d
  ), seen as (
    select branch, k, max(date) as last_visit from a group by branch, k
  ), c as (
    select a.branch, a.k, sum(coalesce(a.net, 0)) as rev, count(distinct a.date)::int as visits
    from a join kinds kd using (raw_item)
    where a.date between p_from and p_to and kd.kind not in ('non_sale', 'voucher')
    group by a.branch, a.k
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
revoke all on function public.top_clients_board(date, date, int, int, numeric, int) from public, anon;
grant execute on function public.top_clients_board(date, date, int, int, numeric, int) to authenticated;


-- The row panel, now also for every branch at once (p_branch null) and with two more
-- pieces for Top Clients: months (her spend per month since Jan 2025) and branches
-- (the days she came to each of the four, whatever branch the panel is about).
-- Everything else is as in lost_client_detail_visits.sql.
create or replace function public.lost_client_detail(p_branch text, p_client text)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '15s'
as $function$
declare out jsonb; k text := public.stl_client_key(p_client);
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
      and public.stl_client_key(s.client_name) = k
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
    from l group by date
  ), mo as (
    select to_char(date, 'YYYY-MM') as m, round(sum(coalesce(net,0)))::int as spend
    from l where kind not in ('non_sale', 'voucher') group by 1
  ), br as (
    select s.branch, count(distinct s.date)::int as visits
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= date '2025-01-01'
      and public.stl_client_key(s.client_name) = k
    group by s.branch
  )
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(to_jsonb(svc) order by visits desc, spend desc) from svc), '[]'),
    'products', coalesce((select jsonb_agg(to_jsonb(prod) order by spend desc) from (select * from prod order by spend desc limit 6) prod), '[]'),
    'stylists', coalesce((select jsonb_agg(to_jsonb(st) order by visits desc) from st), '[]'),
    'visits',   coalesce((select jsonb_agg(to_jsonb(vd) order by date desc) from vd), '[]'),
    'months',   coalesce((select jsonb_agg(to_jsonb(mo) order by m) from mo), '[]'),
    'branches', coalesce((select jsonb_agg(to_jsonb(br) order by visits desc) from br), '[]'),
    'first_visit', (select min(date) from l), 'last_visit', (select max(date) from l)
  ) into out;
  return out;
end $function$;
