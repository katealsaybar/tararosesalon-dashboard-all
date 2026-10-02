-- Kate, 2 Oct 2026: the dashboard pages through branch_staff_daily_clean ordered by
-- (date, id); with no index on that order every 1,000-row page sorted the whole window
-- (19k rows for Jan-Oct, to disk). Read speed only; no data changes. Applied 2 Oct 2026.
create index if not exists idx_branch_staff_daily_date_id on public.branch_staff_daily (date, id);
