-- 13-Week Report (Kate, 29 Sep 2026, Emma's ask). The Staff Benchmarks page cuts
-- its week-by-week chart at the month, so it only ever shows 4 or 5 weeks. Emma
-- wants the run of the quarter.
--
-- FIXED CYCLES (Emma, 29 Sep 2026): Week 1 is the first week of January, Monday to
-- Sunday (ISO weeks, so Week 1 of 2026 starts Mon 29 Dec 2025). The year is four
-- fixed 13-week cycles: Weeks 1-13, 14-26, 27-39 and 40-52 (plus Week 53 in a year
-- that has one). p_start picks a cycle by any date inside it; without it the page
-- opens on the cycle holding the last complete week.
--
-- Only complete weeks go in the totals. The week still being traded rides on the
-- end as 'current' (on the default cycle only), so its growth shows.
--
-- Same numbers as the stylist page: every week is perf_core over that week, so a
-- week here and the same week there can never disagree. Same key check as
-- perf_dashboard_by_id: leader or viewer. The roster is names only (no tokens,
-- no emails), so the dashboard's public viewer key is safe with it.
drop function if exists perf_weeks(uuid, uuid, int);

-- Monday of ISO week 1 of an ISO year.
create or replace function perf_iso_w1(y int) returns date
language sql immutable as $$ select date_trunc('week', make_date(y, 1, 4))::date $$;

-- The cycle a date falls in: its first Monday, last Sunday, year, number (1-4) and week range.
create or replace function perf_cycle(d date) returns table (c_from date, c_to date, c_year int, c_no int, w_first int, w_last int)
language sql immutable as $$
  with b as (select extract(isoyear from d)::int y),
       w as (select y, perf_iso_w1(y) w1, perf_iso_w1(y + 1) nxt from b),
       q as (select y, w1, nxt, least(3, ((date_trunc('week', d)::date - w1) / 7) / 13) q from w)
  select w1 + 91 * q, case when q = 3 then nxt - 1 else w1 + 91 * q + 90 end,
         y, q + 1, 13 * q + 1, case when q = 3 then (nxt - w1) / 7 else 13 * q + 13 end
  from q
$$;

create or replace function perf_weeks(p_admin uuid, p_staff_id uuid default null, p_start date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  last_d date := least(current_date, coalesce((select max(date) from phorest_staff_daily), current_date));
  last_wk date := date_trunc('week', last_d + 1)::date - 7;   -- Monday of the last complete week
  c record;
  c_end date;          -- last Sunday counted in the totals
  cur date;            -- Monday of the week still being traded, when it is shown
  weeks jsonb;
  days jsonb;
  days_to date;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;

  select * into c from perf_cycle(coalesce(p_start, last_wk));
  -- A cycle that has not started yet (a future pick) falls back to the default.
  if c.c_from > last_wk then select * into c from perf_cycle(last_wk); end if;
  c_end := least(c.c_to, last_wk + 6);
  -- This week so far: only on the cycle that holds the last complete week, the page's opening view.
  if last_d > last_wk + 6 and (select c_from from perf_cycle(last_wk)) = c.c_from then cur := last_wk + 7; end if;
  days_to := coalesce(least(last_d, cur + 6), c_end);

  if p_staff_id is not null then
    select * into s from perf_staff where id = p_staff_id and active;
  end if;
  if s.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('week_start', w, 'week_no', extract(week from w)::int, 'current', w = cur,
             'numbers', perf_core(s, w, w + 6)) order by w), '[]')
      into weeks
    from (select g0::date w from generate_series(c.c_from::timestamp, (c_end - 6)::timestamp, interval '7 day') g(g0)
          union all select cur where cur is not null) x;

    select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'total_revenue', round(coalesce(p.svc,0), 2), 'clients', coalesce(l.clients,0)) order by x.d), '[]')
      into days
    from (select g0::date d from generate_series(c.c_from::timestamp, days_to::timestamp, interval '1 day') g(g0)) x
    left join (select date, sum(services_ex_vat) svc from phorest_staff_daily
               where employee_name = s.phorest_name and not is_total and date between c.c_from and days_to group by date) p on p.date = x.d
    left join (select date, sum(total) clients from branch_staff_daily
               where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between c.c_from and days_to group by date) l on l.date = x.d;
  end if;

  return jsonb_build_object(
    'data_through', last_d,
    'from', c.c_from,
    'to', c_end,
    'cycle', jsonb_build_object('year', c.c_year, 'no', c.c_no, 'from', c.c_from, 'to', c.c_to,
               'week_first', c.w_first, 'week_last', c.w_last, 'weeks_done', (c_end - c.c_from + 1) / 7),
    'current_from', cur,
    'current_week_no', case when cur is not null then extract(week from cur)::int end,
    -- The picker: every cycle from the start of 2025 to the default one, newest first.
    'cycles', (select jsonb_agg(jsonb_build_object('start', k.c_from, 'year', k.c_year, 'no', k.c_no, 'from', k.c_from, 'to', k.c_to,
                 'week_first', k.w_first, 'week_last', k.w_last) order by k.c_from desc)
               from (select distinct (perf_cycle(g0::date)).* from generate_series(perf_iso_w1(2025)::timestamp, last_wk::timestamp, interval '7 day') g(g0)) k),
    -- The team grid: everyone's cycle as one perf_core over its complete weeks, plus the
    -- weekly sales for each card's small bars. Only built when no stylist is asked for.
    'roster', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.display_name, 'branch', r.branch,
                 'dept', r.dept, 'level', r.level, 'keys', r.ledger_names,
                 'numbers', case when p_staff_id is null then perf_core(r, c.c_from, c_end) end,
                 'weekly', case when p_staff_id is null then (
                    select jsonb_agg(round(coalesce((select sum(services_ex_vat) from phorest_staff_daily
                             where employee_name = r.phorest_name and not is_total and date between wk and wk + 6), 0)) order by wk)
                    from (select g0::date wk from generate_series(c.c_from::timestamp, (c_end - 6)::timestamp, interval '7 day') g(g0)) z) end,
                 'current', case when p_staff_id is null and cur is not null then (select round(coalesce(sum(services_ex_vat), 0))
                    from phorest_staff_daily where employee_name = r.phorest_name and not is_total and date between cur and last_d) end)
                 order by r.branch, r.dept desc, r.display_name), '[]')
               from perf_staff r where r.active),
    'staff', case when s.id is not null then jsonb_build_object('id', s.id, 'name', s.display_name, 'branch', s.branch,
               'dept', s.dept, 'level', s.level) end,
    'weeks', coalesce(weeks, '[]'),
    'days', coalesce(days, '[]'),
    -- Where the cycle was worked: perf_core has never filtered by branch, so a stylist
    -- covering another salon is already counted in full; this only shows the split.
    'branches', case when s.id is not null then (
      select coalesce(jsonb_agg(jsonb_build_object('branch', b, 'sales', round(sales), 'clients', clients) order by sales desc), '[]')
      from (select coalesce(p.b, l.b) b, coalesce(p.sales, 0) sales, coalesce(l.clients, 0) clients
            from (select branch b, sum(services_ex_vat) sales from phorest_staff_daily
                  where employee_name = s.phorest_name and not is_total and date between c.c_from and c_end group by branch) p
            full join (select branch b, sum(total) clients from branch_staff_daily
                  where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between c.c_from and c_end group by branch) l
              on l.b = p.b) q
      where sales > 0 or clients > 0) end
  );
end $$;
grant execute on function perf_weeks(uuid, uuid, date) to anon;
