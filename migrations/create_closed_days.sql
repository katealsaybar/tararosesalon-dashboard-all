-- Create closed_days: one row per branch-day the salon did not trade.
--
-- Why it exists. A Phorest report for a closed day parses to no staff rows at
-- all (its Total line reads 00:00 / 00:00 / 0.0%), so the uploader could not
-- store it and the day stayed a permanent gap in Backfill Progress: amber for
-- ever, and on the Copy missing dates list every time, sending someone to look
-- for a report that was never run. Khalifa on 17 Jun 2025 is the day that found
-- this (Kate, 2026-09-04).
--
-- Why its own table rather than a marker row in staff_utilisation: the
-- dashboard reads staff_utilisation too (dashboard.js), so a fake staff member
-- with zero hours would land in the group's utilisation averages and pull them
-- down with a day nobody worked.
--
-- Read by the three Backfill Progress grids (they treat these days as closed,
-- not missing) and written by the utilisation uploader when it recognises a
-- zero report. A day is closed for the whole branch, so one row serves the
-- Staff Daily, Utilisation and Ledgers grids alike.
--
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS closed_days (
  id            bigserial PRIMARY KEY,
  branch        text NOT NULL,          -- branch code: KCA, SAA, MC, AQ, FRT
  date          date NOT NULL,
  why           text,                   -- 'no trading' from a zero report, or a note typed by hand
  detected_from text,                   -- which report the uploader read it off, e.g. 'staff utilisation'
  created_at    timestamptz DEFAULT now(),
  UNIQUE (branch, date)
);

CREATE INDEX IF NOT EXISTS idx_closed_days_branch_date ON closed_days(branch, date);

-- RLS is on by default for new tables in this project — without a policy the
-- portal's anon-key client gets permission-denied on every read and write.
-- Matches the anon_all policy already used on phorest_staff_daily and
-- service_data.
ALTER TABLE closed_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON closed_days;
CREATE POLICY anon_all ON closed_days FOR ALL TO anon USING (true) WITH CHECK (true);
