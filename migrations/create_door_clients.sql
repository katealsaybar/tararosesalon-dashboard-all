-- Clients through the door, per branch, for one window (Kate, 1 Oct 2026).
--
-- The dashboard's Clients figure has always been the ledger's per-staff count added
-- up: a client who saw a colourist and a beautician counts twice. This is the other
-- reading, from Phorest's Sales Transactions report: one client, one visit a day,
-- however many staff she saw. Retail-only buyers count (they came through the
-- door). Every line in the table names a client, and there is no generic walk-in
-- name, so a plain distinct name per day is the count.
--
-- SECURITY INVOKER on purpose: the caller's own RLS on sales_transaction_lines
-- applies, so a branch-scoped sign-in only ever sees its own branch here too.
create or replace function public.door_clients(p_from date, p_to date)
returns table (branch text, clients bigint, days bigint)
language sql stable security invoker
set search_path = public
as $$
  select l.branch,
         count(distinct (l.date, lower(trim(l.client_name)))) as clients,
         count(distinct l.date) as days
  from sales_transaction_lines l
  where l.date between p_from and p_to
    and coalesce(trim(l.client_name), '') <> ''
  group by l.branch
$$;

grant execute on function public.door_clients(date, date) to authenticated, anon;
