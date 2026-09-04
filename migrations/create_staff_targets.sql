-- Create staff_targets + branch_targets: the Monday Target Sheet, per month.
-- Run once in the Supabase SQL Editor.
--
-- WHY: until now the only place a target existed was ledger-targets.js, a
-- hand-typed config file. One person had to read four coordinators' tables and
-- retype ~40 stylists into JS every month, and if a figure there disagreed with
-- the sheet the file was simply stale — nothing computed it and nothing checked
-- it. The Upload Portal's Targets tab writes these two tables instead, from a
-- paste of the coordinator's own table.
--
-- SHAPE NOTES, from the September 2026 tables (Frans/Al Quoz, Christine/Saadiyat):
--
--   * The coordinators' columns are TARGET GIVEN BY SALON, then three figures
--     derived from it: "ACTUAL by 80%", "RETAIL by 12%", "TREATMENT by 20%".
--     The derivation chains — retail and treatment are percentages of the 80%
--     figure, NOT of the salon target (Simon: 10,000 → 8,000 → 960 → 1,600).
--     All four are stored rather than recomputed on read, because a coordinator
--     is allowed to override one cell and we want the number she committed to.
--   * The percentages are stored per branch per month on branch_targets. They
--     have been 80/12/20 everywhere so far, but they are typed into each
--     branch's sheet by hand, so they are data and not a constant.
--   * `dept` is HAIR | BEAUTY and is part of the key on purpose: nicknames
--     repeat across benches. MJ and SHINE each appear under both at Al Quoz in
--     ledger-targets.js, so a name alone is not a key. Same reasoning as
--     LEDGER_TARGETS.staff.
--   * staff_name is the canonical UPPER CASE name, i.e. what
--     canonicalStaffName() produces (Lucia → LUCY, Edz → EDS). Designation is
--     kept as the coordinator typed it — it is her label for the bench, and it
--     is what dept was derived from.
--   * A stylist on zero is a real row, not a missing one: Holly is 0.00 in
--     Christine's September table (she was off the floor). Dropping her would
--     make the branch look one stylist smaller.
--
-- branch_targets is the branch's TRUE monthly total, and it is the sum of the
-- stylist rows — nothing else. Kate, 4 Sep 2026: "i base mo na lang sa table
-- yung true target totals per stylist/beautician, wag na doon sa yellow box."
--
-- The yellow box each coordinator types under her table ("Salon Service Target
-- should be: 570000", "Retail Target should be: 45000") is kept in the
-- stated_* columns as reference only. It never feeds a total, for two reasons:
-- it does not agree with the table (Saadiyat's stylists sum to 443,000 against
-- a stated 570,000) and it does not agree with itself (Frans wrote "Salon is
-- under of 8280" where her own figures give 4,968). The gap between the two
-- sides is worth SEEING, which is why both are stored, but the table is what a
-- stylist was actually given and therefore what the dashboard measures against.

CREATE TABLE IF NOT EXISTS branch_targets (
  id                    bigserial PRIMARY KEY,
  branch                text NOT NULL,            -- branch code: KCA, SAA, MC, AQ, FRT
  month                 date NOT NULL,            -- always the 1st of the month

  -- THE TRUE TOTALS. Summed from staff_targets for this branch and month at
  -- save time. Stored rather than computed on read so the dashboard has one
  -- cheap row to fetch per branch, and so a total always matches the rows that
  -- produced it even if someone edits the table later without re-saving.
  service_target        numeric(12,2) DEFAULT 0,  -- Σ staff_targets.service_target
  actual_target         numeric(12,2) DEFAULT 0,  -- Σ actual_target
  retail_target         numeric(12,2) DEFAULT 0,  -- Σ retail_target
  treatment_target      numeric(12,2) DEFAULT 0,  -- Σ treatment_target
  staff_count           integer DEFAULT 0,        -- rows behind the sums

  -- WHAT THE COORDINATOR WROTE IN THE YELLOW BOX. Reference only. A null here
  -- means she did not write one, which is not the same as zero.
  stated_service_target numeric(12,2),
  stated_retail_target  numeric(12,2),

  -- CLIENT-COUNT TARGETS. Not derivable from the coordinators' tables, which are
  -- money only: these come off the MTD pacing panel of Emma's Monday Target Sheet
  -- and are typed into the Targets tab by hand. Nullable, never DEFAULT 0 - a
  -- month nobody has keyed must read as no target rather than as a target of zero
  -- clients, which every branch would be shown as beating. Added 4 Sep 2026; a
  -- table created before then takes them from add_client_targets_to_branch_targets.sql.
  total_clients         integer,
  new_clients           integer,
  ncr                   integer,
  rebooked              integer,
  beauty_rebooked       integer,

  actual_pct            numeric(6,3) DEFAULT 80,  -- the sheet's "ACTUAL by 80%"
  retail_pct            numeric(6,3) DEFAULT 12,  -- "RETAIL by 12%", off the actual figure
  treatment_pct         numeric(6,3) DEFAULT 20,  -- "TREATMENT by 20%", off the actual figure
  notes                 text,                     -- anything else in the yellow box
  source                text,                     -- who pasted it and from where
  created_at            timestamptz DEFAULT now(),
  UNIQUE (branch, month)
);

CREATE TABLE IF NOT EXISTS staff_targets (
  id                bigserial PRIMARY KEY,
  branch            text NOT NULL,
  month             date NOT NULL,            -- always the 1st of the month
  dept              text NOT NULL,            -- HAIR | BEAUTY
  staff_name        text NOT NULL,            -- canonical UPPER CASE
  designation       text,                     -- as the coordinator typed it
  service_target    numeric(12,2) DEFAULT 0,  -- TARGET GIVEN BY SALON
  actual_target     numeric(12,2) DEFAULT 0,  -- ACTUAL by 80%
  retail_target     numeric(12,2) DEFAULT 0,  -- RETAIL by 12% of the actual
  treatment_target  numeric(12,2) DEFAULT 0,  -- TREATMENT by 20% of the actual
  source            text,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (branch, month, dept, staff_name)
);

CREATE INDEX IF NOT EXISTS idx_staff_targets_branch_month ON staff_targets(branch, month);
CREATE INDEX IF NOT EXISTS idx_staff_targets_staff ON staff_targets(staff_name);
CREATE INDEX IF NOT EXISTS idx_branch_targets_month ON branch_targets(month);

-- RLS is on by default for new tables in this project. Without a policy the
-- dashboard's anon-key client gets permission-denied on every read and write.
-- Matches the anon_all policy already used on financial_totals and
-- branch_staff_daily.
ALTER TABLE staff_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON staff_targets;
CREATE POLICY anon_all ON staff_targets FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE branch_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON branch_targets;
CREATE POLICY anon_all ON branch_targets FOR ALL TO anon USING (true) WITH CHECK (true);
