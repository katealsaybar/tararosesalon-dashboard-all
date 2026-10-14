-- Kate, 14 Oct 2026: perf_refresh_started_on() (pg_cron perf-started-on-nightly, 17:30 UTC) takes each staff member's first Phorest
-- or ledger day BY NAME, with no branch filter. Marasy (MRY) staff share names with people who later worked at Saadiyat, Khalifa City A
-- and Motor City, so its 2021 to 2022 rows would have pulled their start dates back (dry run: Eds Asuncion 4 Jan 2023 to 2 Jul 2021,
-- Robyn Hart 20 Sep 2022 to 9 Jan 2022). Both sub-selects now leave MRY out, so a start date stays the first day at a branch that is
-- still open. Dry run with the filter: 0 of 48 active staff change. Applied to gvijxenafoowajqktqvd before the first run with Marasy loaded.
CREATE OR REPLACE FUNCTION public.perf_refresh_started_on()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update perf_staff s set started_on = least(
    (select min(date) from phorest_staff_daily
      where employee_name = s.phorest_name and not is_total and coalesce(visits,0) > 0 and branch <> 'MRY'),
    (select min(date) from branch_staff_daily
      where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and coalesce(total,0) > 0 and branch <> 'MRY'))
  where s.active;
$function$;
