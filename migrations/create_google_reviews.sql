-- Create google_reviews: one row per Google review, across every Business
-- Profile location (the four UAE branches plus Bahrain).
--
-- Why it exists. The Google Reviews add-on (add ons/google-reviews/) shipped on
-- 24 Sep 2026 reading a one-off data.js snapshot, so "any unanswered reviews?"
-- could only ever be answered as of the day that file was pulled. This table is
-- what the nightly sync writes to and what the add-on reads (Kate, 2026-09-24).
--
-- Written by apps-script/sync-google-reviews.gs (Business Profile API, service
-- key from Script Properties). Seeded once from the 24 Sep data.js snapshot;
-- those rows carry source = 'seed' and the first successful API pull of a
-- location deletes them and replaces them with source = 'api' rows, because the
-- snapshot's IDs and the API's review IDs are not guaranteed to match.
--
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS google_reviews (
  review_id    text PRIMARY KEY,        -- API reviewId; seed rows use 'seed:' + the Business Profile link's id
  branch       text NOT NULL,           -- the add-on's label, e.g. 'Khalifa City A, Abu Dhabi'
  location     text,                    -- API location name, e.g. 'locations/123...' (null on seed rows)
  stars        smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  reviewer     text,
  comment      text NOT NULL DEFAULT '',
  review_date  date NOT NULL,           -- Dubai date of createTime
  date_approx  boolean NOT NULL DEFAULT false, -- seed rows dated from Maps' "a year ago"
  when_text    text,                    -- that relative text, shown on approx rows
  replied      boolean NOT NULL DEFAULT false,
  reply        text NOT NULL DEFAULT '',
  reply_at     timestamptz,
  url          text,
  source       text NOT NULL DEFAULT 'api' CHECK (source IN ('api','seed')),
  created_at   timestamptz,             -- API createTime
  updated_at   timestamptz,             -- API updateTime (edits, new replies)
  synced_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_reviews_branch_date ON google_reviews(branch, review_date DESC);
CREATE INDEX IF NOT EXISTS idx_google_reviews_unreplied ON google_reviews(replied) WHERE NOT replied;

-- Read-only for the dashboard's publishable key. Unlike the upload tables this
-- one has no browser writer, so anon gets SELECT only; the sync writes with the
-- service key, which bypasses RLS.
ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read ON google_reviews;
CREATE POLICY anon_read ON google_reviews FOR SELECT TO anon USING (true);
