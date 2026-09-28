-- Instagram posts that tag @tararosesalon (Kate, 28 Sep 2026), filled by the
-- ig-tags-sync edge function (supabase/functions/ig-tags-sync). Feeds the
-- Social posts (feed) benchmark. Already run live.
create table if not exists ig_tagged_posts (
  media_id   text primary key,
  username   text not null,
  posted_at  timestamptz not null,
  media_type text,
  permalink  text,
  synced_at  timestamptz not null default now()
);
create index if not exists idx_ig_tagged_posts_user_time on ig_tagged_posts (lower(username), posted_at);
alter table ig_tagged_posts enable row level security;
-- A stylist's Instagram handle(s), without the @, lower case, matched to ig_tagged_posts.username.
alter table perf_staff add column if not exists ig_handles text[];

-- perf_core (live) gained one key, beside google_reviews:
--   'social_feed', case when s.ig_handles is not null then
--                    (select count(*) from ig_tagged_posts t
--                     where lower(t.username) = any(s.ig_handles)
--                       and (t.posted_at at time zone 'Asia/Dubai')::date between d1 and d2) end,
-- null while no handle is on file, so the page says "No Instagram handle on file".

-- Handles: filled 28 Sep 2026 from what the /tags feed showed (Kate confirmed the
-- unclear ones) plus the ig: field on each person's card in staff-profiles.js, kept
-- as a union so an old and a new handle both count.

-- Nightly: ig-tags-sync at 21:00 Dubai (17:00 UTC), last 45 days each run.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('ig-tags-sync-nightly', '0 17 * * *', $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/ig-tags-sync',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <the dashboard anon key>'),
    body := '{"days":45}'::jsonb,
    timeout_milliseconds := 150000);
$$);

-- Story mentions (Kate, 28 Sep 2026): Meta's Instagram "messages" webhook posts to the
-- ig-webhook edge function (verify_jwt off, checked by X-Hub-Signature-256 against
-- META_APP_SECRET; handshake token IG_WEBHOOK_VERIFY_TOKEN). The TRS Staff Benchmarks
-- app is Live and the Tara Rose Salon Page is subscribed to it for "messages".
-- Only story mentions are kept: who and when, never message text.
create table if not exists ig_story_mentions (
  mid          text primary key,
  igsid        text not null,
  username     text,
  mentioned_at timestamptz not null,
  received_at  timestamptz not null default now()
);
create index if not exists idx_ig_story_mentions_user_time on ig_story_mentions (lower(username), mentioned_at);
alter table ig_story_mentions enable row level security;
