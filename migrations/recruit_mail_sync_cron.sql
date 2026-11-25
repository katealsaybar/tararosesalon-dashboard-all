-- Recruitment Replies: the schedule for the Gmail API reader (Kate, 25 Nov 2026). WRITTEN, NOT APPLIED. Run it only after the secret RECRUIT_GMAIL_REFRESH_TOKEN is set and a dry run of the
-- function (supabase/functions/recruit-mail-sync) has answered ok.
-- It runs the function every 5 minutes with the same bearer the other syncs use (the bearer is copied from the website-sync-nightly job inside the database, so it is never written in this file).
-- The function reads recruitment@ through the Gmail API (read only) and sends replies and hand-sent mail to recruit_tickets_import. It replaces the Apps Script ticket code, which was taken out again.
-- Undo: select cron.unschedule('recruit-mail-sync');

do $$
declare b text;
begin
  select substring(command from 'Bearer (eyJ[A-Za-z0-9._-]+)') into b from cron.job where jobname = 'website-sync-nightly';
  if b is null then raise exception 'could not find the bearer of website-sync-nightly'; end if;
  perform cron.schedule('recruit-mail-sync', '*/5 * * * *', format($c$
    select net.http_post(
      url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/recruit-mail-sync',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000);
  $c$, b));
end $$;
