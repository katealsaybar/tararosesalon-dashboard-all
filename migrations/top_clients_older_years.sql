-- Top Clients for 2021 to 2024 and for Fratelli (Kate, 9 Oct 2026). Already applied to the live project;
-- this file records it, and is safe to run again.
--
-- sales_transaction_lines now holds Aug 2021 to Dec 2024 as well (backfilled from Phorest on 8-9 Oct 2026).
-- top_clients and top_clients_board floored every read at 2025-01-01. The floor is now
-- least(2025-01-01, p_from): a window that starts in 2025 or later reads exactly what it did before, and an
-- older window reads back as far as it asks (so "last seen" still reaches today either way).
-- top_clients also counts visits per branch-day through a branch list; Fratelli is added to it so a
-- Fratelli selection has visits (it closed on 22 May 2026, so All stays the four live branches).
-- lost_clients*, lost_client_detail and service_roster keep their 2025 floor on purpose.
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.top_clients'::regproc);
  d := replace(d, 's.date >= date ''2025-01-01''', 's.date >= least(date ''2025-01-01'', p_from)');
  d := replace(d, 'x.date >= date ''2025-01-01''', 'x.date >= least(date ''2025-01-01'', p_from)');
  d := replace(d, 'array[''SAA'',''KCA'',''MC'',''AQ''], p.branch', 'array[''SAA'',''KCA'',''MC'',''AQ'',''FRT''], p.branch');
  execute d;
  d := pg_get_functiondef('public.top_clients_board'::regproc);
  d := replace(d, 's.date >= date ''2025-01-01''', 's.date >= least(date ''2025-01-01'', p_from)');
  execute d;
end $mig$;
