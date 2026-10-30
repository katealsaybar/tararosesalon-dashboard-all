-- My Numbers and the payslip email: each person's money target for the month from the Target Calculator (Kate, 30 Oct 2026: "apply new targets based on the
-- October targets in the calculator").
-- staff_targets holds the plan per person and month (actual_target is what every dashboard calls the target). It is keyed by branch, dept and FIRST NAME in
-- capitals ("HAZEL MAE", "MJ"), not by perf_staff.id, so perf_month_target matches on branch + dept + first word of the display name, and returns null when
-- the match is not exactly one row (nothing is shown rather than a wrong figure). Two people are matched by hand in perf_target_names: Mary Joy ("MJ")
-- and Virginija, who has a plan at Saadiyat and one at Motor City that add up to her target.
-- perf_dashboard gets one new key, month_target (null when there is none). Everything else in it is unchanged.

create table if not exists public.perf_target_names (
  staff_id   uuid not null references public.perf_staff (id) on delete cascade,
  branch     text not null,
  staff_name text not null,
  primary key (staff_id, branch, staff_name)
);
alter table public.perf_target_names enable row level security;
revoke all on public.perf_target_names from anon, authenticated;

insert into public.perf_target_names (staff_id, branch, staff_name) values
  ('8e2eb9cf-332b-495c-8eb3-1385783812e8', 'AQ',  'MJ'),
  ('97cba3c6-e8f7-40c0-a4c7-add4caf56280', 'MC',  'VIRGINIA'),
  ('97cba3c6-e8f7-40c0-a4c7-add4caf56280', 'SAA', 'VIRGINIA')
on conflict do nothing;

create or replace function public.perf_month_target(p_staff uuid, p_month date) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare s perf_staff; m date := date_trunc('month', p_month)::date; n int; v numeric;
begin
  select * into s from perf_staff where id = p_staff;
  if not found then return null; end if;
  if exists (select 1 from perf_target_names where staff_id = p_staff) then
    select count(*), sum(t.actual_target) into n, v
      from staff_targets t join perf_target_names a on a.staff_id = p_staff and upper(a.branch) = upper(t.branch) and upper(btrim(a.staff_name)) = upper(btrim(t.staff_name))
     where t.month = m and upper(t.dept) = upper(s.dept);
  else
    select count(*), sum(t.actual_target) into n, v
      from staff_targets t
     where t.month = m and upper(t.branch) = upper(s.branch) and upper(t.dept) = upper(s.dept)
       and upper(split_part(btrim(t.staff_name), ' ', 1)) = upper(split_part(btrim(s.display_name), ' ', 1));
    if n > 1 then return null; end if;
  end if;
  return case when coalesce(v, 0) > 0 then v else null end;
end $$;

revoke all on function public.perf_month_target(uuid, date) from public, anon, authenticated;

create or replace function public.perf_dashboard(p_token uuid, p_month date default null::date) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  s perf_staff;
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  m2 date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month - 1 day')::date;
  lvl_order int;
  weeks jsonb;
  days jsonb;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if not found then return null; end if;

  select level_order into lvl_order from perf_benchmarks where level = s.level limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('week_start', w, 'numbers', perf_core(s, greatest(w, m1), least(w + 6, m2))) order by w), '[]')
    into weeks
  from generate_series(date_trunc('week', m1::timestamp), m2::timestamp, interval '7 day') g(g0), lateral (select g0::date w) x;

  select coalesce(jsonb_agg(jsonb_build_object('date', d, 'total_revenue', round(coalesce(p.svc,0), 2), 'clients', coalesce(l.clients,0),
                                               'phorest_clients', coalesce(p.visits,0)) order by d), '[]')
    into days
  from (select g0::date d from generate_series(m1::timestamp, m2::timestamp, interval '1 day') g(g0)) x
  left join (select date, sum(services_ex_vat) svc, sum(visits) visits from phorest_staff_daily
             where employee_name = s.phorest_name and not is_total and date between m1 and m2 group by date) p on p.date = x.d
  left join (select date, sum(total) clients from branch_staff_daily
             where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between m1 and m2 group by date) l on l.date = x.d;

  return jsonb_build_object(
    'staff', jsonb_build_object('name', s.display_name, 'branch', s.branch, 'dept', s.dept, 'level', s.level, 'keys', s.ledger_names),
    'month', m1,
    'month_target', public.perf_month_target(s.id, m1),
    'numbers', perf_core(s, m1, m2) || perf_clients(s, m1, m2) || perf_reviews(s, m1, m2) || perf_socials(s, m1, m2) || perf_reputation(s, m2) || perf_leave(s, m1, m2),
    'weeks', weeks,
    'days', days,
    'history', (select jsonb_agg(jsonb_build_object('month', mm, 'numbers', perf_core(s, mm, (mm + interval '1 month - 1 day')::date)) order by mm)
                from (select (m1 - (k || ' month')::interval)::date mm from generate_series(1, 3) k) h),
    'benchmarks', (select jsonb_object_agg(kpi, jsonb_build_object('min', minimum, 'target', target))
                   from perf_benchmarks where level = s.level),
    'next_level', (select level from perf_benchmarks where level_order = lvl_order + 1 limit 1),
    'next_benchmarks', (select jsonb_object_agg(kpi, jsonb_build_object('min', minimum, 'target', target))
                        from perf_benchmarks where level_order = lvl_order + 1),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'author', author, 'note', note, 'at', created_at) order by created_at), '[]')
              from perf_notes where staff_id = s.id and month = m1),
    'data_through', jsonb_build_object(
      'revenue', (select max(date) from phorest_staff_daily),
      'clients', (select max(date) from branch_staff_daily where total > 0),
      'column_fill', (select max(date_to) from staff_utilisation),
      'client_history', (select max(date) from sales_transaction_lines),
      'reviews', (select max(review_date) from google_reviews))
  );
end $function$;
