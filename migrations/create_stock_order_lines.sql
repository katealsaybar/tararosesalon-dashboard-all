-- Create stock_order_lines: one row per product line on a Phorest stock
-- order, priced, for the Products page (weekly product spend per branch,
-- retail vs professional). 29 Sep 2026.
--
-- Source: Phorest's Stock Orders report (Additional reports > Products),
-- which has no cost and no stock type, priced against the Stock List report
-- by "phorest data export/stock orders/parse_stock_orders.py". So:
--   * unit_cost is the Stock List cost on the day the list was pulled
--     (priced_on), not the cost on the order date. The list keeps no history.
--   * type is the parser's retail / professional, after its overrides
--     (IGORA ROYAL is professional even where Phorest types it RETAIL, COLOUR
--     counts as professional). phorest_stock_type keeps what Phorest says.
--   * type 'unmatched' = no Stock List row by barcode or name; unit_cost and
--     spend stay null rather than guessed. ambiguous holds a note when several
--     list rows matched with different costs.
--   * Lines are not unique: the same product can appear twice on one order
--     with different counts. A push replaces per branch + source_month (the
--     calendar month of the order date the PDF was pulled for).

CREATE TABLE IF NOT EXISTS stock_order_lines (
  id                  bigserial PRIMARY KEY,
  branch              text NOT NULL,          -- KCA, SAA, MC, AQ
  source_month        text NOT NULL,          -- 'YYYY-MM', the PDF's order-date month
  status              text NOT NULL,          -- arrived | not_arrived (at pull time)
  order_no            text NOT NULL,
  product             text NOT NULL,
  barcode             text,                   -- first 12 digits only; the PDF clips it
  count               numeric(10,2),
  order_date          date,
  arrived_date        date,
  unit_cost           numeric(12,2),
  spend               numeric(12,2),
  type                text NOT NULL,          -- retail | professional | unmatched
  phorest_stock_type  text,                   -- retail | professional | colour, as Phorest has it
  brand               text,
  matched_by          text,                   -- barcode | name | null
  ambiguous           text,
  priced_on           date NOT NULL,
  loaded_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_order_lines_branch_arrived ON stock_order_lines (branch, arrived_date);
CREATE INDEX IF NOT EXISTS stock_order_lines_branch_month ON stock_order_lines (branch, source_month);

ALTER TABLE stock_order_lines ENABLE ROW LEVEL SECURITY;

-- Same policy set as financial_totals / sales_transaction_lines today. When
-- dashboard_sign_in_phase_b.sql is run, add this table to its anon_all loop.
DROP POLICY IF EXISTS anon_all ON stock_order_lines;
CREATE POLICY anon_all ON stock_order_lines FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS dashboard_users_read ON stock_order_lines;
CREATE POLICY dashboard_users_read ON stock_order_lines FOR SELECT TO authenticated USING ((SELECT is_dashboard_user()));
DROP POLICY IF EXISTS dashboard_owner_insert ON stock_order_lines;
CREATE POLICY dashboard_owner_insert ON stock_order_lines FOR INSERT TO authenticated WITH CHECK ((SELECT is_dashboard_owner()));
DROP POLICY IF EXISTS dashboard_owner_update ON stock_order_lines;
CREATE POLICY dashboard_owner_update ON stock_order_lines FOR UPDATE TO authenticated USING ((SELECT is_dashboard_owner()));
DROP POLICY IF EXISTS dashboard_owner_delete ON stock_order_lines;
CREATE POLICY dashboard_owner_delete ON stock_order_lines FOR DELETE TO authenticated USING ((SELECT is_dashboard_owner()));
