-- Sync health (Kate, 5 Oct 2026). The Instagram token expired on 28 Sep and the
-- nightly ig-tags-sync kept "succeeding" in pg_cron (the HTTP call went out) while
-- every run came back "Session has expired", so nobody's posts counted for a week.
-- Each ig-tags-sync run now upserts its row here: last_run_at always, last_ok_at only
-- when both edges read cleanly, last_error the Graph message or null. perf_socials
-- passes last_ok_at to the page, and the socials card says counts are paused when it
-- is over 36 hours old. Already run live.
create table if not exists sync_health (
  name        text primary key,
  last_run_at timestamptz,
  last_ok_at  timestamptz,
  last_error  text
);
alter table sync_health enable row level security;

-- Seeded from the last good write before the token died.
insert into sync_health (name, last_run_at, last_ok_at, last_error)
select 'ig-tags-sync', now(), max(synced_at), 'Error validating access token: Session has expired on 28 Sep 2026'
from ig_tagged_posts
on conflict (name) do nothing;

create or replace function public.perf_socials(s perf_staff, d1 date, d2 date)
 returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with p as (
    select distinct on (media_id) media_id, posted_at, media_type, permalink, via from (
      select media_id, posted_at, media_type, permalink, 'tag' via, 1 pri from ig_tagged_posts
      where s.ig_handles is not null and lower(username) = any(s.ig_handles)
      union all
      select media_id, posted_at, null, permalink, 'collab', 2 from ig_collab_posts
      where s.ig_handles is not null and lower(username) = any(s.ig_handles)
    ) x
    where (posted_at at time zone 'Asia/Dubai')::date between greatest(d1, coalesce(perf_start_date(s), d1)) and d2
    order by media_id, pri
  ), m as (
    select mentioned_at from ig_story_mentions
    where s.ig_handles is not null and lower(username) = any(s.ig_handles)
      and (mentioned_at at time zone 'Asia/Dubai')::date between d1 and d2
  )
  select jsonb_build_object(
    'ig_handles', to_jsonb(s.ig_handles),
    'social_stories', case when s.ig_handles is not null then (select count(*) from m) end,
    'social_list', (select coalesce(jsonb_agg(jsonb_build_object(
        'date', (posted_at at time zone 'Asia/Dubai')::date, 'type', media_type, 'link', permalink, 'via', via)
        order by posted_at desc), '[]') from p),
    'ig_sync_ok_at', (select last_ok_at from sync_health where name = 'ig-tags-sync')
  )
$function$;
