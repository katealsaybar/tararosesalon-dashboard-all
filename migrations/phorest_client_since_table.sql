-- Kate, 27 Oct 2026: Phorest client profile creation dates (Clients query clientSince), one row per client and
-- Phorest branch, UAE and Bahrain. Pulled by "phorest data export/new clients/pull_client_since.py" and pushed by
-- push_client_since.py (upsert on phorest_id, phorest_branch_id). Feeds door_first_visits (door_new_clients.sql):
-- a profile created before the first sales line means a client in the lines for the first time is not new.
-- Owner read only. Run this file as it is, before door_new_clients.sql.

create table if not exists public.phorest_client_since (
  phorest_id text not null,
  phorest_branch_id text not null,
  branch text not null,
  first_name text,
  last_name text,
  name_key text not null,
  client_since timestamptz,
  since_date date,
  walk_in boolean not null default false,
  archived boolean not null default false,
  pulled_at date not null default current_date,
  primary key (phorest_id, phorest_branch_id)
);
create index if not exists phorest_client_since_branch_date on public.phorest_client_since (branch, since_date);
create index if not exists phorest_client_since_key on public.phorest_client_since (name_key);
alter table public.phorest_client_since enable row level security;
create policy owner_read on public.phorest_client_since for select using ((select is_dashboard_owner()));

create or replace function public.push_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking','client_bookings','stock_levels','phorest_client_emails',
               'phorest_client_branches','phorest_client_notes','phorest_visit_notes','product_usage_lines',
               'phorest_client_since']
$function$;
