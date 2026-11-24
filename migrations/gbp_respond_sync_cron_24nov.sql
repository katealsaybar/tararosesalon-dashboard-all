-- Two cron jobs added 24 Nov 2026 (Kate: "synced like Phorest is": 1am, 9am, 11am, 1pm, 5pm and 9pm Dubai, which is 21, 5, 7, 9, 13 and 17 UTC).
-- Each runs a few minutes after the Phorest sync (minute 0) and Metricool reviews (job 70, minute 2), in this order:
--   :02 job 70  google-reviews-sync-with-phorest        metricool-sync, reviews only
--   :05 job 73  gbp-reviews-sync-with-phorest           gbp-reviews-sync (Google Business Profile API), {"apply": true}
--   :08 job 71  complaint-google-pull-with-phorest      cq_google_pull()
--   :10 job 74  respond-complaint-sync-with-phorest     respond-complaint-sync (respond.io chats), body {}
-- The key below is the service role key, the same one jobs 7 and 70 carry. It is NOT kept in this file: the live jobs were created by copying the
-- Bearer value out of job 70's command inside SQL (select substring(command from 'Bearer ([A-Za-z0-9_\-\.]+)') from cron.job where jobid = 70).
-- If that key is ever rotated, jobs 73 and 74 must be updated with the others.
select cron.schedule('gbp-reviews-sync-with-phorest', '5 5,7,9,13,17,21 * * *', $c$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/gbp-reviews-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
    body := '{"apply":true}'::jsonb,
    timeout_milliseconds := 150000);
$c$);
select cron.schedule('respond-complaint-sync-with-phorest', '10 5,7,9,13,17,21 * * *', $c$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/respond-complaint-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 200000);
$c$);
-- Secrets the functions read (Supabase, Edge Functions, Secrets):
--   gbp-reviews-sync          GBP_CLIENT_ID, GBP_REVIEWS_SYNC (the OAuth client secret), GBP_REFRESH_TOKEN (issued to kate@ for the Google Cloud project trs-reviews-sync, consent screen Internal)
--   respond-complaint-sync    RESPOND_TOKEN, ANTHROPIC_API_KEY
--   complaint-client-match    RESPOND_TOKEN
-- Backup taken before the first apply of gbp-reviews-sync: table google_reviews_backup_20261124 (2,784 rows). Drop it when no longer needed.
