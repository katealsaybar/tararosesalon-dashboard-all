-- Kate, 25 Nov 2026: Total clients = Salon + Request + NCR + New for Hair and Beauty alike, Rebooked never in it. The weekly-ledger Apps Script left NCR out of the Beauty total,
-- so the rule now lives in the database: whatever any script writes, total is worked out from the four columns. No Apps Script change needed. Applied live; the 275 Beauty rows
-- below their own sum were corrected the same day (old totals kept in branch_staff_daily_total_backup_25nov).
create or replace function public.branch_staff_daily_set_total()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.total := coalesce(new.salon, 0) + coalesce(new.req, 0) + coalesce(new.ncr, 0) + coalesce(new.new_client, 0);
  return new;
end $$;

drop trigger if exists branch_staff_daily_total on public.branch_staff_daily;
create trigger branch_staff_daily_total
  before insert or update on public.branch_staff_daily
  for each row execute function public.branch_staff_daily_set_total();
