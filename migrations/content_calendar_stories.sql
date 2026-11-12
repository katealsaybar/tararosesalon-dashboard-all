-- Content Calendar, stories (Kate, 12 Nov 2026). The calendar's "Stories" chip asks for these, only when it is on, so the posts call (content_calendar_posts) stays light.
--
-- What the public key gets: the network, the day and time, and the picture (Metricool keeps the picture on its own storage, so it does not expire).
-- NOT sent: views, reach, replies, taps, exits (story numbers are private insights, and this page has no login), and the story's own link (it dies after 24 hours).
-- Instagram and Facebook only (TikTok has no stories). Asking for more than 93 days is refused, like content_calendar_posts.

create or replace function public.content_calendar_stories(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 93 then
    raise exception 'Ask for 93 days or fewer';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('network', p.network, 'post_date', p.post_date, 'posted_at', p.posted_at, 'image_url', p.image_url) order by p.posted_at)
    from public.metricool_posts p
    where p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between p_from and p_to
  ), '[]'::jsonb);
end $$;

grant execute on function public.content_calendar_stories(date, date) to anon, authenticated;
