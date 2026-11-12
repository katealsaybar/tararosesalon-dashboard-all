-- Content Calendar, open version (Kate, 12 Nov 2026). Replaces the Level 3 lock of content_calendar_plan.sql: the calendar page in Post Approvals
-- needs no login, like the rest of that app, so these functions answer the public (anon) key.
--
-- What the public can read (content_calendar_posts): only what anyone can already see on the post itself, plus the time it went out.
--   caption, picture, link, time, likes, comments, plays for reels and videos, shares for Facebook and TikTok, reposts for Instagram reels.
--   NOT included: reach, saves, impressions (Facebook posts), interactions, Instagram shares, stories, anything account-level except Metricool's
--   best-time-to-post grid. Past 93 days a call is refused, so the whole history cannot be pulled in one go.
-- The plan (content_plan_*) is open to write too, the same as the approval boards. Remove is a soft delete (removed_at), so nothing can be wiped for good;
-- the plan holds at most 300 open items; texts are length-capped.

alter table public.content_plan_items add column if not exists removed_at timestamptz;

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
        'extra', case when p.network = 'instagram' and p.kind = 'reel' then jsonb_build_object('reposts', p.extra -> 'reposts') else '{}'::jsonb end
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

create or replace function public.content_plan_list()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.done, x.due, x.created_at), '[]'::jsonb)
  from (select id, created_at, post_network, post_date, post_url, post_caption, notice, owner_name, due, done
        from public.content_plan_items where removed_at is null) x
$$;

create or replace function public.content_plan_add(
  p_owner text, p_due date, p_notice text default null, p_network text default null,
  p_post_date date default null, p_post_url text default null, p_caption text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare new_id uuid;
begin
  if coalesce(btrim(p_owner), '') = '' then raise exception 'Add who posts it'; end if;
  if p_due is null then raise exception 'Add a date'; end if;
  if p_due < current_date - 30 or p_due > current_date + 800 then raise exception 'That date looks wrong'; end if;
  if (select count(*) from public.content_plan_items where removed_at is null) >= 300 then raise exception 'The plan is full, remove some first'; end if;
  insert into public.content_plan_items (created_by, post_network, post_date, post_url, post_caption, notice, owner_name, due)
  values ('Post Approvals page', left(p_network, 20), p_post_date, case when p_post_url ~* '^https?://' then left(p_post_url, 500) end,
          left(p_caption, 300), left(nullif(btrim(p_notice), ''), 500), left(btrim(p_owner), 80), p_due)
  returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

create or replace function public.content_plan_done(p_id uuid, p_done boolean)
returns void language sql security definer set search_path to 'public' as $$
  update public.content_plan_items set done = coalesce(p_done, false), done_at = case when coalesce(p_done, false) then now() else null end
  where id = p_id and removed_at is null
$$;

create or replace function public.content_plan_remove(p_id uuid)
returns void language sql security definer set search_path to 'public' as $$
  update public.content_plan_items set removed_at = now() where id = p_id and removed_at is null
$$;

grant execute on function public.content_calendar_posts(date, date) to anon, authenticated;
grant execute on function public.content_plan_list() to anon, authenticated;
grant execute on function public.content_plan_add(text, date, text, text, date, text, text) to anon, authenticated;
grant execute on function public.content_plan_done(uuid, boolean) to anon, authenticated;
grant execute on function public.content_plan_remove(uuid) to anon, authenticated;
