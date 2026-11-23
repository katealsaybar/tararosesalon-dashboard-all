-- Facebook story numbers from Meta (Kate, 23 Nov 2026: "di raw nakukuha yung data neto so meta API na lang").
-- Metricool gives no views or reach for Facebook stories (84 stories since 1 Nov, none with a number). The Meta Graph API does, for a story while it is live:
--   STORY_MEDIA_VIEW (views), STORY_TOTAL_MEDIA_VIEW_UNIQUE (reach), PAGES_FB_STORY_REPLIES, PAGES_FB_STORY_THREAD_LIGHTWEIGHT_REACTIONS (reactions),
--   PAGES_FB_STORY_SHARES, STORY_INTERACTION. There are no taps forward, taps back or exits for Facebook stories.
-- Meta keeps a story for 24 hours and lists only live ones, so the edge function fb-story-stats (every 2 hours, pg_cron 'fb-story-stats') copies the numbers here while the story is live.
-- Numbers only grow, so a later run never writes a lower number. Stories from before 23 Nov 2026 were never captured and have none.
-- content_calendar_story_stats fills a Facebook story's views, reach, replies and reactions from this table (the nearest story in time, within 2 minutes) and adds shares and interactions.

create table if not exists public.fb_story_stats (
  post_id text primary key,
  posted_at timestamptz not null,
  status text,
  views integer,
  reach integer,
  replies integer,
  reactions integer,
  shares integer,
  interactions integer,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.fb_story_stats enable row level security;   -- no policies: only the edge function (service role) and the security-definer call below read it
create index if not exists fb_story_stats_posted_at on public.fb_story_stats (posted_at);

create or replace function public.content_calendar_story_stats(p_from date, p_to date, p_branch text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Story numbers are for Level 3 and above';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 93 then
    raise exception 'Ask for 93 days or fewer';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'network', p.network, 'posted_at', p.posted_at, 'url', p.url,
      'views', coalesce(p.views, fs.views), 'reach', coalesce(p.reach, fs.reach),
      'replies', coalesce(p.extra ->> 'replies', case when p.network = 'instagram' then p.comments::text end, fs.replies::text)::numeric,
      'reactions', case when p.network = 'facebook' then coalesce(p.likes, fs.reactions) end,
      'shares', fs.shares, 'interactions', fs.interactions,
      'taps_forward', (p.extra ->> 'taps_forward')::numeric,
      'taps_back', (p.extra ->> 'taps_back')::numeric,
      'exits', (p.extra ->> 'exits')::numeric,
      'media_path', m.storage_path, 'is_video', m.is_video, 'no_file', coalesce(m.no_file, false)) order by p.posted_at)
    from public.metricool_posts p
    left join lateral (
      select sm.storage_path, sm.is_video, sm.no_file from public.story_media sm
      where sm.network = p.network
        and ((p.network = 'instagram' and sm.story_key is not null and p.url like '%/' || sm.story_key)
          or abs(extract(epoch from sm.posted_at - p.posted_at)) < 120)
      order by (p.network = 'instagram' and sm.story_key is not null and p.url like '%/' || sm.story_key) desc, abs(extract(epoch from sm.posted_at - p.posted_at)) asc, sm.saved_at desc limit 1) m on true
    left join lateral (
      select f.views, f.reach, f.replies, f.reactions, f.shares, f.interactions from public.fb_story_stats f
      where p.network = 'facebook' and upper(coalesce(p_branch, '')) <> 'BAH' and abs(extract(epoch from f.posted_at - p.posted_at)) < 120
      order by abs(extract(epoch from f.posted_at - p.posted_at)) asc limit 1) fs on true
    where p.brand_id in (select x.brand_id from public.metricool_brands x where case when upper(coalesce(p_branch, '')) = 'BAH' then x.branch = 'BAH' else x.branch is null end) and p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between p_from and p_to
  ), '[]'::jsonb);
end $$;
-- grants stay as they were (signed-in users only)

-- Every 2 hours at :20 (a story lives 24 hours, so the last read is at most 2 hours before it goes). Bearer = the dashboard anon key, as the other syncs.
select cron.schedule('fb-story-stats', '20 */2 * * *', $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/fb-story-stats',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the dashboard anon key>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 100000);
$$);
