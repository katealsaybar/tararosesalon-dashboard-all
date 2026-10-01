-- The dashboard lock, round 1 of 2 (Kate, 1 Oct 2026). Replaces the parked Phase B
-- (dashboard_sign_in_phase_b.sql, 25 Sep), which predates stock_order_lines.
--
-- Until now 21 tables answered to anyone holding the public key, and that key is in the
-- public repo. This round takes the public key off the 13 that nothing writes with it any
-- more; every one of them already has dashboard_users_read (anyone on dashboard_users) and
-- the owner's write rules, so signed-in people keep exactly what they had.
--
-- Checked before running, in the edge logs for 29 Sep to 1 Oct: the Apps Scripts write with
-- the secret key; the only signed-out reads of these tables from the live site were the
-- Reviews frame loading before sign-in (fixed in 254b9cc, it now loads on opening).
--
-- Round 2 (the six tables the Phorest pushers write: sales_transaction_lines,
-- staff_financial_totals, phorest_staff_daily, staff_utilisation, financial_totals,
-- stock_order_lines) waits for the pushers' .supabase-secret file.
--
-- Left open on purpose: event_allocations / event_allocation_log (the public MediCube page),
-- the perf_* RPCs (stylists' own links, token-checked), the sign-in card's functions.
--
-- To undo one table: create policy anon_all on public.<table> for all to anon using (true) with check (true);

do $$
declare t text;
begin
  foreach t in array array['branch_staff_daily','branch_targets','closed_days','product_usage',
    'service_data','staff_status','staff_targets','top_services']
  loop
    execute format('drop policy if exists anon_all on public.%I', t);
  end loop;
  foreach t in array array['daily_data','weekly_data','weekly_totals']
  loop
    execute format('drop policy if exists "Public read" on public.%I', t);
    execute format('drop policy if exists "Public insert" on public.%I', t);
    execute format('drop policy if exists "Public update" on public.%I', t);
    execute format('drop policy if exists "Public delete" on public.%I', t);
  end loop;
end $$;

drop policy if exists anon_read on public.google_reviews;
drop policy if exists snv_read on public.staff_name_variants;

-- The client-credit view runs as its owner (it needs perf_staff, which holds stylists'
-- private tokens), so table rules don't reach it. Same view, answering only people on the
-- dashboard list, and closed to the public key.
create or replace view public.google_review_client_credit as
 WITH visits AS MATERIALIZED (
         SELECT DISTINCT g.review_id, g.review_date, g.branch, g.comment, s.employee_name
           FROM google_reviews g
             JOIN sales_transaction_lines s ON lower(TRIM(BOTH FROM s.client_name)) = lower(TRIM(BOTH FROM g.reviewer)) AND s.date >= (g.review_date - 14) AND s.date <= g.review_date
          WHERE NOT COALESCE(g.date_approx, false) AND COALESCE(g.reviewer, ''::text) <> ''::text
        )
 SELECT DISTINCT v.review_id, v.review_date, v.branch,
    ( SELECT n.staff_key FROM staff_name_variants n WHERE n.staff_key = ANY (ps.ledger_names) LIMIT 1) AS staff_key,
    ps.phorest_name
   FROM visits v
     JOIN perf_staff ps ON ps.phorest_name = v.employee_name
  WHERE NOT review_names_anyone(COALESCE(v.comment, ''::text))
    AND (SELECT public.is_dashboard_user());
revoke all on public.google_review_client_credit from anon;
grant select on public.google_review_client_credit to authenticated;
