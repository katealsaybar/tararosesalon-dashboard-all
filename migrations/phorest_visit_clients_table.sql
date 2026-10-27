-- Kate, 27 Oct 2026: which Phorest client each sale belongs to.
-- sales_transaction_lines only has client_name (parsed from the Sales Transactions PDF), so two women with the same
-- name were one person in the contact columns and the client window. Phorest's `purchases` GraphQL query returns every
-- sale with its clientId, and its transactionNumber is the sale id on the PDF (sales_transaction_lines.sale_id), so
-- UAE sales join exactly on (branch, date, sale_id). Bahrain's sale ids are synthetic (2026-08-13-001): those join on
-- (branch, date, name_key) when one Phorest client carries the name that day.
-- Pulled per branch and day by "phorest data export/new clients/pull_visit_clients.py", pushed by
-- push_visit_clients.py (upsert on branch, date, tx), refreshed daily by refresh_visit_clients.py (Step 12 of daily-reports).
-- One row per sale that has a client profile (walk-ins with no profile have none). Owner read only (RLS on, no other policy).

create table if not exists public.phorest_visit_clients (
  branch text not null,
  date date not null,
  tx text not null,                 -- Phorest transactionNumber = sales_transaction_lines.sale_id (UAE)
  phorest_client_id text not null,
  name_key text not null,           -- lower(regexp_replace(trim(clientName), '\s+', ' ', 'g'))
  staff text,
  voided boolean not null default false,
  pulled_at date not null default current_date,
  primary key (branch, date, tx)
);
create index if not exists phorest_visit_clients_client on public.phorest_visit_clients (phorest_client_id);
create index if not exists phorest_visit_clients_day_key on public.phorest_visit_clients (branch, date, name_key);
alter table public.phorest_visit_clients enable row level security;
create policy owner_read on public.phorest_visit_clients for select using ((select is_dashboard_owner()));

create or replace function public.push_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking','client_bookings','stock_levels','phorest_client_emails',
               'phorest_client_branches','phorest_client_notes','phorest_visit_notes','product_usage_lines',
               'phorest_client_since','phorest_appt_requests','phorest_visit_clients']
$function$;
