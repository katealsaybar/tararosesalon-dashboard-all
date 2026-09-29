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
  w_end date := date_trunc('week', last_d)::date;
  weeks jsonb;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;

  if p_staff_id is not null then
    select * into s from perf_staff where id = p_staff_id and active;
  end if;
  if s.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('week_start', w, 'numbers', perf_core(s, w, w + 6)) order by w), '[]')
      into weeks
    from (select (w_end - 7 * k)::date w from generate_series(0, n - 1) k) x;
  end if;

  return jsonb_build_object(
    'data_through', last_d,
    'roster', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.display_name, 'branch', r.branch,
                 'dept', r.dept, 'level', r.level) order by r.branch, r.dept desc, r.display_name), '[]')
               from perf_staff r where r.active),
    'staff', case when s.id is not null then jsonb_build_object('id', s.id, 'name', s.display_name, 'branch', s.branch,
               'dept', s.dept, 'level', s.level) end,
    'weeks', coalesce(weeks, '[]')
  );
end $$;
grant execute on function perf_weeks(uuid, uuid, int) to anon;
