-- Kate, 27 Oct 2026: one row per branch, day and client name key from Phorest appointments (PAID only):
-- requested = at least one appointment where the client asked for the stylist (staffRequested). Pulled by
-- "phorest data export/new clients/pull_appt_requests.py" (daily via refresh_appt_requests.py, backfilled from
-- 2021 for SAA and KCA, Nov 2022 MC, Aug 2023 AQ, Sep 2026 Bahrain). Feeds door_request_days (door_request_clients.sql).
-- Owner read only. Run this file as it is, before door_request_clients.sql.

create table if not exists public.phorest_appt_requests (
  branch text not null,
  date date not null,
  name_key text not null,
  requested boolean not null default false,
  appts integer not null default 1,
  pulled_at date not null default current_date,
  primary key (branch, date, name_key)
);
create index if not exists phorest_appt_requests_date on public.phorest_appt_requests (date, branch);
alter table public.phorest_appt_requests enable row level security;
create policy owner_read on public.phorest_appt_requests for select using ((select is_dashboard_owner()));

create or replace function public.push_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking','client_bookings','stock_levels','phorest_client_emails',
               'phorest_client_branches','phorest_client_notes','phorest_visit_notes','product_usage_lines',
               'phorest_client_since','phorest_appt_requests']
$function$;
