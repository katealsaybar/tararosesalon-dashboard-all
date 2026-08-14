-- Cache table for the Branch Performance reads — the Working / Watch / Do this
-- panels, one set for all four branches.
--
-- Same shape and same reasoning as create_pulse_narrative.sql: one row per
-- (period, set of numbers), written once when the figures change and read back on
-- every page load, so the model is called on upload cadence rather than page-view
-- cadence. The facts always cover every active branch regardless of the branch
-- chips, so switching filters reads the same cached row instead of paying for a
-- new generation per combination.
--
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS branch_narrative (
  id            bigserial PRIMARY KEY,
  period_key    text NOT NULL,          -- e.g. '2026-07-01..2026-08-13|44d'
  facts_hash    text NOT NULL,          -- sha-256 of the canonicalised facts object
  model         text NOT NULL,
  copy          jsonb NOT NULL,         -- { KCA: {working, watch, action}, SAA: {...}, ... }
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (period_key, facts_hash)
);

CREATE INDEX IF NOT EXISTS idx_branch_narrative_lookup ON branch_narrative(period_key, facts_hash);

-- No policies on purpose. The Edge Function reads and writes with the service-role
-- key, which bypasses RLS; nothing else should touch this table, and enabling RLS
-- with no policy is what makes that true rather than merely intended.
ALTER TABLE branch_narrative ENABLE ROW LEVEL SECURITY;
