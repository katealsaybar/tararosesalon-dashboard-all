-- Website & Search (Kate, 6 Oct 2026), the second page of the dashboard's Marketing
-- group. Applied live on 6 Oct 2026. The website-sync edge function reads with the
-- same sign-in as google-ads-sync (secrets GOOGLE_CLIENT_ID / _SECRET / _REFRESH_TOKEN,
-- Cloud project trs-marketing-reports):
--   Google Analytics 4, property 424039157 ("TRS - AE / tararosesalon.com", the live
--     one; 344989924 stopped collecting on 23 Aug 2026), from 1 Jan 2025:
--     ga4_daily (one row a day), ga4_channel_daily (where visits came from),
--     ga4_page_daily (views per page).
--   Search Console, sc-domain:tararosesalon.com (every version of the site), from
--     24 May 2025, the furthest back Google keeps: gsc_daily (one row a day) and
--     gsc_query_daily (what people searched). Search Console runs 2 to 3 days behind.
--     Queries with no click and under 5 views in a day are not kept: they are most
--     of the rows and none of the reading.
-- Nightly it re-reads the last 10 days, since both keep filling in. Each run marks
-- sync_health 'website-sync'. GA4's "key events" are left out: like the Ads
-- conversions they outnumber visits on some channels, so they are not enquiries.
create table if not exists ga4_daily (
  date date primary key,
  sessions int not null default 0, users int not null default 0,
  new_users int not null default 0, engaged_sessions int not null default 0,
  synced_at timestamptz not null default now());
create table if not exists ga4_channel_daily (
  date date not null, channel text not null,
  sessions int not null default 0, engaged_sessions int not null default 0,
  synced_at timestamptz not null default now(),
  primary key (date, channel));
create table if not exists ga4_page_daily (
  date date not null, page text not null,
  views int not null default 0,
  synced_at timestamptz not null default now(),
  primary key (date, page));
create table if not exists gsc_daily (
  date date primary key,
  clicks int not null default 0, impressions int not null default 0, position numeric,
  synced_at timestamptz not null default now());
create table if not exists gsc_query_daily (
  date date not null, query text not null,
  clicks int not null default 0, impressions int not null default 0, position numeric,
  synced_at timestamptz not null default now(),
  primary key (date, query));
alter table ga4_daily enable row level security;
alter table ga4_channel_daily enable row level security;
alter table ga4_page_daily enable row level security;
alter table gsc_daily enable row level security;
alter table gsc_query_daily enable row level security;

-- One call for the page. Level 3 and above, like google_ads_report.
create or replace function public.website_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Website & Search is for Level 3 and above';
  end if;
  select jsonb_build_object(
    'days', (select coalesce(jsonb_agg(d order by d.date), '[]') from (
        select date, sessions, users, new_users, engaged_sessions from ga4_daily
        where date between p_from and p_to) d),
    'channels', (select coalesce(jsonb_agg(c order by c.sessions desc), '[]') from (
        select channel, sum(sessions) sessions, sum(engaged_sessions) engaged_sessions
        from ga4_channel_daily where date between p_from and p_to
        group by channel having sum(sessions) > 0) c),
    'pages', (select coalesce(jsonb_agg(p order by p.views desc), '[]') from (
        select page, sum(views) views from ga4_page_daily
        where date between p_from and p_to group by page order by sum(views) desc limit 20) p),
    'search_days', (select coalesce(jsonb_agg(g order by g.date), '[]') from (
        select date, clicks, impressions, position from gsc_daily
        where date between p_from and p_to) g),
    'queries', (select coalesce(jsonb_agg(q order by q.clicks desc, q.impressions desc), '[]') from (
        select query, sum(clicks) clicks, sum(impressions) impressions,
               round(sum(position * impressions) / nullif(sum(impressions), 0), 1) position
        from gsc_query_daily where date between p_from and p_to
        group by query order by sum(clicks) desc, sum(impressions) desc limit 25) q),
    'search_last_day', (select max(date) from gsc_daily),
    'sync', (select to_jsonb(s) from sync_health s where name = 'website-sync')
  ) into out;
  return out;
end;
$function$;
revoke all on function public.website_report(date, date) from public, anon;
grant execute on function public.website_report(date, date) to authenticated;

-- Nightly at 03:10 Dubai (23:10 UTC), after google-ads-sync. Same call shape
-- (Bearer = the dashboard anon key).
select cron.schedule('website-sync-nightly', '10 23 * * *', $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/website-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the dashboard anon key>'),
    body := '{"days":10}'::jsonb,
    timeout_milliseconds := 150000);
$$);
