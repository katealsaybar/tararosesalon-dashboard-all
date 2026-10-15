-- Phorest staff roster with positions (Phorest category), active + archived.
-- Loaded 15 Oct 2026 from the 14 Oct pull (Downloads/TRS-staff-roster-all-branches-14Oct2026.xlsx).
-- Position = the Phorest staff category, current value only, no history.
-- No PINs, mobiles or emails are stored. Rows are loaded by hand, not in this file.
-- Reload a pull: delete from phorest_staff_roster where pulled_on = '<date>'; then insert again.
create table if not exists public.phorest_staff_roster (
  id           bigserial primary key,
  branch       text    not null,   -- SAA KCA MC AQ BAH MRY (Marasy, closed) FRT (Fratelli, closed)
  phorest_biz  bigint  not null,   -- Phorest branch id in the staff URL
  staff_name   text    not null,
  position     text,               -- raw Phorest category, e.g. '2 Senior Stylist'
  position_clean text,             -- same without the leading rank number
  archived     boolean not null,   -- true = leaver
  added_on     date,               -- added to Phorest
  updated_on   date,               -- last updated (archive date when archived)
  pulled_on    date    not null default '2026-10-14',
  created_at   timestamptz not null default now()
);

create index if not exists phorest_staff_roster_branch_idx on public.phorest_staff_roster (branch, archived);

alter table public.phorest_staff_roster enable row level security;

-- Same pattern as staff_targets: dashboard users read (branch-scoped viewers see their branch), owner writes.
drop policy if exists dashboard_users_read on public.phorest_staff_roster;
create policy dashboard_users_read on public.phorest_staff_roster for select to authenticated
  using ((select is_dashboard_user()) and ((select dashboard_scope()) is null or branch = (select dashboard_scope())));
drop policy if exists dashboard_owner_insert on public.phorest_staff_roster;
create policy dashboard_owner_insert on public.phorest_staff_roster for insert to authenticated
  with check ((select is_dashboard_owner()));
drop policy if exists dashboard_owner_update on public.phorest_staff_roster;
create policy dashboard_owner_update on public.phorest_staff_roster for update to authenticated
  using ((select is_dashboard_owner()));
drop policy if exists dashboard_owner_delete on public.phorest_staff_roster;
create policy dashboard_owner_delete on public.phorest_staff_roster for delete to authenticated
  using ((select is_dashboard_owner()));
