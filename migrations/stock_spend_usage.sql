-- Stock & Supplier Spend, step 3 (Kate, 22 Oct 2026): Phorest's product usage kept before the move to Zenoti, and Phorest's own
-- product category on the stock tables.
--
-- product_usage_lines: one row per line of Phorest's Product Usage Details report (what each stylist took off the shelf, with the
-- minute), Jan 2026 onward, loaded by "phorest data export/product usage" (download_product_usage.py, parse_product_usage.py,
-- push_product_usage.py). qty is as Phorest prints it (a used product is negative). The product is priced at load from the Stock
-- List, the same way stock_order_lines is: unit_cost, spend (units used x cost, positive), type (professional / retail / unmatched),
-- and the Stock List's own brand and product name (list_brand, list_product) so a clipped usage name lines up with a received one.
-- The old product_usage table (the Upload Portal's CSV box, no branch, empty) is left alone.
--
-- Nothing reads this table through the API: RLS on, no policies, no grants. spend_report() reads it as the function owner. The
-- Phorest pushers write through the push pass, so the table is added to push_tables().
--
-- stock_order_lines.phorest_category and stock_levels.category: the Stock List's Product Category (VIBRANCE, IGORA ROYAL, Caviar ...),
-- which Cristine confirmed is the product family. Carried in by parse_stock_orders.py / push_stock_orders.py from 22 Oct.

create table if not exists public.product_usage_lines (
  id            bigint generated always as identity primary key,
  branch        text not null check (branch in ('SAA','KCA','MC','AQ','FRT','MRY','BAH')),
  used_at       timestamp not null,
  used_date     date generated always as (used_at::date) stored,
  line_type     text,
  staff_name    text,
  category      text,
  brand         text,
  product       text not null,
  qty           numeric not null,
  source_month  text not null,
  list_brand    text,
  list_product  text,
  list_category text,
  unit_cost     numeric,
  spend         numeric,
  type          text,
  matched_by    text,
  priced_on     date,
  loaded_at     timestamptz not null default now()
);
create index if not exists product_usage_lines_branch_date on public.product_usage_lines (branch, used_date);
create index if not exists product_usage_lines_branch_month on public.product_usage_lines (branch, source_month);
alter table public.product_usage_lines enable row level security;
revoke all on public.product_usage_lines from public, anon, authenticated;

alter table public.stock_order_lines add column if not exists phorest_category text;
alter table public.stock_levels add column if not exists category text;

create or replace function public.push_tables() returns text[] language sql immutable as $$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking','client_bookings','stock_levels','phorest_client_emails',
               'phorest_client_branches','phorest_client_notes','phorest_visit_notes','product_usage_lines']
$$;
