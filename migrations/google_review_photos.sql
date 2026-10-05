-- Photos clients attached to their Google reviews (Kate, 5 Oct 2026). Applied.
--
-- The Business Profile API does not return them, so they were read off each branch's
-- Business Profile review list (sorted "Most relevant", which lists every review:
-- KCA 915, SAA 702, AQ 433, MC 422, BAH 32, the same counts as google_reviews) in
-- Kate's Chrome, and loaded through a one-time anon RPC that was dropped straight
-- after. 245 reviews carry 414 photos.
--
-- google_review_photos keeps Google's own review id, so the photos can be matched
-- again once the API sync replaces the seed rows (new review_id). Matching on 5 Oct:
-- 116 by review id ('seed:' || google_id), 109 through REVIEW_MAPS_IDS in
-- add ons/google-reviews/review-links.js, 20 by branch + reviewer name (unique);
-- where the map and the name both matched they agreed on all of them.
-- The page reads google_reviews.photos.

create table if not exists public.google_review_photos (
  google_id text primary key,          -- data-review-id on the Business Profile list
  branch text not null,
  reviewer text,
  contrib_id text,
  photos text[] not null,              -- lh3.googleusercontent.com/grass-cs/... without a size suffix
  when_text text,
  review_id text,                      -- the google_reviews row it was matched to
  read_at timestamptz not null default now()
);
alter table public.google_review_photos enable row level security;
revoke all on public.google_review_photos from anon, authenticated;
alter table public.google_reviews add column if not exists photos text[];

-- After matching:
-- update public.google_reviews r set photos = p.photos
--   from public.google_review_photos p where p.review_id = r.review_id;
