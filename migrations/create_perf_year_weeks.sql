-- 13-Week Report as one long list (Emma, 29 Sep 2026): "the point is seeing all
-- together on one big list". Instead of picking a quarter, the page shows every
-- complete week of a year, Week 1 onwards, with the quarters (Weeks 1-13, 14-26,
-- 27-39, 40-52/53) as subtotals inside the list. Weeks are the year's own ISO
-- Monday-to-Sunday weeks, so Week 1 of 2026 starts Mon 29 Dec 2025.
--
-- Only complete weeks go in the totals. On the year the latest data sits in, the
-- week still being traded rides on the end as 'current', so its growth shows.
--
-- Uses perf_iso_w1 from create_perf_weeks.sql. Same key check and same numbers as
-- perf_weeks: every week is perf_core over that week.
create or replace function perf_year_weeks(p_admin uuid, p_staff_id uuid default null, p_year int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  last_d date := least(current_date, coalesce((select max(date) from phorest_staff_daily), current_date));
  last_wk date := date_trunc('week', last_d + 1)::date - 7;   -- Monday of the last complete week
  latest int := extract(isoyear from last_wk)::int;
  y int := least(coalesce(p_year, latest), latest);
  y_from date := perf_iso_w1(y);
  y_to date := least(perf_iso_w1(y + 1) - 1, last_wk + 6);     -- last Sunday counted in the totals
  cur date;
  weeks jsonb;
  days jsonb;
  days_to date;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;
  if last_d > last_wk + 6 and extract(isoyear from last_wk + 7)::int = y then cur := last_wk + 7; end if;
  days_to := coalesce(last_d, y_to);
  if cur is null then days_to := y_to; end if;

  if p_staff_id is not null then
    select * into s from perf_staff where id = p_staff_id and active;
  end if;
  if s.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('week_start', w, 'week_no', extract(week from w)::int,
             'quarter', least(4, (extract(week from w)::int - 1) / 13 + 1), 'current', w = cur,
             'numbers', perf_core(s, w, w + 6)) order by w), '[]')
      into weeks
    from (select g0::date w from generate_series(y_from::timestamp, (y_to - 6)::timestamp, interval '7 day') g(g0)
          union all select cur where cur is not null) x;

    select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'total_revenue', round(coalesce(p.svc,0), 2), 'clients', coalesce(l.clients,0)) order by x.d), '[]')
      into days
    from (select g0::date d from generate_series(y_from::timestamp, days_to::timestamp, interval '1 day') g(g0)) x
    left join (select date, sum(services_ex_vat) svc from phorest_staff_daily
               where employee_name = s.phorest_name and not is_total and date between y_from and days_to group by date) p on p.date = x.d
    left join (select date, sum(total) clients from branch_staff_daily
               where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between y_from and days_to group by date) l on l.date = x.d;
  end if;

  return jsonb_build_object(
    'data_through', last_d,
    'year', y,
    'from', y_from,
    'to', y_to,
    'years', (select jsonb_agg(g order by g desc) from generate_series(2025, latest) g),
    'current_from', cur,
    'current_week_no', case when cur is not null then extract(week from cur)::int end,
    -- The team grid: everyone's year so far as one perf_core over its complete weeks,
    -- plus the weekly sales for each card's small bars.
    'roster', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.display_name, 'branch', r.branch,
                 'dept', r.dept, 'level', r.level, 'keys', r.ledger_names,
                 'numbers', case when p_staff_id is null then perf_core(r, y_from, y_to) end,
                 'weekly', case when p_staff_id is null then (
                    select jsonb_agg(round(coalesce(t.v, 0)) order by z.wk)
                    from (select g0::date wk from generate_series(y_from::timestamp, (y_to - 6)::timestamp, interval '7 day') g(g0)) z
                    left join (select date_trunc('week', date)::date wk, sum(services_ex_vat) v from phorest_staff_daily
                               where employee_name = r.phorest_name and not is_total and date between y_from and y_to group by 1) t on t.wk = z.wk) end,
                 'current', case when p_staff_id is null and cur is not null then (select round(coalesce(sum(services_ex_vat), 0))
                    from phorest_staff_daily where employee_name = r.phorest_name and not is_total and date between cur and last_d) end)
                 order by r.branch, r.dept desc, r.display_name), '[]')
               from perf_staff r where r.active),
    'staff', case when s.id is not null then jsonb_build_object('id', s.id, 'name', s.display_name, 'branch', s.branch,
               'dept', s.dept, 'level', s.level) end,
    'weeks', coalesce(weeks, '[]'),
    'days', coalesce(days, '[]'),
    'branches', case when s.id is not null then (
      select coalesce(jsonb_agg(jsonb_build_object('branch', b, 'sales', round(sales), 'clients', clients) order by sales desc), '[]')
      from (select coalesce(p.b, l.b) b, coalesce(p.sales, 0) sales, coalesce(l.clients, 0) clients
            from (select branch b, sum(services_ex_vat) sales from phorest_staff_daily
                  where employee_name = s.phorest_name and not is_total and date between y_from and y_to group by branch) p
            full join (select branch b, sum(total) clients from branch_staff_daily
                  where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between y_from and y_to group by branch) l
              on l.b = p.b) q
      where sales > 0 or clients > 0) end
  );
end $$;
grant execute on function perf_year_weeks(uuid, uuid, int) to anon;
