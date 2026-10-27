-- Kate, 27 Oct 2026: the ledger names the clients behind its New client request (NCR) count: on every day tab, under each stylist, a row of
-- Client (first name only), Type (N, R, SC, NCR, RB), Service, Amount. One row here per NCR line, so the NCR list can show the ledger's own clients
-- (drill_staff_new_clients, drill_staff_new_clients_ledger.sql). First names only, as typed by reception; staff is the day tab's column heading.
-- Read from the weekly ledger files by "phorest data export/ledgers/parse_ledger_ncr.py"; a push replaces every row of the branch and dates it covers.
-- Owner read only, RLS on, same push_tables pattern as phorest_appt_requests.

create table if not exists public.ledger_ncr_clients (
  id bigint generated always as identity primary key,
  branch text not null,
  date date not null,
  staff text not null,
  client_first text not null,
  client_key text not null,
  source text,
  pulled_at date not null default current_date
);
create index if not exists ledger_ncr_clients_day on public.ledger_ncr_clients (branch, date);
alter table public.ledger_ncr_clients enable row level security;
create policy owner_read on public.ledger_ncr_clients for select using ((select is_dashboard_owner()));

create or replace function public.push_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking','client_bookings','stock_levels','phorest_client_emails',
               'phorest_client_branches','phorest_client_notes','phorest_visit_notes','product_usage_lines',
               'phorest_client_since','phorest_appt_requests','phorest_visit_clients','ledger_ncr_clients']
$function$;
