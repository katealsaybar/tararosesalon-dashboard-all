-- Kate, 17 Nov 2026 ("Yes, automate"): the CV reader for Preferred location runs by itself.
--  * recruit_applicants.pref_cv_read: the cv_file the reader last read for that person (a new CV attached later has a different path, so it is read again)
--  * internal_secrets recruit_cv_pref_cron: the secret the cron sends as x-cron-secret (value created in the database, never in a file)
--  * cron recruit-cv-pref every 10 minutes: posts { auto: true } to the edge function recruit-cv-pref, which picks the next 4 unread CVs
--  * the 50 people read by hand on 17 Nov 2026 are marked as read
-- Undo: select cron.unschedule('recruit-cv-pref'); delete from public.internal_secrets where name = 'recruit_cv_pref_cron'; alter table public.recruit_applicants drop column pref_cv_read.

alter table public.recruit_applicants add column if not exists pref_cv_read text;

insert into public.internal_secrets (name, value)
select 'recruit_cv_pref_cron', gen_random_uuid()::text
 where not exists (select 1 from public.internal_secrets where name = 'recruit_cv_pref_cron');

select cron.unschedule('recruit-cv-pref') where exists (select 1 from cron.job where jobname = 'recruit-cv-pref');
select cron.schedule('recruit-cv-pref', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/recruit-cv-pref',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.internal_secrets where name='recruit_cv_pref_cron')),
    body := '{"auto":true}'::jsonb,
    timeout_milliseconds := 90000);
$cron$);
