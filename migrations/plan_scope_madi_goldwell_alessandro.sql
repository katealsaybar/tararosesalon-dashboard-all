-- Goldwell and Alessandro are MADI's in Phorest (Kate, 27 Nov 2026: the Madi supplier list in Phorest holds Alessandro Spa and Goldwell Elumen, 79 products).
-- Both were already in the Weekly Product Plan (the '.' brand row and the Elumen and Alessandro category rows let them in) but said "Not linked yet" for supplier, so Order by supplier never showed MADI for them.
-- APPLIED 27 Nov 2026 (Kate said yes): goldwell goes from 'Not linked yet' to MADI, and a new brand row 'alessandro' is MADI (the longest matching pattern wins).
-- After it: Alessandro 62 + ALESSANDRO SPA 11 + Goldwell Professional Colour 13 plan rows say MADI. Only the supplier label changed: no Min, Max or Priority was touched.
update public.plan_scope set supplier = 'MADI' where kind = 'brand' and pat = 'goldwell';
insert into public.plan_scope (kind, pat, label, supplier)
select 'brand', 'alessandro', null, 'MADI' where not exists (select 1 from public.plan_scope where kind = 'brand' and pat = 'alessandro');

-- Checked against Phorest's own supplier filter on the Stock page (27 Nov 2026, each salon's account: SAA 36629, KCA 36539, MC 46729, AQ 52308; the GraphQL productBranchOverrides filterBy supplierId).
-- MADI holds: Alessandro (SAA), Goldwell Elumen (SAA), GHD HAIR (SAA), K18 and Kevin Murphy (SAA, MC, AQ), Cloud Nine and Madi Cloudnine (SAA, KCA, MC), Orly (KCA), Madi International OPI Nails (AQ).
-- NEU holds only Evo Fabuloso Pro / Fab Pro / Evo Fab Pro (every salon), already NEU in the plan. The one brand still missing was GHD HAIR: APPLIED, brand row 'ghd hair' is MADI (9 plan rows).
-- 'GHD Irons' (7 plan rows) is not in the MADI or NEU lists of any salon, so it stays Not linked yet.
insert into public.plan_scope (kind, pat, label, supplier)
select 'brand', 'ghd hair', null, 'MADI' where not exists (select 1 from public.plan_scope where kind = 'brand' and pat = 'ghd hair');
