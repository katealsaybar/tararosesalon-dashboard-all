-- Kate, 5 Oct 2026: Phorest's own rebooking per staff per day, for the Phorest side of
-- My Numbers' Ledger | Phorest switch. Source: Phorest's Staff Performance Tracker
-- report, the only one with a per-staff Rebooked % (the Phorest app's "Rebooked
-- clients"), parsed by "phorest data export/staff performance tracker/parse_staff_tracker.py"
-- in the cowork repo. rebooked = round(visits * Rebooked % / 100). Backfilled 1 Jul to
-- 4 Oct 2026; daily from /daily-reports after that. Already applied to Supabase.
create table if not exists phorest_staff_rebooking (
  id bigint generated always as identity primary key,
  branch text not null,
  date date not null,
  employee_name text not null,
  visits int not null default 0,
  rebooked int not null default 0,
  rebooked_pct numeric,
  care_factor_pct numeric,
  utilisation_pct numeric,
  services_ex_vat numeric,
  created_at timestamptz not null default now(),
  unique (branch, date, employee_name)
);
create index if not exists phorest_staff_rebooking_emp_date on phorest_staff_rebooking (employee_name, date);
-- Read only through security-definer RPCs (perf_core), so RLS is on with no policies.
alter table phorest_staff_rebooking enable row level security;

-- The pushers write it through push_delete / push_insert.
create or replace function public.push_tables() returns text[] language sql immutable as $function$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking']
$function$;

-- perf_core's 'phorest' object gains rebooked, rebooking_pct and rebook_visits (the
-- tracker's own visits, which run a few under Staff Daily's; the rate uses them, as
-- Phorest does). Applied as an in-place patch of the live function:
--   r as (select count(*) n, coalesce(sum(visits),0) v, coalesce(sum(rebooked),0) reb
--         from phorest_staff_rebooking where employee_name = s.phorest_name and date between d1 and d2)
--   'rebooked', case when r.n > 0 then r.reb end,
--   'rebooking_pct', case when r.v > 0 then round(100.0 * r.reb / r.v, 1) end,
--   'rebook_visits', case when r.n > 0 then r.v end
-- with "from p, r, l, u". Null (not 0) for dates the tracker hasn't been pulled for.
