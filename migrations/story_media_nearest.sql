-- Content Calendar, story file match (Kate, 20 Nov 2026). Facebook stories have no story key, so a file is matched by time (within 120 seconds). Three Facebook stories posted a minute apart
-- (16 Nov, 5:05, 5:06, 5:07 pm) all matched the same file because the tie was broken by saved_at, and every one showed the first picture. Now the NEAREST file in time wins; the
-- Instagram story-key match still comes first. Same function, same columns, same grants.

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
      'media_path', m.storage_path, 'is_video', m.is_video, 'no_file', coalesce(m.no_file, false)) order by p.posted_at)
    from public.metricool_posts p
    left join lateral (
      select sm.storage_path, sm.is_video, sm.no_file from public.story_media sm
      where sm.network = p.network
        and ((p.network = 'instagram' and sm.story_key is not null and p.url like '%/' || sm.story_key)
          or abs(extract(epoch from sm.posted_at - p.posted_at)) < 120)
      order by (p.network = 'instagram' and sm.story_key is not null and p.url like '%/' || sm.story_key) desc, abs(extract(epoch from sm.posted_at - p.posted_at)) asc, sm.saved_at desc limit 1) m on true
    where p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between p_from and p_to
  ), '[]'::jsonb);
end $$;
revoke all on function public.content_calendar_story_stats(date, date) from public, anon;
grant execute on function public.content_calendar_story_stats(date, date) to authenticated;
