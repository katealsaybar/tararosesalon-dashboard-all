-- Kate, 2 Oct 2026: My Numbers ("Couldn't load the numbers just now") timed out on a cold
-- load. Applied to gvijxenafoowajqktqvd the same day as two migrations:
--   perf_date_indexes            date indexes behind perf_dashboard's "data through" line
--   perf_clients_her_clients_only perf_clients ranks only her clients' visits, not all 171k
--                                 lines (144 of 144 staff-months identical, 9x faster)
-- plus anon statement_timeout 3s -> 8s. perf_dashboard went from 0.5-1.7s warm and 3s+
-- cold to 0.1s on average (0.3s worst) across the 48 active staff.
create index if not exists idx_phorest_staff_daily_date on public.phorest_staff_daily (date);
create index if not exists idx_branch_staff_daily_date_live on public.branch_staff_daily (date) where total > 0;
create index if not exists idx_staff_utilisation_date_to on public.staff_utilisation (date_to);
create index if not exists idx_sales_transaction_lines_date on public.sales_transaction_lines (date);
create index if not exists idx_google_reviews_review_date on public.google_reviews (review_date);
alter role anon set statement_timeout = '8s';
notify pgrst, 'reload config';
-- perf_clients: the live definition is in the database (pg_get_functiondef); the change
-- is the "days" CTE reading `where client_name in (select client_name from mine)`, with
-- "mine" moved above it.
