-- K18 joins the Weekly Product Plan (and so Out of Stock), Kate, 26 Nov 2026: "may K18 and Malibu na ah i add mo na yun".
-- K18 is on the Phorest Stock List now (brand "K18 Biomimetic Hair Science", category "K18 Professional": 4 professional and 2 retail products in each of the four UAE salons).
-- The plan takes a product when its brand matches a plan_scope 'brand' pattern (a regex on the lower-cased brand) and its category matches a plan_scope 'cat' row (the whole category name).
-- No supplier is set here on purpose: the plan shows DBD as its default, and Out of Stock reads the supplier off the brand (K18 goes to MADI, from the 13 Nov 2026 stock meeting, not yet confirmed
-- with ate Tine). Malibu was already in the plan (brand Vivandi, category Malibu).
-- Applied to the live project on 26 Nov 2026. A K18 product shows on Out of Stock only once its Min is above 0: Min comes from use, and there is no K18 use yet, so the Min is set in the Weekly Product Plan.
insert into public.plan_scope (kind, pat, label, supplier)
select 'brand', 'k18', null, null where not exists (select 1 from public.plan_scope where kind = 'brand' and pat = 'k18');
insert into public.plan_scope (kind, pat, label, supplier)
select 'cat', 'K18 Professional', 'K18', null where not exists (select 1 from public.plan_scope where kind = 'cat' and pat = 'K18 Professional');
