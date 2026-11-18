-- Phorest sync watchdog (Kate, 18 Nov 2026). Applied live the same day.
-- The 9 pm timer call on 17 Nov got a 503 and nothing started or was logged. This re-asks 12 minutes after each slot if no run has started.
-- Slots (UTC): 05 morning, 07 day, 09 day, 13 day, 17 day, 21 night = 9 am, 11 am, 1 pm, 5 pm, 9 pm, 1 am Dubai.
-- Test without firing: select public.sync_watchdog(true);   Remove: select cron.unschedule('phorest-sync-watchdog');
create or replace function public.sync_watchdog(dry boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $fn$
declare h int := extract(hour from (now() at time zone 'utc'))::int; t text; recent int;
begin
  t := case h when 5 then 'morning' when 21 then 'night' when 7 then 'day' when 9 then 'day' when 13 then 'day' when 17 then 'day' else null end;
  if t is null then return 'not a sync hour (' || h || ' UTC)'; end if;
  select count(*) into recent from sync_runs where started_at > now() - interval '15 minutes' and status <> 'failed';
  if recent > 0 then return 'ok: a ' || t || ' run started in the last 15 minutes'; end if;
  if dry then return 'would ask for a ' || t || ' run: nothing started in the last 15 minutes'; end if;
  perform net.http_post(url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/sync-cron',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.internal_secrets where name='sync_cron')),
    body := jsonb_build_object('tier', t, 'source', 'watchdog'), timeout_milliseconds := 30000);
  return 'asked for a ' || t || ' run (watchdog)';
end $fn$;
revoke all on function public.sync_watchdog(boolean) from public, anon, authenticated;
select cron.schedule('phorest-sync-watchdog', '12 5,7,9,13,17,21 * * *', $c$select public.sync_watchdog();$c$);
-- Also live 18 Nov 2026: pg_cron job phorest-sync-11am ('0 7 * * *', tier day, same call as phorest-sync-1pm).
