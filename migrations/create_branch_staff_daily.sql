-- Create branch_staff_daily: per-staff, per-day client-type counts pushed straight
-- from each branch's Google Sheet (_temp_placeholder tab) via Apps Script.
-- Columns mirror the NCR/REQ/SALON/NEW/REBOOKED type acronyms used across the
-- branch sheets. Separate table from daily_stylist_data (that one is populated by
-- the XLSX Upload Portal and carries hair/beauty sales splits this sheet doesn't have).
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS branch_staff_daily (
  id             bigserial PRIMARY KEY,
  branch         text NOT NULL,          -- branch code: KCA, SAA, MC, AQ, FRT
  date           date NOT NULL,
  dept           text NOT NULL,          -- e.g. 'Hair'
  staff_name     text NOT NULL,
  ncr            integer DEFAULT 0,      -- NEW CLIENT REQ
  req            integer DEFAULT 0,      -- REQ
  salon          integer DEFAULT 0,      -- SALON
  new_client     integer DEFAULT 0,      -- NEW
  rebooked       integer DEFAULT 0,      -- REBOOKED
  total          integer DEFAULT 0,
  treatment_aed  numeric(10,2) DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (branch, date, dept, staff_name)
);

CREATE INDEX IF NOT EXISTS idx_branch_staff_daily_branch_date ON branch_staff_daily(branch, date);
CREATE INDEX IF NOT EXISTS idx_branch_staff_daily_staff ON branch_staff_daily(staff_name);

-- RLS is on by default for new tables in this project — without a policy, the
-- dashboard's anon-key client gets permission-denied on every read/write.
-- Matches the "anon_all" policy already used on daily_data, weekly_data, service_data.
ALTER TABLE branch_staff_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON branch_staff_daily;
CREATE POLICY anon_all ON branch_staff_daily FOR ALL TO anon USING (true) WITH CHECK (true);
