-- Create financial_totals: one row per branch per day, from Phorest's
-- "Financial Totals" report (Additional reports > Financial). The report is
-- date-range based with no daily split inside a range, so the pull is always
-- one branch + one day per request, same as phorest_staff_daily.
-- Run once in the Supabase SQL Editor.
--
-- Shape notes, all learned from four real August 2026 exports (one per branch)
-- plus a per-staff run at Motor City:
--
--   * Payment Types and Cashbook rows are NOT a fixed set. Al Quoz has no
--     TABBY-LINK line, Khalifa City carries a DTRANSFER line nobody else has,
--     and the per-staff run showed a Memberships Used row absent from all four
--     branch exports. So those two sections go to jsonb in full and only the
--     lines we actually chart get their own column. A new payment type on the
--     Phorest side then lands in the jsonb instead of being dropped.
--   * The VAT Breakdown row labels are branch-configured, not stable
--     ("VAT on Services @ 5%" at SAA/KCA, "Service 0 @ 5%" at AQ,
--     "Service 5% @ 5%" at MC), so they are stored positionally as
--     vat_service_* / vat_product_* rather than by label.
--   * VAT Breakdown "service" includes Courses Sold; the Sales section keeps
--     them apart. Verified on all four exports. The two service figures are
--     meant to differ.
--   * Non-Revenue and Pay Out lines carry zero VAT structurally, so they keep
--     a count and a total only.

CREATE TABLE IF NOT EXISTS financial_totals (
  id                        bigserial PRIMARY KEY,
  branch                    text NOT NULL,          -- branch code: KCA, SAA, MC, AQ, FRT
  date                      date NOT NULL,

  -- Sales
  services_count            integer   DEFAULT 0,
  services_net              numeric(12,2) DEFAULT 0,
  services_vat              numeric(12,2) DEFAULT 0,
  services_total            numeric(12,2) DEFAULT 0,
  courses_count             integer   DEFAULT 0,
  courses_net               numeric(12,2) DEFAULT 0,
  courses_vat               numeric(12,2) DEFAULT 0,
  courses_total             numeric(12,2) DEFAULT 0,
  products_count            integer   DEFAULT 0,
  products_net              numeric(12,2) DEFAULT 0,
  products_vat              numeric(12,2) DEFAULT 0,
  products_total            numeric(12,2) DEFAULT 0,
  sales_net                 numeric(12,2) DEFAULT 0,
  sales_vat                 numeric(12,2) DEFAULT 0,
  sales_total               numeric(12,2) DEFAULT 0,

  -- Non-Revenue Sales (VAT is structurally zero on every line)
  vouchers_sold_count       integer   DEFAULT 0,
  vouchers_sold_total       numeric(12,2) DEFAULT 0,
  paid_into_account_count   integer   DEFAULT 0,
  paid_into_account_total   numeric(12,2) DEFAULT 0,
  vouchers_used_count       integer   DEFAULT 0,
  vouchers_used_total       numeric(12,2) DEFAULT 0,   -- negative
  memberships_used_count    integer   DEFAULT 0,
  memberships_used_total    numeric(12,2) DEFAULT 0,   -- negative
  account_used_count        integer   DEFAULT 0,
  account_used_total        numeric(12,2) DEFAULT 0,   -- negative
  non_revenue_total         numeric(12,2) DEFAULT 0,

  -- Pay Outs
  sundries_count            integer   DEFAULT 0,
  sundries_total            numeric(12,2) DEFAULT 0,

  -- Payment Types: the four we chart, plus every line as sent
  pay_cash                  numeric(12,2) DEFAULT 0,
  pay_card                  numeric(12,2) DEFAULT 0,   -- "Card (Debit/Credit/Tabby)"
  pay_stripe                numeric(12,2) DEFAULT 0,
  pay_tabby_link            numeric(12,2) DEFAULT 0,
  payment_types             jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_banked              numeric(12,2) DEFAULT 0,

  -- Cashbook: derivable from the sections above except for one-off lines
  -- like KCA's DTRANSFER, so it is kept whole rather than broken out.
  cashbook                  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- VAT Breakdown (positional: row 1 = service, row 2 = product)
  vat_service_net           numeric(12,2) DEFAULT 0,
  vat_service_vat           numeric(12,2) DEFAULT 0,
  vat_service_total         numeric(12,2) DEFAULT 0,
  vat_product_net           numeric(12,2) DEFAULT 0,
  vat_product_vat           numeric(12,2) DEFAULT 0,
  vat_product_total         numeric(12,2) DEFAULT 0,

  -- Provenance. checks_passed is the report's own four internal cross-checks
  -- (payment types sum, cashbook sum, sales total vs cashbook sales, and
  -- non-revenue vs cashbook non-revenue). All four held on every sample, so a
  -- false here means the parse is wrong, not that the day was odd.
  source_file               text,
  checks_passed             boolean,
  created_at                timestamptz DEFAULT now(),

  UNIQUE (branch, date)
);

CREATE INDEX IF NOT EXISTS idx_financial_totals_branch_date ON financial_totals(branch, date);
CREATE INDEX IF NOT EXISTS idx_financial_totals_date ON financial_totals(date);

-- RLS is on by default for new tables in this project. Without a policy the
-- dashboard's anon-key client gets permission-denied on every read and write.
-- Matches the anon_all policy already used on phorest_staff_daily.
ALTER TABLE financial_totals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_all ON financial_totals;
CREATE POLICY anon_all ON financial_totals FOR ALL TO anon USING (true) WITH CHECK (true);
