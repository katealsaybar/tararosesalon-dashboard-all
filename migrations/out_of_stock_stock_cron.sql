-- Out of Stock: the shelf figures refresh by themselves (Kate, 26 Nov 2026: "i-schedule na yung auto refresh every 30 minutes").
-- APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (cron job 76 oos-stock-refresh). Builds on out_of_stock_stock_apply.sql and the edge function oos-stock-refresh (v2).
--
-- Every 30 minutes from 4:00 to 17:30 UTC (8:00 am to 9:30 pm Dubai) pg_cron calls the edge function for all four UAE salons. Each run is about 22 Phorest
-- calls and writes only in_stock, min_stock, max_stock and loaded_at of today's snapshot. The function refuses a salon it read less than 30 seconds ago and
-- any read under 70% of the Stock List. The daily 7 am PDF sync on Kate's PC stays: it writes the brand, category, cost and price, and is the safety net.
--
-- The call carries the project's public key in Authorization (the gateway needs a JWT, copied from an existing job's command at run time, never typed here)
-- and the header x-cron-secret, which the function compares with the row oos_stock_refresh_cron of internal_secrets (service role only; its value is created
-- below and never written in this file). Same pattern as appointments-sync.
--
-- To pause:  select cron.unschedule('oos-stock-refresh');

insert into public.internal_secrets (name, value)
values ('oos_stock_refresh_cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

do $$
declare k text;
begin
  select substring(command from 'Bearer ([A-Za-z0-9._-]+)') into k from cron.job where jobid = 62;   -- shifts-sync, which already carries the project key
  if k is null then raise exception 'could not read the project key from an existing job'; end if;
  perform cron.schedule('oos-stock-refresh', '*/30 4-17 * * *',
    format($c$select net.http_post(url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/oos-stock-refresh', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s','x-cron-secret',(select value from public.internal_secrets where name='oos_stock_refresh_cron')), body := '{"auto":true,"salons":["KCA","SAA","MC","AQ"]}'::jsonb, timeout_milliseconds := 120000);$c$, k));
end $$;
