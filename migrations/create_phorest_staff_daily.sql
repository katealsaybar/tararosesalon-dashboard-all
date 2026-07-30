-- Create phorest_staff_daily: per-employee, per-day performance pasted from
-- Phorest's "Staff Performance Overview" report (report has no daily granularity
-- within a date-range query, so this is always one branch + one day per paste).
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS phorest_staff_daily (
  id               bigserial PRIMARY KEY,
  branch           text NOT NULL,          -- branch code: KCA, SAA, MC, AQ, FRT
  date             date NOT NULL,
  employee_name    text NOT NULL,          -- 'TOTAL' for the branch/day summary row
  is_total         boolean NOT NULL DEFAULT false,
  visits           integer,                -- null for the TOTAL row
  new_clients      integer,
  rqs              integer,
  rating           text,
  services_ex_vat  numeric(10,2) DEFAULT 0,
  services_total   numeric(10,2) DEFAULT 0,
  courses_ex_vat   numeric(10,2) DEFAULT 0,
  courses_total    numeric(10,2) DEFAULT 0,
  products_ex_vat  numeric(10,2) DEFAULT 0,
  products_total   numeric(10,2) DEFAULT 0,
  total_ex_vat     numeric(10,2) DEFAULT 0,
  total_total      numeric(10,2) DEFAULT 0,
  avg_spend_ex_vat numeric(10,2),           -- null for the TOTAL row
  avg_spend_total  numeric(10,2),
  created_at       timestamptz DEFAULT now(),
  UNIQUE (branch, date, employee_name)
);

CREATE INDEX IF NOT EXISTS idx_phorest_staff_daily_branch_date ON phorest_staff_daily(branch, date);
CREATE INDEX IF NOT EXISTS idx_phorest_staff_daily_employee ON phorest_staff_daily(employee_name);

-- RLS is on by default for new tables in this project (same as daily_data, weekly_data,
-- service_data) — without a policy, the dashboard's anon-key client gets permission-denied
-- on every read/write. Matches the "anon_all" policy already used on service_data.
ALTER TABLE phorest_staff_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON phorest_staff_daily;
CREATE POLICY anon_all ON phorest_staff_daily FOR ALL TO anon USING (true) WITH CHECK (true);
