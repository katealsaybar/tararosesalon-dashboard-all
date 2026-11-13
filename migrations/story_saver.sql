-- Story saver (Kate, 13 Nov 2026). Instagram and Facebook keep a story for 24 hours, so the story-saver edge function (every 6 hours) copies each live story's file into a PRIVATE bucket,
-- and the Content Calendar viewer can play it later. Older stories stay pictures: Meta gives no way back to a story's video after 24 hours.
-- The bucket is private. Only a signed-in Level 3 or higher (the same gate as content_calendar_story_stats) can read it, which is what lets the dashboard make short-lived signed links.
-- The public calendar call content_calendar_stories never returns a path or a link.

insert into storage.buckets (id, name, public, file_size_limit)
values ('story-media', 'story-media', false, 62914560)        -- 60 MB a file
on conflict (id) do nothing;

create policy "story-media read Level 3 and up" on storage.objects for select to authenticated
  using (bucket_id = 'story-media' and coalesce((select m.level from public.dashboard_me() m limit 1), 0) >= 3);
-- No insert, update or delete policy: only the service role (the saver) writes.

-- One row per saved story. The Metricool row may arrive a day later, so the file is matched to it at read time (story_key is the Instagram story id in its link; otherwise the time).
create table if not exists public.story_media (
  media_id    text primary key,                      -- 'ig:<Graph media id>' or 'fb:<story post id>'
  network     text not null check (network in ('instagram', 'facebook')),
  posted_at   timestamptz,
  story_key   text,                                  -- Instagram: the number at the end of the story link
  permalink   text,
  storage_path text not null,
  is_video    boolean not null,
  bytes       bigint,
  saved_at    timestamptz not null default now()
);
alter table public.story_media enable row level security;    -- no policies: the service role and the security definer call below only
create index if not exists story_media_net_time on public.story_media (network, posted_at);

-- The signed-in story numbers call also hands back where the file is (never the public call).
create or replace function public.content_calendar_story_stats(p_from date, p_to date)
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
      'views', p.views, 'reach', p.reach,
      'replies', coalesce(p.extra ->> 'replies', case when p.network = 'instagram' then p.comments::text end)::numeric,
      'reactions', case when p.network = 'facebook' then p.likes end,
      'taps_forward', (p.extra ->> 'taps_forward')::numeric,
      'taps_back', (p.extra ->> 'taps_back')::numeric,
      'exits', (p.extra ->> 'exits')::numeric,
      'media_path', m.storage_path, 'is_video', m.is_video) order by p.posted_at)
    from public.metricool_posts p
    left join lateral (
      select sm.storage_path, sm.is_video from public.story_media sm
      where sm.network = p.network
        and ((p.network = 'instagram' and sm.story_key is not null and p.url like '%/' || sm.story_key)
          or abs(extract(epoch from sm.posted_at - p.posted_at)) < 120)
      order by (p.network = 'instagram' and sm.story_key is not null and p.url like '%/' || sm.story_key) desc, sm.saved_at desc limit 1) m on true
    where p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between p_from and p_to
  ), '[]'::jsonb);
end $$;
revoke all on function public.content_calendar_story_stats(date, date) from public, anon;
grant execute on function public.content_calendar_story_stats(date, date) to authenticated;

-- Every 6 hours (00, 06, 12, 18 UTC = 04:00, 10:00, 16:00, 22:00 Dubai). A story lives 24 hours, so none can expire unseen between runs.
-- Bearer = the dashboard anon key, as the other syncs.
select cron.schedule('story-saver', '0 */6 * * *', $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/story-saver',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the dashboard anon key>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
$$);
