-- ============================================================
-- branch_staff_daily_clean
-- Applied to Supabase 13 Aug 2026. Kate + Claude.
-- ============================================================
--
-- WHY
-- The SAA Beauty sheet feeds label rows into branch_staff_daily alongside real
-- staff. Two of them, found 13 Aug 2026:
--
--   staff_name  rows  range              sum(ncr)
--   ']'          165  01 Feb - 12 Aug     156,609
--   'RETAIL'      27  02 Feb - 09 May      37,677
--
-- Both carry zero clients, zero req, zero salon, zero rebooked. The only thing
-- in them is a retail AED figure sitting in the ncr column. Summed into group
-- NCR they read as new client requests:
--
--   period            raw        clean
--   1-12 Aug all      689.32%    1.80%
--   1-12 Aug beauty 2,596.34%    1.05%
--   full 2026         955.86%    1.84%
--
-- Client counts are identical either way, so nothing real is being dropped.
-- Every other branch and department is clean: max ncr on a single row is 3.
--
-- WHY THE ROWS ARE STILL THERE
-- That ncr figure is the only record of roughly AED 194,286 of SAA Beauty
-- retail. branch_staff_daily has retail_unit_qty but no retail AED column, so
-- deleting these rows would destroy the amount rather than clean it up. They
-- stay put and this view hides them. When there is somewhere honest to put the
-- money, it can be recovered from here.
--
-- THE REAL FIX IS UPSTREAM
-- The Apps Script that syncs the sheet's _temp_placeholder tab into this table
-- should not send label rows at all. That script lives with the Google Sheet,
-- not in this repo, so this view is the guard until it is corrected. The ']'
-- rows are still arriving as of 12 Aug.
--
-- TWO GUARDS, DELIBERATELY
-- The name list catches the labels we know about. The behavioural rule catches
-- the ones we do not: a row with no clients and no visits of any kind cannot
-- honestly report a new client request, whatever it calls itself.

create or replace view branch_staff_daily_clean as
select *
from branch_staff_daily
where staff_name ~ '[A-Za-z]'
  and upper(btrim(staff_name)) not in
      ('RETAIL','TOTAL','TOTALS','SUBTOTAL','GRAND TOTAL','SERVICES','TREATMENT','TREATMENTS')
  and not (
        coalesce(total,0) = 0
    and coalesce(req,0) + coalesce(salon,0) + coalesce(new_client,0) + coalesce(rebooked,0) = 0
    and coalesce(ncr,0) > 0
  );

-- Without this the view runs with its owner's rights and reads the table whatever
-- that table's RLS says. branch_staff_daily's policy is anon_all USING (true), so
-- nothing was ever exposed that anon could not already read — but if that policy
-- is tightened later, a definer-rights view would keep returning the rows it is
-- meant to withhold, and the leak would be through the view nobody re-checks.
alter view public.branch_staff_daily_clean set (security_invoker = on);

comment on view branch_staff_daily_clean is
  'branch_staff_daily with the sheet label rows removed. Use this for every metric. See migration branch_staff_daily_clean_view, 13 Aug 2026.';

-- NOT YET WIRED IN
-- dashboard.js still reads branch_staff_daily directly, so NCR on screen is
-- still wrong. Pointing it at this view is a separate change.
