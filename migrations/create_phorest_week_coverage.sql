-- How many days of each Monday-to-Sunday week each branch has in Phorest's Staff
-- Daily upload (Kate, 1 Oct 2026, Comet 13W4).
--
-- Staff's Quarterly Performance drew every empty week the same grey, so a stylist
-- on leave and a week nobody had uploaded yet looked identical. Her sales on that
-- page come from phorest_staff_daily, so the honest test is whether her branch has
-- any Phorest rows that week: none means "not uploaded", some means she took
-- nothing (leave, days off). Separate from perf_year_weeks on purpose, so that
-- function is not replaced to add one field.
--
-- SECURITY INVOKER: the caller's own read access to phorest_staff_daily applies.
create or replace function public.phorest_week_coverage(p_from date, p_to date)
returns table (branch text, week_start date, days bigint)
language sql stable security invoker
set search_path = public
as $$
  select d.branch, date_trunc('week', d.date)::date as week_start, count(distinct d.date) as days
  from phorest_staff_daily d
  where d.date between p_from and p_to
  group by 1, 2
$$;

grant execute on function public.phorest_week_coverage(date, date) to authenticated, anon;
