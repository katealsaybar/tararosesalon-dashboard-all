-- Lost Clients campaign lists: the nightly jobs (Kate, 9 Oct 2026). Already applied; this is the record.
-- 21:50 UTC (01:50 Dubai): rebuild the client table (lost_lists_refresh, about 40 seconds).
-- 22:00 to 22:59 UTC: every minute, one short run of the respond-status-sync edge function. A run checks
-- up to a few hundred numbers (oldest first, none checked in the last 20 hours), so the first dozens of
-- minutes do the work and the rest find nothing to do. Bookings are not part of this: the lists read
-- client_bookings live, so a fresh Staff Appointments push shows at once.
select cron.schedule('lost-lists-refresh-nightly', '50 21 * * *', $$ select public.lost_lists_refresh(); $$);
select cron.schedule('respond-status-sync-nightly', '* 22 * * *', $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/respond-status-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the project anon key, as the other nightly jobs use>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$$);
