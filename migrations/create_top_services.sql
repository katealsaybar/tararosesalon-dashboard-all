-- Create top_services: aggregated Phorest "Top Services" report uploads, one row
-- per service line. Separate table from service_data on purpose — that one holds
-- transaction-level rows (date + client per row) and also feeds Top Clients, so
-- the summary report (no dates, no clients) must never overwrite it. Re-uploading
-- the same year+branch replaces that branch's rows only.
-- Run once in the Supabase SQL Editor (applied via MCP 2026-09-01).

CREATE TABLE IF NOT EXISTS top_services (
  id           bigserial PRIMARY KEY,
  year         integer NOT NULL,
  branch       text NOT NULL,             -- KCA, SAA, MC, AQ
  period_from  date,                      -- window the report was exported for
  period_to    date,                      --   (the file itself carries no dates)
  rank         integer,                   -- '#' column as exported
  category     text,
  service_name text,                      -- 'Description' column
  qty          numeric(10,2) DEFAULT 0,   -- 'Qty' = visit count
  price        numeric(10,2),
  time_hrs     numeric(10,2),
  revenue      numeric(12,2) DEFAULT 0,
  profit       numeric(12,2),
  source_file  text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_top_services_year_branch ON top_services(year, branch);

-- RLS is on by default for new tables in this project — without a policy, the
-- upload portal's anon-key client gets permission-denied on every read/write.
-- Matches the "anon_all" policy already used on service_data and the ledgers.
ALTER TABLE top_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON top_services;
CREATE POLICY anon_all ON top_services FOR ALL TO anon USING (true) WITH CHECK (true);

-- Aggregate ranking over the summary uploads. Same row shape as get_top_services
-- (the transaction RPC) plus the covered period, so the dashboard can reuse its
-- renderers when it falls back to this feed.
CREATE OR REPLACE FUNCTION get_top_services_agg(p_year integer, p_branches text[], p_limit integer DEFAULT 10)
RETURNS TABLE(service_name text, category text, total_revenue numeric, visit_count bigint, period_from date, period_to date)
LANGUAGE sql AS $$
  SELECT
    ts.service_name,
    ts.category,
    SUM(ts.revenue)                 AS total_revenue,
    SUM(ts.qty)::bigint             AS visit_count,
    MIN(ts.period_from)             AS period_from,
    MAX(ts.period_to)               AS period_to
  FROM top_services ts
  WHERE ts.year   = p_year
    AND ts.branch = ANY(p_branches)
    AND ts.service_name IS NOT NULL
  GROUP BY ts.service_name, ts.category
  ORDER BY total_revenue DESC
  LIMIT p_limit;
$$;

-- The Year dropdown on Service Rankings / Top Clients should list years that
-- exist in EITHER feed.
CREATE OR REPLACE FUNCTION get_service_years()
RETURNS TABLE(year smallint)
LANGUAGE sql AS $$
  SELECT DISTINCT y FROM (
    SELECT sd.year::smallint AS y FROM service_data sd
    UNION
    SELECT ts.year::smallint AS y FROM top_services ts
  ) u ORDER BY y DESC;
$$;
