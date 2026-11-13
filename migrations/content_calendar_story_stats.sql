-- Content Calendar, story numbers (Kate, 13 Nov 2026). Signed-in only: Level 3 and above, the same gate as the Social page.
-- The public call content_calendar_stories still sends no numbers. The calendar frame (a public page) never calls this one; the dashboard does and passes the rows to it.
-- Instagram and Facebook stories. views is impressions; replies, taps and exits are what Metricool keeps (metricool-sync, 6 Oct 2026).

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
      'exits', (p.extra ->> 'exits')::numeric) order by p.posted_at)
    from public.metricool_posts p
    where p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between p_from and p_to
  ), '[]'::jsonb);
end $$;

revoke all on function public.content_calendar_story_stats(date, date) from public, anon;
grant execute on function public.content_calendar_story_stats(date, date) to authenticated;
