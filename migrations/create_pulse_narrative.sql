-- Cache table for the Organisation Pulse narrative copy.
-- One row per (period, set of numbers). The Edge Function writes it once when a
-- new upload changes the figures and reads it back on every page load after that,
-- so the model is called on upload cadence, not page-view cadence.
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS pulse_narrative (
  id            bigserial PRIMARY KEY,
  period_key    text NOT NULL,          -- e.g. '2026-07-01..2026-08-12|ALL'
  facts_hash    text NOT NULL,          -- sha-256 of the canonicalised facts object
  model         text NOT NULL,
  copy          jsonb NOT NULL,         -- the validated narrative the page renders
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (period_key, facts_hash)
);

CREATE INDEX IF NOT EXISTS idx_pulse_narrative_lookup ON pulse_narrative(period_key, facts_hash);

-- No policies on purpose. The Edge Function reads and writes with the service-role
-- key, which bypasses RLS; nothing else should touch this table, and enabling RLS
-- with no policy is what makes that true rather than merely intended.
ALTER TABLE pulse_narrative ENABLE ROW LEVEL SECURITY;
