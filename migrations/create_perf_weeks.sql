-- 13-Week Report (Kate, 29 Sep 2026, Emma's ask). The Staff Benchmarks page cuts
-- its week-by-week chart at the month, so it only ever shows 4 or 5 weeks. Emma
-- wants the run of the quarter: thirteen full Monday-to-Sunday weeks, ending with
-- the week the latest sales data falls in, so the ups and downs show.
--
-- Same numbers as the stylist page: every week is perf_core over that week, so a
-- week here and the same week there can never disagree. Same key check as
-- perf_dashboard_by_id: leader or viewer. The roster is names only (no tokens,
-- no emails), so the dashboard's public viewer key is safe with it.
create or replace function perf_weeks(p_admin uuid, p_staff_id uuid default null, p_weeks int default 13) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  n int := least(greatest(coalesce(p_weeks, 13), 1), 26);
  last_d date := least(current_date, coalesce((select max(date) from phorest_staff_daily), current_date));
  -- Thirteen complete Mon-Sun weeks (Kate, 29 Sep 2026): the last is the week whose
  -- Sunday the data has reached. The week still being traded rides on the end as
  -- 'current', so its growth shows, but it is never in the 13-week totals.
  w_end date := (date_trunc('week', last_d + 1)::date - 7);
  cur date := case when last_d > w_end + 6 then w_end + 7 end;
  weeks jsonb;
  days jsonb;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;

  if p_staff_id is not null then
    select * into s from perf_staff where id = p_staff_id and active;
  end if;
  if s.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('week_start', w, 'current', w = cur, 'numbers', perf_core(s, w, w + 6)) order by w), '[]')
      into weeks
    from (select (w_end - 7 * k)::date w from generate_series(0, n - 1) k union all select cur where cur is not null) x;

    -- Day by day for the chart's Daily toggle (Kate, 29 Sep 2026): sales and clients
    -- only, the same sources perf_core uses, as perf_dashboard's own days array.
    select coalesce(jsonb_agg(jsonb_build_object('date', x.d, 'total_revenue', round(coalesce(p.svc,0), 2), 'clients', coalesce(l.clients,0)) order by x.d), '[]')
      into days
    from (select g0::date d from generate_series((w_end - 7 * (n - 1))::timestamp, last_d::timestamp, interval '1 day') g(g0)) x
    left join (select date, sum(services_ex_vat) svc from phorest_staff_daily
               where employee_name = s.phorest_name and not is_total and date between w_end - 7 * (n - 1) and last_d group by date) p on p.date = x.d
    left join (select date, sum(total) clients from branch_staff_daily
               where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between w_end - 7 * (n - 1) and last_d group by date) l on l.date = x.d;
  end if;

  return jsonb_build_object(
    'data_through', last_d,
    'to', w_end + 6,
    'current_from', cur,
    -- The team grid (Kate, 29 Sep 2026): everyone's 13 weeks as one perf_core over the
    -- whole span, plus the weekly sales for each card's small bars. Only built when no
    -- stylist is asked for, so opening one person stays quick.
    'roster', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.display_name, 'branch', r.branch,
                 'dept', r.dept, 'level', r.level, 'keys', r.ledger_names,
                 'numbers', case when p_staff_id is null then perf_core(r, w_end - 7 * (n - 1), w_end + 6) end,
                 'weekly', case when p_staff_id is null then (
                    select jsonb_agg(round(coalesce((select sum(services_ex_vat) from phorest_staff_daily
                             where employee_name = r.phorest_name and not is_total and date between wk and wk + 6), 0)) order by wk)
                    from (select (w_end - 7 * k)::date wk from generate_series(0, n - 1) k) z) end,
                 'current', case when p_staff_id is null and cur is not null then (select round(coalesce(sum(services_ex_vat), 0))
                    from phorest_staff_daily where employee_name = r.phorest_name and not is_total and date between cur and last_d) end)
                 order by r.branch, r.dept desc, r.display_name), '[]')
               from perf_staff r where r.active),
    'from', w_end - 7 * (n - 1),
    'staff', case when s.id is not null then jsonb_build_object('id', s.id, 'name', s.display_name, 'branch', s.branch,
               'dept', s.dept, 'level', s.level) end,
    'weeks', coalesce(weeks, '[]'),
    'days', coalesce(days, '[]'),
    -- Where the 13 weeks were worked (Kate, 29 Sep 2026): perf_core has never filtered
    -- by branch, so a stylist covering another salon is already counted in full; this
    -- only shows the split, so a cover day reads as hers and not as a mistake.
    'branches', case when s.id is not null then (
      select coalesce(jsonb_agg(jsonb_build_object('branch', b, 'sales', round(sales), 'clients', clients) order by sales desc), '[]')
      from (select coalesce(p.b, l.b) b, coalesce(p.sales, 0) sales, coalesce(l.clients, 0) clients
            from (select branch b, sum(services_ex_vat) sales from phorest_staff_daily
                  where employee_name = s.phorest_name and not is_total and date between w_end - 7 * (n - 1) and w_end + 6 group by branch) p
            full join (select branch b, sum(total) clients from branch_staff_daily
                  where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between w_end - 7 * (n - 1) and w_end + 6 group by branch) l
              on l.b = p.b) q
      where sales > 0 or clients > 0) end
  );
end $$;
grant execute on function perf_weeks(uuid, uuid, int) to anon;
