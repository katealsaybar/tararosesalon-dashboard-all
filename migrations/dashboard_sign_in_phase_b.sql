-- Phase B of the dashboard sign-in (Kate, 25 Sep 2026). NOT applied yet.
-- Takes the public key's access away, so only signed-in people on dashboard_users
-- (Phase A) can read or change the dashboard's data.
--
-- Run ONLY after all three Apps Scripts send DASH_SERVICE_KEY instead of the public key:
--   sync-all-branches.gs, backfill-weekly-ledgers.gs, sync-voucher-redemptions.gs
-- Otherwise the ledger sync, the nightly backfill and the voucher redemption sync stop.
--
-- Left open on purpose:
--   event_allocations / event_allocation_log  (the public MediCube x Attria page)
--   perf_* RPCs  (stylists' own performance links; security definer, token-checked)
--   dashboard_email_allowed / dashboard_data_asof  (the sign-in card)

do $$
declare t text;
begin
  foreach t in array array['branch_staff_daily','branch_targets','closed_days',
    'financial_totals','phorest_staff_daily','product_usage','sales_transaction_lines',
    'service_data','staff_financial_totals','staff_status','staff_targets','staff_utilisation',
    'top_services']
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
-- private tokens), so it can't lean on table policies. Keep it that way, but only
-- answer for people on the list.
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

revoke execute on function public.get_service_years, public.get_top_clients,
  public.get_top_services, public.get_top_services_agg from anon;
