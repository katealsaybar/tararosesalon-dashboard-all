-- stock_levels: shelf counts per product per branch, one snapshot per day, for the To do list's
-- Product supply category (supply_low) and anything else that needs "how many do we have".
-- Kate, 15 Oct 2026.
--
-- Source: Phorest's Stock List report (Additional reports > Products), the same PDFs
-- "phorest data export/stock orders/parse_stock_orders.py" already reads for cost. The list prints
-- In stock, Min, Max and On Order per product; the parser used to keep only Cost. It now also writes a
-- "levels" block, and push_stock_orders.py pushes it here as part of /daily-reports Step 6.
--   * as_of is the date printed on the PDF ("Date 14/10/26"), not the day it was pushed.
--   * A push replaces one branch + as_of (delete then insert) and drops that branch's snapshots older
--     than 60 days, so the table holds about two months of daily counts (~4,300 rows a day).
--   * in_stock can be negative: Phorest lets stock go below zero when a product is used or sold before
--     the delivery is booked in. Kept as printed; the rule reads it as "none on the shelf".
--   * min_stock / max_stock are the levels the salon typed into Phorest. Most professional lines have a
--     min, so in_stock <= min_stock is Phorest's own LOW_STOCK report; that report is not downloaded.
--   * type is the parser's retail / professional after its overrides (Igora, hair extensions), as in
--     stock_order_lines.type. stock_type keeps Phorest's own retail / professional / colour.
--   * Rows are not unique: Phorest has a few products printed twice (same name, no barcode), so there is
--     no unique key and a push replaces the whole branch + as_of.

create table if not exists public.stock_levels (
  id          bigserial primary key,
  branch      text not null,            -- SAA, KCA, MC, AQ, BAH
  as_of       date not null,            -- the Stock List's own print date
  brand       text,
  product     text not null,
  volume      text,
  barcode     text,                     -- full EAN as the Stock List prints it (orders carry only 12 digits)
  stock_type  text,                     -- retail | professional | colour, as Phorest has it
  type        text not null,            -- retail | professional, after the parser's overrides
  cost        numeric(12,2),
  sale_price  numeric(12,2),
  in_stock    numeric(10,2) not null,
  min_stock   numeric(10,2),
  max_stock   numeric(10,2),
  on_order    numeric(10,2),
  loaded_at   timestamptz not null default now()
);
create index if not exists stock_levels_branch_asof on public.stock_levels (branch, as_of);
create index if not exists stock_levels_barcode on public.stock_levels (branch, as_of, barcode);

alter table public.stock_levels enable row level security;
revoke all on public.stock_levels from anon;
-- Same policy set as stock_order_lines after the dashboard lock: signed-in dashboard users read, the
-- owner writes; the pushers go through push_delete / push_insert below, which bypass RLS.
drop policy if exists dashboard_users_read on public.stock_levels;
create policy dashboard_users_read on public.stock_levels for select to authenticated
  using ((select is_dashboard_user()));
drop policy if exists dashboard_owner_insert on public.stock_levels;
create policy dashboard_owner_insert on public.stock_levels for insert to authenticated
  with check ((select is_dashboard_owner()));
drop policy if exists dashboard_owner_update on public.stock_levels;
create policy dashboard_owner_update on public.stock_levels for update to authenticated
  using ((select is_dashboard_owner()));
drop policy if exists dashboard_owner_delete on public.stock_levels;
create policy dashboard_owner_delete on public.stock_levels for delete to authenticated
  using ((select is_dashboard_owner()));

-- Let the pushers write it. This is the live list on 15 Oct 2026 (push_passes.sql in the repo is older)
-- plus stock_levels.
create or replace function public.push_tables() returns text[] language sql immutable as $$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking','client_bookings','stock_levels']
$$;
