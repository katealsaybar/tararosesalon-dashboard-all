-- Add the five client-count targets to branch_targets.
-- Run once in the Supabase SQL Editor, AFTER create_staff_targets.sql.
--
-- WHY A SECOND FILE: create_staff_targets.sql is CREATE TABLE IF NOT EXISTS, so
-- re-running it against a table that already exists adds nothing. It has been
-- updated too, for anyone building the schema from scratch; this is the file that
-- moves a table already in place.
--
-- WHY THESE FIVE. The dashboard's Ledgers pages ask ledgerBranchTarget() for
-- eleven branch metrics. Six of them are money and are summed from staff_targets,
-- so they came for free with the Targets tab. These five are head counts, and they
-- live in a different document: the MTD pacing panel of Emma's Monday Target
-- Sheet, not the per-stylist table the branch coordinators send. Nothing in the
-- coordinators' paste could ever produce them, so they are typed in beside the
-- rest (Kate, 4 Sep 2026, choosing the full flip over a half-flipped page).
--
-- They are nullable rather than DEFAULT 0 on purpose. A month where nobody has
-- keyed them yet has to read as "no target set", the way a blank does on the
-- Ledgers pages today, and not as a target of zero clients — which every branch
-- would then be shown as spectacularly beating.

ALTER TABLE branch_targets ADD COLUMN IF NOT EXISTS total_clients   integer;
ALTER TABLE branch_targets ADD COLUMN IF NOT EXISTS new_clients     integer;
ALTER TABLE branch_targets ADD COLUMN IF NOT EXISTS ncr             integer;  -- new client requests
ALTER TABLE branch_targets ADD COLUMN IF NOT EXISTS rebooked        integer;
ALTER TABLE branch_targets ADD COLUMN IF NOT EXISTS beauty_rebooked integer;

-- PostgREST caches the schema. Without this the new columns 404 from the browser
-- until the API happens to restart.
NOTIFY pgrst, 'reload schema';
