-- Meta Ads page (Kate, 2 Nov 2026): its own page in the Content group, after Google Ads, like Google Ads.
-- Additive only: meta_ads_daily (spend, invoice and Metricool) and marketing_spend_report are untouched.
--
-- meta_ads_metrics_daily  account-level views, clicks and reach per day, from the Metricool facebookads timelines
--                         (meta-ads-sync). Metricool has this ad account from 22 Apr 2026 only.
-- meta_ads_campaign_daily one row per campaign per day, from Metricool /stats/facebookads/campaigns read one day at a time
--                         (spent, impressions, clicks, results). A day is only written when the campaigns add up to the
--                         account's own spend for that day, so a window total can never land on one day.
-- meta_ads_report()       the page's one call: per-day spend (invoice first, as Marketing Spend), views and clicks, per-campaign
--                         totals, the sync mark. Level 3 and above, like google_ads_report.
-- meta_ads_campaign()     one campaign's days, for the row that is opened.
-- "Results" is Meta's own count for the campaign's objective (a chat widget form sent, for the Leads campaigns), not bookings.
create table if not exists meta_ads_metrics_daily (
  date      date    not null,
  metric    text    not null,                -- impressions, clicks, reach
  value     numeric not null default 0,
  synced_at timestamptz not null default now(),
  primary key (date, metric)
);
create table if not exists meta_ads_campaign_daily (
  date          date    not null,
  campaign_id   text    not null,
  campaign_name text    not null,
  status        text,                         -- as Meta had it at the last sync (ACTIVE, PAUSED)
  objective     text,
  spend         numeric not null default 0,   -- AED
  impressions   int     not null default 0,
  clicks        int     not null default 0,
  results       numeric not null default 0,
  results_label text,
  synced_at     timestamptz not null default now(),
  primary key (date, campaign_id)
);
alter table meta_ads_metrics_daily  enable row level security;   -- no policies: read through meta_ads_report only
alter table meta_ads_campaign_daily enable row level security;

create or replace function public.meta_ads_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Meta Ads is for Level 3 and above';
  end if;
  select jsonb_build_object(
    'days', (select coalesce(jsonb_agg(d order by d.date), '[]') from (
        select x.date, coalesce(s.spend, 0) as cost, coalesce(m.impressions, 0) as impressions, coalesce(m.clicks, 0) as clicks, coalesce(m.reach, 0) as reach
        from (select date from meta_ads_daily where date between p_from and p_to
              union select date from meta_ads_metrics_daily where date between p_from and p_to) x
        left join (select distinct on (date) date, spend from meta_ads_daily where date between p_from and p_to
                   order by date, (source = 'invoice') desc) s on s.date = x.date
        left join (select date,
                          sum(value) filter (where metric = 'impressions') as impressions,
                          sum(value) filter (where metric = 'clicks') as clicks,
                          sum(value) filter (where metric = 'reach') as reach
                   from meta_ads_metrics_daily where date between p_from and p_to group by date) m on m.date = x.date) d),
    'campaigns', (select coalesce(jsonb_agg(c order by c.cost desc), '[]') from (
        select campaign_id, (array_agg(campaign_name order by date desc))[1] campaign_name,
               (array_agg(status order by date desc))[1] status, (array_agg(objective order by date desc))[1] objective,
               (array_agg(results_label order by date desc) filter (where results_label is not null))[1] results_label,
               sum(spend) cost, sum(clicks) clicks, sum(impressions) impressions, sum(results) results,
               min(date) filter (where spend > 0) first_day, max(date) filter (where spend > 0) last_day
        from meta_ads_campaign_daily where date between p_from and p_to
        group by campaign_id having sum(spend) > 0 or sum(impressions) > 0) c),
    'first_day', (select min(date) from meta_ads_daily),
    'first_metric_day', (select min(date) from meta_ads_metrics_daily),
    'last_spend_day', (select max(date) from meta_ads_daily where spend > 0),
    'sync', (select to_jsonb(s) from sync_health s where name = 'meta-ads-sync')
  ) into out;
  return out;
end;
$function$;
revoke all on function public.meta_ads_report(date, date) from public, anon;
grant execute on function public.meta_ads_report(date, date) to authenticated;

create or replace function public.meta_ads_campaign(p_campaign_id text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Meta Ads is for Level 3 and above';
  end if;
  select jsonb_build_object(
    'days', (select coalesce(jsonb_agg(d order by d.date), '[]') from (
        select date, spend as cost, clicks, impressions, results
        from meta_ads_campaign_daily where campaign_id = p_campaign_id and date between p_from and p_to) d),
    'first_day', (select min(date) from meta_ads_campaign_daily where campaign_id = p_campaign_id and spend > 0),
    'last_day',  (select max(date) from meta_ads_campaign_daily where campaign_id = p_campaign_id and spend > 0)
  ) into out;
  return out;
end;
$function$;
revoke all on function public.meta_ads_campaign(text, date, date) from public, anon;
grant execute on function public.meta_ads_campaign(text, date, date) to authenticated;

-- Nightly: the existing meta-ads-sync-nightly cron (23:30 UTC, last 10 days) now also fills these two tables.
