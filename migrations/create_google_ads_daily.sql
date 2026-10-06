-- Google Ads daily numbers (Kate, 6 Oct 2026). Applied live on 6 Oct 2026., the first page of the dashboard's
-- Marketing group. The google-ads-sync edge function reads the Tara Rose Salon ad
-- account (527-185-0552, AED, Asia/Dubai) through the Google Ads API with the
-- TRS Marketing Reports Cloud project (Explorer access; no developer token since
-- Google dropped it on 9 Sep 2026) and upserts one row per campaign per day.
-- Nightly it re-reads the last 30 days, because Google keeps adding conversions
-- to past days. Each run marks sync_health 'google-ads-sync'.
--
-- "Conversions" is Google's own count, not bookings: on 6 Oct some campaigns showed
-- more conversions than clicks (Khalifa City 64 from 58), so the page labels it as
-- Google's count until Kate knows which actions are being counted.
create table if not exists google_ads_daily (
  date          date    not null,
  campaign_id   text    not null,
  campaign_name text    not null,
  status        text,
  channel       text,
  cost          numeric not null default 0,   -- AED
  impressions   int     not null default 0,
  clicks        int     not null default 0,
  conversions   numeric not null default 0,
  conv_value    numeric not null default 0,
  synced_at     timestamptz not null default now(),
  primary key (date, campaign_id)
);
alter table google_ads_daily enable row level security;   -- no policies: read through google_ads_report only

-- Which salon a campaign is for, read off its name. Brand and Hair Services
-- campaigns cover a city, not one salon. The F1 Bahrain ones were recruitment.
create or replace function public.gads_area(n text) returns text
language sql immutable as $$
  select case
    when n ~* 'bahrain'                      then 'BH'
    when n ~* 'al ?quoz'                     then 'AQ'
    when n ~* 'motor ?city'                  then 'MC'
    when n ~* 'khalifa'                      then 'KCA'
    when n ~* 'saadiyat|mamsha'              then 'SAA'
    when n ~* 'abu ?dhabi'                   then 'AUH'
    when n ~* 'dubai'                        then 'DXB'
    else 'OTHER' end
$$;

-- One call for the page: per-day totals, per-campaign totals and the sync mark.
-- Level 3 and above, read from dashboard_me() like lost_clients.
create or replace function public.google_ads_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Google Ads is for Level 3 and above';
  end if;
  select jsonb_build_object(
    'days', (select coalesce(jsonb_agg(d order by d.date), '[]') from (
        select date, sum(cost) cost, sum(clicks) clicks, sum(impressions) impressions, sum(conversions) conversions
        from google_ads_daily where date between p_from and p_to group by date) d),
    'campaigns', (select coalesce(jsonb_agg(c order by c.cost desc), '[]') from (
        select campaign_id, max(campaign_name) campaign_name, gads_area(max(campaign_name)) area,
               (array_agg(status order by date desc))[1] status, max(channel) channel,
               sum(cost) cost, sum(clicks) clicks, sum(impressions) impressions, sum(conversions) conversions
        from google_ads_daily where date between p_from and p_to
        group by campaign_id having sum(impressions) > 0) c),
    'first_day', (select min(date) from google_ads_daily),
    'sync', (select to_jsonb(s) from sync_health s where name = 'google-ads-sync')
  ) into out;
  return out;
end;
$function$;
revoke all on function public.google_ads_report(date, date) from public, anon;
grant execute on function public.google_ads_report(date, date) to authenticated;

-- Nightly at 03:00 Dubai (23:00 UTC), the last 30 days. Same call shape as
-- ig-tags-sync-nightly (Bearer = the dashboard anon key). Scheduled live on 6 Oct 2026
-- after the first run (from 1 Jan 2025, 1,913 rows).
select cron.schedule('google-ads-sync-nightly', '0 23 * * *', $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/google-ads-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the dashboard anon key>'),
    body := '{"days":30}'::jsonb,
    timeout_milliseconds := 120000);
$$);
