-- Google Ads campaign detail (Kate, 6 Oct 2026: "each campaign should be clickable,
-- there's no info"). Applied live on 6 Oct 2026. google-ads-sync also keeps, per day
-- and campaign:
--   google_ads_keyword_daily      the keywords we bid on (keyword_view), summed across
--                                 ad groups, only days with impressions;
--   google_ads_search_term_daily  what people actually typed (search_term_view), only
--                                 searches that got a click: the rest are ~90% of the
--                                 rows and none of the reading.
-- Performance Max campaigns have neither; the page says so.
create table if not exists google_ads_keyword_daily (
  date date not null, campaign_id text not null, keyword text not null, match_type text not null,
  cost numeric not null default 0, impressions int not null default 0, clicks int not null default 0,
  conversions numeric not null default 0, synced_at timestamptz not null default now(),
  primary key (date, campaign_id, keyword, match_type));
create table if not exists google_ads_search_term_daily (
  date date not null, campaign_id text not null, term text not null,
  cost numeric not null default 0, impressions int not null default 0, clicks int not null default 0,
  conversions numeric not null default 0, synced_at timestamptz not null default now(),
  primary key (date, campaign_id, term));
alter table google_ads_keyword_daily enable row level security;
alter table google_ads_search_term_daily enable row level security;

-- One campaign for the page's open row: its days, its top keywords and searches.
-- Level 3 and above, like google_ads_report.
create or replace function public.google_ads_campaign(p_campaign_id text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Google Ads is for Level 3 and above';
  end if;
  select jsonb_build_object(
    'first_day', (select min(date) from google_ads_daily where campaign_id = p_campaign_id and impressions > 0),
    'last_day',  (select max(date) from google_ads_daily where campaign_id = p_campaign_id and impressions > 0),
    'days', (select coalesce(jsonb_agg(d order by d.date), '[]') from (
        select date, cost, clicks, impressions, conversions from google_ads_daily
        where campaign_id = p_campaign_id and date between p_from and p_to) d),
    'keywords', (select coalesce(jsonb_agg(k order by k.cost desc), '[]') from (
        select keyword, match_type, sum(cost) cost, sum(clicks) clicks, sum(impressions) impressions, sum(conversions) conversions
        from google_ads_keyword_daily where campaign_id = p_campaign_id and date between p_from and p_to
        group by keyword, match_type order by sum(cost) desc, sum(clicks) desc limit 20) k),
    'terms', (select coalesce(jsonb_agg(t order by t.clicks desc), '[]') from (
        select term, sum(cost) cost, sum(clicks) clicks, sum(impressions) impressions, sum(conversions) conversions
        from google_ads_search_term_daily where campaign_id = p_campaign_id and date between p_from and p_to
        group by term order by sum(clicks) desc, sum(cost) desc limit 20) t)
  ) into out;
  return out;
end;
$function$;
revoke all on function public.google_ads_campaign(text, date, date) from public, anon;
grant execute on function public.google_ads_campaign(text, date, date) to authenticated;
