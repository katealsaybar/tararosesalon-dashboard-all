-- SUPERSEDED (7 Oct 2026): first version, slow. Run final_7oct_top_clients_last_visit.sql instead.
-- NOTE (7 Oct 2026): this file and top_clients_revamp.sql hold the FIRST versions. The live functions
-- were then rewritten for speed and are recorded in Supabase's migration history as
-- top_clients_speed, top_clients_speed2, top_clients_speed3b (top_clients, top_clients_board) and
-- last_visit_speed_int_keys (lost_clients, lost_clients_summary). The change is the same in all four:
-- run the name regexes once per distinct name, group on integer ids, and do the per-client work
-- (team, favourite service, phone) only for the clients that are shown. Read the live definitions with
-- pg_get_functiondef before editing any of them; do not paste these two files back over them.

-- Kate, 7 Oct 2026: Client's Last Visit gets (1) an "All" branch beside SAA / KCA / MC / AQ,
-- (2) a 30+ choice in Days away, (3) an every-branch board that follows a Custom range, and
-- (4) the same speed-up as Top Clients: the name regexes now run once per distinct name
-- (about 14,000), not once per line (about 170,000).
--
--   lost_clients(p_branch null)  every branch at once: visits and her last visit are counted
--                                across the four salons, so someone seen anywhere is not
--                                "lost", and there is no "moved" line (nobody moved branch
--                                when every branch counts). Her phone is the first match.
--   lost_clients_detail_bulk     the same, for the XLSX / CSV
--   lost_clients_summary(p_days, p_to)  p_days is the list of "gone for more than N days"
--                                cuts to count (default 30, 60, 90, 180); p_to, when given,
--                                also requires her last visit to be within p_to days, which
--                                is the Custom range (from = p_days[1], to = p_to).
-- lost_client_detail already takes a null branch (lost_client_detail_visits.sql).

create or replace function public.lost_clients(p_branch text, p_min_visits integer default 3,
  p_max_visits integer default null, p_days integer default 90)
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
    select s.client_name as cn, s.date, s.net, s.employee_name
    from sales_transaction_lines s
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= date '2025-01-01' and s.client_name is not null
  ), nm as materialized (
    select cn, name, lower(name) as k
    from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from b) q) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), l as (
    select nm.k, nm.name, b.date, b.net, b.employee_name from b join nm using (cn)
  ), c as (
    select k, max(name) as client_name, count(distinct date)::int as visits,
           min(date) as first_visit, max(date) as last_visit, round(sum(coalesce(net, 0)), 2) as spend
    from l group by k
  ), st as (
    select k, employee_name,
           row_number() over (partition by k order by count(*) desc, max(date) desc) as rn
    from l where coalesce(employee_name, '') <> ''
    group by k, employee_name
  ), elsewhere as (
    select public.stl_client_key(s.client_name) as k,
           string_agg(distinct s.branch, ', ' order by s.branch) as now_at, max(s.date) as now_last
    from sales_transaction_lines s
    where p_branch is not null and s.branch <> p_branch and s.branch in ('SAA', 'KCA', 'MC', 'AQ')
      and s.date >= current_date - p_days
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
    group by 1
  ), bk as (
    select distinct on (b2.client_key) b2.client_key as k, b2.date as booked_on, b2.branch as booked_at,
           b2.staff as booked_with, b2.services as booked_for
    from client_bookings b2
    where b2.date >= current_date
    order by b2.client_key, b2.date, (b2.branch = p_branch) desc
  ), r as (
    select c.client_name, c.visits, c.first_visit, c.last_visit,
           (current_date - c.last_visit) as days_since, c.spend,
           st.employee_name as stylist, cc.mobile, cc.landline, cc.match,
           e.now_at, e.now_last,
           bk.booked_on, bk.booked_at, bk.booked_with, bk.booked_for
    from c
    left join st on st.k = c.k and st.rn = 1
    left join lateral (
      select c2.mobile, c2.landline, c2.match from client_contacts c2
      where c2.client_key = c.k and (p_branch is null or c2.branch = p_branch)
      order by c2.updated_at desc limit 1
    ) cc on true
    left join elsewhere e on e.k = c.k
    left join bk on bk.k = c.k
    where c.visits >= p_min_visits
      and (p_max_visits is null or c.visits <= p_max_visits)
      and c.last_visit < current_date - p_days
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.spend desc), '[]'::jsonb) into out from r;
  return out;
end;
$function$;

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
  ), nm as materialized (
    select cn, lower(name) as k
    from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from b) q) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), c as (
    select b.branch, nm.k, count(distinct b.date)::int visits, max(b.date) last_visit, sum(coalesce(b.net, 0)) spend
    from b join nm using (cn) group by b.branch, nm.k
  ), rk as (
    select c.*, row_number() over (partition by k order by last_visit desc) rn from c
  ), top2 as (
    select k, max(last_visit) filter (where rn = 1) m1, max(branch) filter (where rn = 1) b1,
           max(last_visit) filter (where rn = 2) m2
    from rk group by k
  ), bk as (
    select distinct client_key k from client_bookings where date >= current_date
  ), cx as (
    select c.*, case when c.branch = t.b1 then t.m2 else t.m1 end last_elsewhere,
           (bk.k is not null) as booked
    from c join top2 t using (k) left join bk using (k)
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
