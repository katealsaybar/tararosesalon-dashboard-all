-- Lost Clients tag sync, three times a day (Kate, 15 Oct 2026): 06:00, 10:00 and 14:00 UTC = 10:00, 14:00 and 18:00 Dubai. Applied live as job lost-tag-sync.
-- It only looks at clients the site sent a message to (lost_send_jobs), so it does nothing until the first send. Replace <anon key> with the project's anon key.
select cron.schedule('lost-tag-sync', '0 6,10,14 * * *', $cmd$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/lost-tag-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <anon key>'),
    body := '{"live":true,"source":"jobs"}'::jsonb,
    timeout_milliseconds := 60000);
$cmd$);
