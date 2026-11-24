-- Chat complaints found by the respond.io sync (Kate, 24 Nov 2026). Applied live on 24 Nov 2026.
-- The edge function respond-complaint-sync adds a row to complaint_candidates (status 'todo') for a client who writes to a salon, the brand
-- number, Instagram or Facebook and sounds like she is complaining. These columns hold the client's complete identity and where the row came from.
-- A missing phone or email never stops a row: gaps says what is missing ('no phone', 'no email', 'no phone, no email') and the row is still reviewed.
-- Undo: alter table public.complaint_candidates drop column email, drop column respond_contact_id, drop column match_how, drop column gaps, drop column source, drop column synced_at;
alter table public.complaint_candidates
  add column if not exists email text,                       -- her email: respond.io contact first, else the real Phorest email
  add column if not exists respond_contact_id bigint,        -- the respond.io contact this came from
  add column if not exists match_how text,                   -- how phorest_id was found: phone, email, name + branch (null = not matched)
  add column if not exists gaps text,                        -- 'no phone', 'no email' or both
  add column if not exists source text not null default 'manual',   -- manual (the 12 and 23 Nov crawls) or auto-sync
  add column if not exists synced_at timestamptz;
create unique index if not exists complaint_candidates_contact_day on public.complaint_candidates (respond_contact_id, msg_date) where respond_contact_id is not null;
-- The 105 rows that existed on 24 Nov got respond_contact_id (104), email (64) and gaps from the function's backfill mode ({"backfill": true}).
