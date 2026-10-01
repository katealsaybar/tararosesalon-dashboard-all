-- My year on a stylist's own link (Kate, 1 Oct 2026). perf_year_weeks only takes a
-- leader/viewer key and always returns the whole roster, so it can never be called
-- from her page. This is the same year, read with her own token, and only hers:
-- no roster, no other names, no staff ids, no ledger keys.
--
-- Three things per week that the team page does not carry:
--   leave_days    days of that week inside a leave run (perf_leave: 4+ days in a row
--                 with no clients, services or rostered hours) or before her start date
--   phorest_days  days her home branch has in Phorest's Staff Daily that week, so a week
--                 nobody uploaded reads as "not uploaded", not as a bad week
--   aim           her level's monthly total_revenue aim x 12 / 52, cut to the days she
--                 was in (7 - leave_days, and for the week still trading, the days so
--                 far). Null for a level with no aim (beauty today).
-- Same weeks, same numbers (perf_core) and the same current-week rule as perf_year_weeks.
create or replace function perf_year_weeks_me(p_token uuid, p_year int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  last_d date := least(current_date, coalesce((select max(date) from phorest_staff_daily), current_date));
  last_wk date := date_trunc('week', last_d + 1)::date - 7;   -- Monday of the last complete week
  latest int := extract(isoyear from last_wk)::int;
  y int := least(coalesce(p_year, latest), latest);
  y_from date := perf_iso_w1(y);
  y_to date := least(perf_iso_w1(y + 1) - 1, last_wk + 6);
  cur date;
  days_to date;
  st date;
  lv jsonb;
  month_aim numeric;
  weeks jsonb;
  days jsonb;
begin
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;

  if last_d > last_wk + 6 and extract(isoyear from last_wk + 7)::int = y then cur := last_wk + 7; end if;
  days_to := case when cur is null then y_to else last_d end;
  st := perf_start_date(s);
  lv := perf_leave(s, y_from, days_to);
  month_aim := (select target from perf_benchmarks where level = s.level and kpi = 'total_revenue' limit 1);

  select coalesce(jsonb_agg(jsonb_build_object(
           'week_start', w, 'week_no', extract(week from w)::int,
           'quarter', least(4, (extract(week from w)::int - 1) / 13 + 1), 'current', w = cur,
           'numbers', perf_core(s, w, w + 6),
           'leave_days', off,
           'phorest_days', pd,
           'aim', case when month_aim is not null then round(month_aim * 12 / 52 * greatest(0, span - off) / 7) end)
         order by w), '[]')
    into weeks
  from (
    select w,
           -- days of this week that count: the whole week, or for the current one the days so far
           case when w = cur then (last_d - w + 1) else 7 end span,
           -- leave runs and days before her start, inside this week's counted days
           least(case when w = cur then (last_d - w + 1) else 7 end,
             coalesce((select sum(greatest(0, least(w + 6, last_d, (l->>'to')::date) - greatest(w, (l->>'from')::date) + 1))
                       from jsonb_array_elements(lv->'leave') l), 0)
             + case when st is not null and st > w then least(7, st - w) else 0 end) off,
           (select count(distinct d.date) from phorest_staff_daily d
             where d.branch = s.branch and d.date between w and w + 6) pd
    from (select g0::date w from generate_series(y_from::timestamp, (y_to - 6)::timestamp, interval '7 day') g(g0)
          union all select cur where cur is not null) x
  ) z;

  select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'total_revenue', round(coalesce(p.svc,0), 2), 'clients', coalesce(l.clients,0)) order by x.d), '[]')
    into days
  from (select g0::date d from generate_series(y_from::timestamp, days_to::timestamp, interval '1 day') g(g0)) x
  left join (select date, sum(services_ex_vat) svc from phorest_staff_daily
             where employee_name = s.phorest_name and not is_total and date between y_from and days_to group by date) p on p.date = x.d
  left join (select date, sum(total) clients from branch_staff_daily
             where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between y_from and days_to group by date) l on l.date = x.d;

  return jsonb_build_object(
    'data_through', last_d,
    'year', y,
    'from', y_from,
    'to', y_to,
    'years', (select jsonb_agg(g order by g desc) from generate_series(2025, latest) g),
    'current_from', cur,
    'current_week_no', case when cur is not null then extract(week from cur)::int end,
    'staff', jsonb_build_object('name', s.display_name, 'branch', s.branch, 'dept', s.dept, 'level', s.level, 'start_date', st),
    'month_aim', month_aim,
    'leave', lv->'leave',
    'weeks', weeks,
    'days', days,
    'branches', (
      select coalesce(jsonb_agg(jsonb_build_object('branch', b, 'sales', round(sales), 'clients', clients) order by sales desc), '[]')
      from (select coalesce(p.b, l.b) b, coalesce(p.sales, 0) sales, coalesce(l.clients, 0) clients
            from (select branch b, sum(services_ex_vat) sales from phorest_staff_daily
                  where employee_name = s.phorest_name and not is_total and date between y_from and y_to group by branch) p
            full join (select branch b, sum(total) clients from branch_staff_daily
                  where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between y_from and y_to group by branch) l
              on l.b = p.b) q
      where sales > 0 or clients > 0)
  );
end $$;
revoke all on function perf_year_weeks_me(uuid, int) from public;
grant execute on function perf_year_weeks_me(uuid, int) to anon, authenticated;
