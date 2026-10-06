-- Google reviews through Metricool (Kate, 6 Oct 2026). Applied live on 6 Oct 2026.
-- metricool-sync (syncReviews) matches each Metricool review to its google_reviews row
-- and keeps it current until the Business Profile API is approved. gbp_name is Google's
-- own review id (Metricool's "name"), so a review is matched once and found directly
-- after. New reviews are added with review_id = gbp_name and source 'api'.
-- First run: 255 of 262 Metricool reviews matched (SAA 77, AQ 77, MC 69, BAH 32), 32
-- "N months ago" rows got their exact date, nothing else changed. 7 older reviews with no
-- row were skipped as most likely taken down by Google (not on the 24 Sep public list).
-- A copy of the table before that run: google_reviews_backup_20261006 (drop when happy).
alter table public.google_reviews add column if not exists gbp_name text;
create unique index if not exists google_reviews_gbp_name on public.google_reviews (gbp_name) where gbp_name is not null;
