-- Metricool on the dashboard (Kate, 6 Oct 2026). Tara wants the whole business in one
-- place, so the social and Google profile numbers Metricool already collects come in
-- here rather than Metricool going on the site. Plan Advanced 15 includes the API; the
-- token is the Supabase secret METRICOOL_USER_TOKEN (userId 4877991).
--
-- The metricool-sync edge function fills three tables nightly:
--   metricool_brands  every brand on the account, with its salon. Metricool allows one
--                     Google Business Profile per brand, so each salon's profile is a
--                     brand of its own; the main brand (@tararosesalon) holds Instagram,
--                     TikTok and the Facebook page. A new brand (Khalifa City is not
--                     connected yet) is picked up by itself on the next run.
--   metricool_daily   one value per brand, network, subject, metric and day (Dubai).
--                     Follower counts are levels; everything else is that day's count.
--   metricool_posts   one row per Instagram post or reel, TikTok video or photo, and
--                     Facebook post or reel, with its latest numbers.
-- Two report functions read them: social_report (the Social page, Level 3+, like
-- Google Ads) and gbp_report (the strip on the Google Reviews page, anyone signed in,
-- like the reviews themselves).
create table if not exists metricool_brands (
  brand_id   bigint primary key,
  label      text not null,
  branch     text,                     -- SAA KCA MC AQ BAH, null for the main brand
  networks   jsonb not null default '{}',
  synced_at  timestamptz not null default now()
);
alter table metricool_brands enable row level security;   -- no policies: read through the reports

create table if not exists metricool_daily (
  date       date    not null,
  brand_id   bigint  not null,
  network    text    not null,         -- instagram tiktok facebook gmb
  subject    text    not null default '',
  metric     text    not null,
  value      numeric not null default 0,
  synced_at  timestamptz not null default now(),
  primary key (date, brand_id, network, subject, metric)
);
alter table metricool_daily enable row level security;

create table if not exists metricool_posts (
  post_key     text primary key,        -- network:kind:id
  brand_id     bigint not null,
  network      text not null,
  kind         text not null,           -- post reel video photo
  posted_at    timestamptz,
  post_date    date,                    -- Dubai
  caption      text,
  url          text,
  image_url    text,
  views        numeric,
  reach        numeric,
  likes        numeric,
  comments     numeric,
  shares       numeric,
  saves        numeric,
  interactions numeric,
  synced_at    timestamptz not null default now()
);
create index if not exists metricool_posts_date on metricool_posts (post_date);
alter table metricool_posts enable row level security;

-- The Social page: the main brand's daily rows, follower levels either side of the
-- dates, the posts made in them and the sync mark. Level 3 and above.
create or replace function public.social_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Social is for Level 3 and above';
  end if;
  select jsonb_build_object(
    'days', (select coalesce(jsonb_agg(jsonb_build_object('date', d.date, 'network', d.network, 'subject', d.subject,
                'metric', d.metric, 'value', d.value) order by d.date), '[]')
             from metricool_daily d join metricool_brands b using (brand_id)
             where b.branch is null and d.network <> 'gmb' and d.date between p_from and p_to
               and d.metric not in ('followers', 'followers_count', 'pageFollows')),
    -- Follower counts: the last level on or before the day before the dates, and on or before the last day.
    'followers', (select coalesce(jsonb_object_agg(f.network, jsonb_build_object('start', f.s, 'end', f.e, 'end_date', f.ed)), '{}') from (
        select d.network,
          (select x.value from metricool_daily x where x.brand_id = d.brand_id and x.network = d.network and x.metric = d.metric and x.date < p_from order by x.date desc limit 1) s,
          (select x.value from metricool_daily x where x.brand_id = d.brand_id and x.network = d.network and x.metric = d.metric and x.date <= p_to order by x.date desc limit 1) e,
          (select x.date from metricool_daily x where x.brand_id = d.brand_id and x.network = d.network and x.metric = d.metric and x.date <= p_to order by x.date desc limit 1) ed
        from (select distinct d.brand_id, d.network, d.metric from metricool_daily d join metricool_brands b using (brand_id)
              where b.branch is null and d.metric in ('followers', 'followers_count', 'pageFollows')) d) f),
    'posts', (select coalesce(jsonb_agg(to_jsonb(p) - 'brand_id' - 'synced_at' order by p.posted_at desc), '[]')
              from metricool_posts p where p.post_date between p_from and p_to),
    'first_day', (select min(d.date) from metricool_daily d join metricool_brands b using (brand_id) where b.branch is null),
    'sync', (select to_jsonb(s) from sync_health s where name = 'metricool-sync')
  ) into out;
  return out;
end;
$function$;
revoke all on function public.social_report(date, date) from public, anon;
grant execute on function public.social_report(date, date) to authenticated;

-- The Google Reviews page's strip: each salon's Google profile numbers over the dates.
-- Anyone on the dashboard list, as the reviews page itself.
create or replace function public.gbp_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  select jsonb_build_object(
    'branches', (select coalesce(jsonb_agg(r order by r.branch), '[]') from (
        select b.branch, b.label,
          sum(d.value) filter (where d.metric = 'business_impressions_total') seen,
          sum(d.value) filter (where d.metric = 'business_impressions_search') seen_search,
          sum(d.value) filter (where d.metric = 'business_impressions_maps') seen_maps,
          sum(d.value) filter (where d.metric = 'call_clicks') calls,
          sum(d.value) filter (where d.metric = 'business_direction_requests') directions,
          sum(d.value) filter (where d.metric = 'website_clicks') website,
          min(d.date) first_date, max(d.date) last_date
        from metricool_brands b
        left join metricool_daily d on d.brand_id = b.brand_id and d.network = 'gmb' and d.date between p_from and p_to
        where b.branch is not null and b.networks ? 'gmb'
        group by b.branch, b.label) r),
    'sync', (select to_jsonb(s) from sync_health s where name = 'metricool-sync')
  ) into out;
  return out;
end;
$function$;
revoke all on function public.gbp_report(date, date) from public, anon;
grant execute on function public.gbp_report(date, date) to authenticated;

-- Nightly at 03:20 Dubai (23:20 UTC), after Google Ads and the website. The last 10
-- days, because the apps report two to three days late and keep adding to recent posts.
-- Bearer = the dashboard anon key, as the other syncs.
select cron.schedule('metricool-sync-nightly', '20 23 * * *', $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/metricool-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the dashboard anon key>'),
    body := '{"days":10}'::jsonb,
    timeout_milliseconds := 150000);
$$);
