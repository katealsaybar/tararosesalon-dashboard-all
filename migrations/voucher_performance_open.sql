-- Wellness Voucher Performance: open the report's numbers, keep the names locked.
-- Run in Supabase: Dashboard -> SQL Editor -> New Query -> paste -> Run.
-- Project: vlqvefsaxztitcbhirxt (the voucher project, NOT the dashboard's gvijxenafoowajqktqvd).
-- Idempotent, safe to re-run. Re-running voucher_lockdown.sql does not undo it: that file only
-- revokes issue_voucher and the five tables, and this is neither.
--
-- WHY: the embedded report (wellness-voucher-approvals/performance/) used to ask for the
-- voucher sign-in on top of the dashboard login. Kate, 9 Oct 2026: anyone viewing the
-- dashboard report should see it straight away.
--
-- WHAT IT OPENS: one function that returns live vouchers with only the columns the report
-- draws (branch, tier, AED amounts, dates, payment method, referral count) plus their
-- redemptions (date, amount). No client_name, no client_contact, no stylist, no service, no
-- serial. security definer, so anon still holds NO grant on voucher_log, voucher_issues or
-- voucher_redemptions: the tables stay shut and client names stay behind the sign-in.
-- "Save as xlsx" (names) still asks for the sign-in.
--
-- WHAT THIS MEANS: anyone with the publishable key (it is in the public page source) can call
-- voucher_perf_data() and read the totals. Counts and AED, no people.

create or replace function public.voucher_perf_data()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select id, branch, tier, paid_aed, credit_aed, redeemed_aed, remaining_aed,
           payment_method, purchase_date, main_expires_on, friends_so_far,
           referral_earned, is_voided, is_archived
      from public.voucher_log
     where not coalesce(is_voided, false) and not coalesce(is_archived, false)
  )
  select json_build_object(
    'vouchers',    coalesce((select json_agg(l) from live l), '[]'::json),
    'redemptions', coalesce((select json_agg(json_build_object(
                      'issue_id', u.issue_id, 'redeemed_on', u.redeemed_on, 'amount_aed', u.amount_aed))
                      from public.voucher_redemptions u
                     where u.issue_id in (select id from live)), '[]'::json)
  );
$$;

revoke all on function public.voucher_perf_data() from public;
grant execute on function public.voucher_perf_data() to anon, authenticated;

-- Check (expect ONE row with a vouchers array and a redemptions array, no client_name anywhere):
--   select public.voucher_perf_data();
-- Check the tables are still shut (expect ZERO rows):
--   select table_name, privilege_type from information_schema.role_table_grants
--    where grantee = 'anon' and table_name in ('voucher_issues','voucher_log','voucher_redemptions');
