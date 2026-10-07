-- Kate, 7 Oct 2026: the FINAL live definitions of the six functions behind Top Clients and
-- Client's Last Visit, as they stand in Supabase after the speed work. The earlier files
-- (lost_client_detail_visits.sql, top_clients_revamp.sql, last_visit_all_30_custom_board.sql)
-- hold the first versions; if one of them is run again it brings back the slow queries, so
-- run THIS file instead, or read the live definitions with pg_get_functiondef.
--
-- What makes them fast (3 to 8 seconds down to 0.4 to 2):
--   * the name regexes (whitespace, walk-in) run once per distinct client name, about 14,000,
--     not once per sales line, about 170,000; the key is lower(name), the same as stl_client_key
--   * grouping and window functions run on integer ids (kid), not long text keys
--   * per-client work (stylists, favourite service, phone) runs only for the rows that are shown
--   * CTEs the planner would otherwise re-run once per client row are MATERIALIZED
--     (lost_clients' stylist CTE did that: One visit took 8.4s)
--
-- ALSO: lost_clients has SET enable_nestloop = off. Under row-level security (the role the dashboard
-- really uses, `authenticated`) the planner under-estimates the bookings CTE and joins it by nested
-- loop: All branches + One visit took 8s there and 1.2s as a superuser. Always time a new RPC as
-- `authenticated` (set local role authenticated, with request.jwt.claim.sub set to Kate's user id),
-- not as the postgres role the SQL tool uses.
--
-- Functions: top_clients, top_clients_board, lost_client_detail, lost_clients,
-- lost_clients_detail_bulk, lost_clients_summary.

-- ── Top Clients: the ranked list ────────────────────────────────────────────
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
  with b as materialized (
    select s.client_name as cn, s.branch, s.date, s.net, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch = any(scope) and s.date >= date '2025-01-01' and s.client_name is not null
  ), dn as materialized (
    select cn, max(date) as last_any from b group by cn
  ), nm as materialized (
    select cn, name, lower(name) as k, last_any
    from (select cn, last_any, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from dn) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), seen as (
    select k, max(last_any) as last_visit from nm group by k
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b) d
  ), p as materialized (
    select nm.k, nm.name, b.branch, b.date, b.net, b.raw_item, kd.kind
    from b join nm using (cn) join kinds kd using (raw_item)
    where b.date between p_from and p_to and kd.kind not in ('non_sale', 'voucher')
  ), c as (
    select p.k, max(p.name) as client_name, round(sum(coalesce(p.net, 0)), 2) as rev,
           count(distinct ((p.date - date '2000-01-01') * 8 + array_position(array['SAA','KCA','MC','AQ'], p.branch)))::int as visits
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
    where x.client_name = any(coalesce((select cns from names), array[]::text[])) and x.branch = any(scope) and x.date >= date '2025-01-01'
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
revoke all on function public.top_clients(date, date, text, int, int, numeric, int, int, int) from public, anon;
grant execute on function public.top_clients(date, date, text, int, int, numeric, int, int, int) to authenticated;

-- ── Top Clients: the every-branch board ─────────────────────────────────────
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
  with b as materialized (
    select s.client_name as cn, s.branch, s.date, s.net, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= date '2025-01-01' and s.client_name is not null
  ), dn as materialized (
    select cn, branch, max(date) as last_any from b group by cn, branch
  ), nm as materialized (
    select cn, lower(name) as k from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from dn) q) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), seen as (
    select dn.branch, nm.k, max(dn.last_any) as last_visit from dn join nm using (cn) group by dn.branch, nm.k
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b) d
  ), c as (
    select b.branch, nm.k, sum(coalesce(b.net, 0)) as rev, count(distinct b.date)::int as visits
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
revoke all on function public.top_clients_board(date, date, int, int, numeric, int) from public, anon;
grant execute on function public.top_clients_board(date, date, int, int, numeric, int) to authenticated;

-- ── The row panel (both pages): every service, every visit, spend by month, branches ──
-- stl_names_for_key finds the raw spellings of a client's name through the stl_client_key index.
-- It is SECURITY DEFINER because under row-level security Postgres cannot use that index (the
-- function is not leakproof), so the panel read the whole table on every open (0.6 to 0.9s). It
-- returns only spellings of the name the caller already typed; the panel's own query still goes
-- through the table's policies. Panel now 15 to 80ms in SQL, 0.1 to 0.5s in the browser.
create or replace function public.stl_names_for_key(p_key text)
returns text[]
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct s.client_name), array[]::text[])
  from sales_transaction_lines s
  where public.stl_client_key(s.client_name) = p_key;
$$;
revoke all on function public.stl_names_for_key(text) from public, anon;
grant execute on function public.stl_names_for_key(text) to authenticated;

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
    from l group by date
  ), mo as (
    select to_char(date, 'YYYY-MM') as m, round(sum(coalesce(net,0)))::int as spend
    from l where kind not in ('non_sale', 'voucher') group by 1
  ), br as (
    select s.branch, count(distinct s.date)::int as visits
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= date '2025-01-01'
      and s.client_name = any(names)
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

-- ── Client's Last Visit: the list (p_branch null = every branch) ────────────
create or replace function public.lost_clients(p_branch text, p_min_visits integer default 3,
  p_max_visits integer default null, p_days integer default 90)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
set enable_nestloop to off
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with b as materialized (
    select s.client_name as cn, s.date, s.net, s.employee_name
    from sales_transaction_lines s
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= date '2025-01-01' and s.client_name is not null
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

-- ── Client's Last Visit: the XLSX / CSV detail (p_branch null = every branch) ──
create or replace function public.lost_clients_detail_bulk(p_branch text, p_clients text[])
returns table (client_name text, first_visit date, services text, products text, retail_spend integer)
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
         (select min(l.date) from l where l.name = w.name),
         (select string_agg(svc.item || ' x' || svc.v, '; ' order by svc.rn) from svc where svc.name = w.name and svc.rn <= 8),
         (select string_agg(prod.item || ' x' || prod.t, '; ' order by prod.rn) from prod where prod.name = w.name and prod.rn <= 6),
         (select round(sum(coalesce(l.net,0)))::int from l where l.name = w.name and l.kind = 'product')
  from want w;
end $function$;

-- ── Client's Last Visit: the every-branch board (p_days = cuts, p_to = Custom's upper bound) ──
drop function if exists public.lost_clients_summary();
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
  with b as materialized (
    select s.client_name as cn, s.branch, s.date, s.net
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= date '2025-01-01' and s.client_name is not null
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
revoke all on function public.lost_clients_summary(integer[], integer) from public, anon;
grant execute on function public.lost_clients_summary(integer[], integer) to authenticated;
