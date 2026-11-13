-- Content Calendar, Manual vs Scheduled in Metricool, and carousels (Kate, 13 Nov 2026).
-- Found while probing the Meta API (13 Nov): every Instagram and Facebook post is already in metricool_posts (Metricool reads the account itself, so Hanneh's manual posts are there),
-- but a carousel is stored as kind 'post' and nothing says whether a post was scheduled in Metricool or posted by hand. The meta-posts-sync edge function (nightly, after metricool-sync) fills these:
--   source        'metricool' when the post's live url is in Metricool's scheduler list (/v2/scheduler/posts, providers[].publicUrl), else 'manual'
--   media_type    from the Instagram Graph API: 'carousel', 'image', 'reel', 'video' (the kind column is left alone, metricool-sync owns it)
--   slides        how many pictures or videos a carousel has
-- metricool-sync never writes these columns, so its nightly upsert does not undo them.
alter table public.metricool_posts add column if not exists source text check (source in ('manual', 'metricool'));
alter table public.metricool_posts add column if not exists media_type text;
alter table public.metricool_posts add column if not exists slides integer;
alter table public.metricool_posts add column if not exists source_checked_at timestamptz;

-- The public calendar call now also sends source, carousel and slides (labels only, nothing private).
create or replace function public.content_calendar_posts(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare out jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 93 then
    raise exception 'Ask for 93 days or fewer';
  end if;
  select jsonb_build_object(
    'posts', (select coalesce(jsonb_agg(jsonb_build_object(
        'network', p.network, 'kind', p.kind, 'post_date', p.post_date, 'posted_at', p.posted_at,
        'caption', left(p.caption, 300), 'url', p.url, 'image_url', p.image_url,
        'likes', p.likes, 'comments', p.comments,
        'views', case when p.kind in ('reel', 'video') then p.views end,
        'shares', case when p.network <> 'instagram' then p.shares end,
        'extra', case when p.network = 'instagram' and p.kind = 'reel' then jsonb_build_object('reposts', p.extra -> 'reposts') else '{}'::jsonb end,
        'source', p.source,
        'carousel', coalesce(p.media_type = 'carousel', false),
        'slides', case when p.media_type = 'carousel' then p.slides end
      ) order by p.posted_at desc), '[]'::jsonb)
      from metricool_posts p
      where p.kind <> 'story' and p.network in ('instagram', 'facebook', 'tiktok') and p.post_date between p_from and p_to),
    'snapshots', (select coalesce(jsonb_object_agg(n.network, n.kinds), '{}'::jsonb) from (
        select network, jsonb_object_agg(kind, jsonb_build_object('to', as_to, 'v', v)) kinds from (
          select network, kind, max(as_to) as_to, jsonb_object_agg(key, value) v
          from metricool_snapshots where kind = 'besttime' group by network, kind) k
        group by network) n),
    'sync', (select jsonb_build_object('last_ok_at', s.last_ok_at) from sync_health s where s.name = 'metricool-sync')
  ) into out;
  return out;
end $$;
-- content_calendar_stories is unchanged: a story has no Manual or Scheduled label and no carousel.

-- Nightly at 03:40 Dubai (23:40 UTC), twenty minutes after metricool-sync so the rows it labels are today's. 45 days back.
-- Bearer = the dashboard anon key, as the other syncs. Applied live on 13 Nov 2026 (first run over 100 days labelled 131 rows).
select cron.schedule('meta-posts-sync-nightly', '40 23 * * *', $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/meta-posts-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the dashboard anon key>'),
    body := '{"days":45}'::jsonb,
    timeout_milliseconds := 150000);
$$);
