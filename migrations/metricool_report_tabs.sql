-- Social page tabs (Kate, 6 Oct 2026: "whatever reporting Metricool has should show here
-- too"). Applied live on 6 Oct 2026. Overview plus a report a platform; see social.js.
--
-- metricool-sync now also fills:
--   metricool_posts.extra   per-post extras: reel watch time and skip rate, TikTok watch
--                           time and where views came from, story taps and exits.
--   metricool_posts         stories too (kind 'story'), Instagram and Facebook.
--   metricool_snapshots     audience (age, gender, country, city) and best time to post,
--                           Metricool's last 30 days, overwritten nightly. Facebook's
--                           audience isn't offered through the API; TikTok gives gender
--                           and country only.
--   metricool_daily         YouTube (on the Bahrain brand) and TikTok's daily follower change.
-- social_report sends series compact and stories as totals plus the 20 most seen, so 30
-- days is about 70 KB and a year about 300 KB. Hashtags are read off the full caption.
alter table public.metricool_posts add column if not exists extra jsonb;

create table if not exists public.metricool_snapshots (
  brand_id  bigint not null,
  network   text   not null,
  kind      text   not null,          -- gender age country city followersByCountry followersByCity besttime
  key       text   not null,          -- besttime: '<day 1 Mon..7 Sun>-<hour 0..23>', Dubai time
  value     numeric not null,
  as_from   date,
  as_to     date,
  synced_at timestamptz not null default now(),
  primary key (brand_id, network, kind, key)
);
alter table public.metricool_snapshots enable row level security;   -- no policies: read through social_report

CREATE OR REPLACE FUNCTION public.social_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Social is for Level 3 and above';
  end if;
  select jsonb_build_object(
    -- One array a series, [[date, value], ...], keyed "network|subject|metric".
    'series', (select coalesce(jsonb_object_agg(k, v), '{}') from (
        select d.network || '|' || d.subject || '|' || d.metric k, jsonb_agg(jsonb_build_array(d.date, d.value) order by d.date) v
        from metricool_daily d join metricool_brands b using (brand_id)
        where d.network <> 'gmb' and (b.branch is null or d.network = 'youtube') and d.date between p_from and p_to
        group by 1) s),
    'followers', (select coalesce(jsonb_object_agg(f.network, jsonb_build_object('start', f.s, 'end', f.e, 'end_date', f.ed)), '{}') from (
        select d.network,
          (select x.value from metricool_daily x where x.brand_id = d.brand_id and x.network = d.network and x.metric = d.metric and x.date < p_from order by x.date desc limit 1) s,
          (select x.value from metricool_daily x where x.brand_id = d.brand_id and x.network = d.network and x.metric = d.metric and x.date <= p_to order by x.date desc limit 1) e,
          (select x.date from metricool_daily x where x.brand_id = d.brand_id and x.network = d.network and x.metric = d.metric and x.date <= p_to order by x.date desc limit 1) ed
        from (select distinct d.brand_id, d.network, d.metric from metricool_daily d join metricool_brands b using (brand_id)
              where (b.branch is null or d.network = 'youtube') and d.metric in ('followers', 'followers_count', 'pageFollows', 'totalSubscribers')) d) f),
    -- Posts, reels and videos; stories come below as totals and the 20 most seen.
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('network', p.network, 'kind', p.kind, 'post_date', p.post_date, 'posted_at', p.posted_at,
                'caption', left(p.caption, 300), 'url', p.url, 'image_url', p.image_url, 'views', p.views, 'reach', p.reach, 'likes', p.likes,
                'comments', p.comments, 'shares', p.shares, 'saves', p.saves, 'interactions', p.interactions, 'extra', p.extra, 'tags', (select jsonb_agg(distinct lower(m[1])) from regexp_matches(coalesce(p.caption, ''), '(#[^\s#.,!?;:()"]+)', 'g') m)) order by p.posted_at desc), '[]')
              from metricool_posts p where p.kind <> 'story' and p.post_date between p_from and p_to),
    'stories', (select coalesce(jsonb_object_agg(s.network, s.o), '{}') from (
        select network, jsonb_build_object('n', count(*), 'reach', sum(reach), 'views', sum(views),
          'exits', sum((extra->>'exits')::numeric), 'taps_forward', sum((extra->>'taps_forward')::numeric),
          'taps_back', sum((extra->>'taps_back')::numeric), 'replies', sum((extra->>'replies')::numeric),
          'top', (select jsonb_agg(jsonb_build_object('post_date', t.post_date, 'url', t.url, 'image_url', t.image_url, 'reach', t.reach, 'views', t.views, 'extra', t.extra) order by t.reach desc nulls last)
                  from (select * from metricool_posts t where t.network = p.network and t.kind = 'story' and t.post_date between p_from and p_to order by t.reach desc nulls last limit 20) t)) o
        from metricool_posts p where p.kind = 'story' and p.post_date between p_from and p_to group by network) s),
    -- Audience and best time: {network: {kind: {key: value}}}, with the snapshot's dates.
    'snapshots', (select coalesce(jsonb_object_agg(n.network, n.kinds), '{}') from (
        select network, jsonb_object_agg(kind, jsonb_build_object('to', as_to, 'v', v)) kinds from (
          select network, kind, max(as_to) as_to, jsonb_object_agg(key, value) v from metricool_snapshots group by network, kind) k
        group by network) n),
    'web', jsonb_build_object(
        'total', (select sum(sessions) from ga4_daily where date between p_from and p_to),
        'channels', (select coalesce(jsonb_agg(c), '[]') from (select channel, sum(sessions) sessions, sum(engaged_sessions) engaged
                     from ga4_channel_daily where date between p_from and p_to group by channel) c)),
    'first_day', (select min(d.date) from metricool_daily d join metricool_brands b using (brand_id) where b.branch is null),
    'sync', (select to_jsonb(s) from sync_health s where name = 'metricool-sync')
  ) into out;
  return out;
end;
$function$;
revoke all on function public.social_report(date, date) from public, anon;
grant execute on function public.social_report(date, date) to authenticated;
