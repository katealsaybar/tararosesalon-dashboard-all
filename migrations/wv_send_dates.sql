-- Launched and finished dates per sub-wave on the Send a wave panel (Kate, 16 Oct 2026). Applied live; this file is the record.
--   launched_at = when the first job of the wave was queued
--   finished_at = the last done time, once nothing is waiting (null while it is still going)
--   by_hand     = true when every job was a wave sent by hand in GHL before the site button (the page then shows the day only)
-- The waves sent by hand have no queue time of their own, so their queue time is set to the time recorded for them (the day is right, the time is approximate).
update public.wv_send_jobs set requested_at = done_at where note = 'before the site button' and done_at is not null;

-- wv_send_info() is replaced with the three extra fields in 'waves'; everything else in it is as in wv_send.sql:
--   max(j.done_at) as last_at,
--   min(j.requested_at) as launched_at,
--   case when count(j.id) > 0 and count(*) filter (where j.status in ('queued', 'sending')) = 0 then max(j.done_at) end as finished_at,
--   coalesce(bool_and(j.note = 'before the site button'), false) as by_hand
-- (see the function in the database; select pg_get_functiondef('public.wv_send_info'::regproc))
