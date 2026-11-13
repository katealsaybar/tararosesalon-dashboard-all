-- Content Calendar, private post numbers (Kate, 13 Nov 2026). Signed-in only, Level 3 and above (the same gate as content_calendar_story_stats).
-- Reach, saves, views (impressions on Facebook), shares, interactions and, for reels and videos, average watch time (seconds) and the share who skipped early (percent), all from metricool_posts.
-- The public call content_calendar_posts never sends these; the dashboard asks for them and passes them to the calendar frame, which shows them in the pop-up.
create or replace function public.content_calendar_post_stats(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Post numbers are for Level 3 and above';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 93 then
    raise exception 'Ask for 93 days or fewer';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'network', p.network, 'posted_at', p.posted_at,
      'views', p.views, 'reach', p.reach, 'saves', p.saves, 'shares', p.shares, 'interactions', p.interactions,
      'avg_watch', (p.extra ->> 'avg_watch')::numeric, 'skip_rate', (p.extra ->> 'skip_rate')::numeric) order by p.posted_at)
    from public.metricool_posts p
    where p.kind <> 'story' and p.network in ('instagram', 'facebook', 'tiktok') and p.post_date between p_from and p_to
  ), '[]'::jsonb);
end $$;
revoke all on function public.content_calendar_post_stats(date, date) from public, anon;
grant execute on function public.content_calendar_post_stats(date, date) to authenticated;
