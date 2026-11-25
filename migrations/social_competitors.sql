-- Social > Instagram > Competitors (Kate, 25 Nov 2026). Built from docs/mockups/social-competitors.html.
-- Kate adds the salons she watches in Metricool (Analytics > Instagram > Competitors); metricool-sync (source 'competitors') reads them
-- every night: the list with each one's followers, and every post and reel they put out. Public data only: no views, reach or stories.
--   metricool_competitors           one row per salon we watch: who they are and their followers as last read
--   metricool_competitor_followers  their followers, one row a day from the day we first read them (history starts there)
--   metricool_competitor_posts      every post and reel, so any Period in the masthead can be worked out
--   social_competitors(from, to)    the report the page reads (Level 3 and above, the main brand's list only)
-- Instagram only for now; the network column is there for Facebook and TikTok later. Run it again and it changes nothing.

create table if not exists public.metricool_competitors (
  brand_id      bigint      not null,
  network       text        not null,
  competitor_id bigint      not null,           -- Metricool's id for the salon
  handle        text,
  name          text,
  followers     numeric,                        -- as of the last read
  synced_at     timestamptz not null default now(),
  primary key (brand_id, network, competitor_id)
);

create table if not exists public.metricool_competitor_followers (
  brand_id      bigint  not null,
  network       text    not null,
  competitor_id bigint  not null,
  date          date    not null,               -- Dubai
  followers     numeric,
  primary key (brand_id, network, competitor_id, date)
);

create table if not exists public.metricool_competitor_posts (
  post_key      text primary key,               -- network:competitor_id:post id
  brand_id      bigint      not null,
  network       text        not null,
  competitor_id bigint      not null,
  kind          text        not null,           -- post | reel
  posted_at     timestamptz,
  post_date     date,                           -- Dubai
  caption       text,
  url           text,
  likes         numeric,
  comments      numeric,
  engagement    numeric,                        -- Metricool's own rate for the post, in percent; empty for the newest
  synced_at     timestamptz not null default now()
);
create index if not exists metricool_competitor_posts_date on public.metricool_competitor_posts (post_date);
create index if not exists metricool_competitor_posts_who  on public.metricool_competitor_posts (brand_id, network, competitor_id);

alter table public.metricool_competitors          enable row level security;   -- no policies: read through the report
alter table public.metricool_competitor_followers enable row level security;
alter table public.metricool_competitor_posts     enable row level security;

create or replace function public.social_competitors(p_from date, p_to date, p_network text default 'instagram')
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  out jsonb;
  bids bigint[] := array(select x.brand_id from public.metricool_brands x where x.branch is null);
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Social is for Level 3 and above';
  end if;
  select jsonb_build_object(
    -- Each salon with its followers on the last day we read them on or before the end of the dates (else the latest read).
    'competitors', coalesce((select jsonb_agg(jsonb_build_object('id', c.competitor_id, 'handle', c.handle, 'name', c.name,
        'followers', coalesce(f.followers, c.followers), 'followers_date', f.date) order by coalesce(f.followers, c.followers) desc nulls last)
      from public.metricool_competitors c
      left join lateral (select x.followers, x.date from public.metricool_competitor_followers x
                         where x.brand_id = c.brand_id and x.network = c.network and x.competitor_id = c.competitor_id and x.date <= p_to
                         order by x.date desc limit 1) f on true
      where c.brand_id = any(bids) and c.network = p_network), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('cid', p.competitor_id, 'kind', p.kind, 'd', p.post_date, 'at', p.posted_at,
        'likes', p.likes, 'comments', p.comments, 'url', p.url, 'text', left(p.caption, 140)) order by p.posted_at desc)
      from public.metricool_competitor_posts p
      where p.brand_id = any(bids) and p.network = p_network and p.post_date between p_from and p_to), '[]'::jsonb),
    -- Where our own record of them begins: before this the followers are only the latest read.
    'first_day', (select min(x.date) from public.metricool_competitor_followers x where x.brand_id = any(bids) and x.network = p_network),
    'first_post', (select min(p.post_date) from public.metricool_competitor_posts p where p.brand_id = any(bids) and p.network = p_network),
    'sync', (select to_jsonb(s) from public.sync_health s where s.name = 'metricool-sync')
  ) into out;
  return out;
end;
$function$;

revoke all on function public.social_competitors(date, date, text) from public, anon;
grant execute on function public.social_competitors(date, date, text) to authenticated, service_role;
