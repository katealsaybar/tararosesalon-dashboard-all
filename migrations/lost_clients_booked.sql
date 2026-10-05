-- Lost Clients: clients who already have a booking (Kate, 5 Oct 2026).
-- The list only reads Sales Transactions, so a client with an appointment next week
-- still showed as lost until she came in and paid. client_bookings holds the future
-- appointments from Phorest's Staff Appointments report (Additional reports > Staff),
-- one row per client per branch per day, pushed by
-- "phorest data export/staff appointments/parse_future_bookings.py" in the cowork repo.
-- The report has names only, so a booking is matched on stl_client_key, the same key
-- the list uses; two clients with the same name share a booking.
--
-- lost_clients now returns booked_on / booked_at / booked_with / booked_for: her next
-- booking from today on, at any UAE branch. The page keeps those rows off the list
-- and the tiles, on a line of their own like the moved-branch ones.
-- lost_clients_summary counts them as still coming (active) and also returns them as
-- 'booked'. Otherwise the same as lost_clients_moved.sql and the live summary.

create table if not exists public.client_bookings (
  branch      text not null,
  client_key  text not null,          -- stl_client_key(client name)
  client_name text not null,
  date        date not null,
  staff       text,                   -- who she is booked with that day, ", " joined
  services    text,                   -- the services that day, ", " joined
  pulled_on   date not null,          -- the day the report was run
  primary key (branch, client_key, date)
);
create index if not exists idx_client_bookings_key on public.client_bookings (client_key, date);

alter table public.client_bookings enable row level security;
drop policy if exists dashboard_users_read on public.client_bookings;
create policy dashboard_users_read on public.client_bookings for select to authenticated
  using ((select is_dashboard_user()) and ((select dashboard_scope()) is null or branch = (select dashboard_scope())));
revoke all on public.client_bookings from anon;

create or replace function public.push_tables()
returns text[] language sql immutable as $$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking','client_bookings']
$$;

create or replace function public.lost_clients(
  p_branch text, p_min_visits int default 3, p_max_visits int default null, p_days int default 90)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout = '30s'
as $function$
declare out jsonb;
begin
  -- Level 2 and above only (Kate, 2 Oct 2026). Level 1 is reception; the page hides
  -- the menu entry for them too, but the refusal is here.
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with l as (
    select public.stl_client_key(s.client_name) as k,
           regexp_replace(trim(s.client_name), '\s+', ' ', 'g') as name,
           s.date, s.net, s.employee_name
    from sales_transaction_lines s
    where s.branch = p_branch and s.date >= date '2025-01-01'
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
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
    -- Seen at another UAE branch inside the same window.
    select public.stl_client_key(s.client_name) as k,
           string_agg(distinct s.branch, ', ' order by s.branch) as now_at, max(s.date) as now_last
    from sales_transaction_lines s
    where s.branch <> p_branch and s.branch in ('SAA', 'KCA', 'MC', 'AQ')
      and s.date >= current_date - p_days
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
    group by 1
  ), bk as (
    -- Her next booking from today on, at any branch.
    select distinct on (b.client_key) b.client_key as k, b.date as booked_on, b.branch as booked_at,
           b.staff as booked_with, b.services as booked_for
    from client_bookings b
    where b.date >= current_date
    order by b.client_key, b.date, (b.branch = p_branch) desc
  ), r as (
    select c.client_name, c.visits, c.first_visit, c.last_visit,
           (current_date - c.last_visit) as days_since, c.spend,
           st.employee_name as stylist, cc.mobile, cc.landline, cc.match,
           e.now_at, e.now_last,
           bk.booked_on, bk.booked_at, bk.booked_with, bk.booked_for
    from c
    left join st on st.k = c.k and st.rn = 1
    left join client_contacts cc on cc.branch = p_branch and cc.client_key = c.k
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
revoke all on function public.lost_clients(text, int, int, int) from public, anon;
grant execute on function public.lost_clients(text, int, int, int) to authenticated;

create or replace function public.lost_clients_summary()
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
  with l as (
    select s.branch, public.stl_client_key(s.client_name) k, s.date, s.net
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= date '2025-01-01'
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
  ), c as (
    select branch, k, count(distinct date)::int visits, max(date) last_visit, sum(coalesce(net,0)) spend
    from l group by branch, k
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
  ), d as (select unnest(array[60, 90, 180]) days), g as (
    select cx.branch, d.days,
      case when cx.visits >= 3 then 'regular' when cx.visits = 2 then 'twice' else 'once' end seg,
      cx.last_visit < current_date - d.days as gone,
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
revoke all on function public.lost_clients_summary() from public, anon;
grant execute on function public.lost_clients_summary() to authenticated;
