-- Kate, 18 Oct 2026: the two Marasy reviews left over from google_reviews_marasy_staff_tags.sql, settled by Kate.
-- Already run. Nada Gamil 6 Dec 2022 "Katie" is Katie Sanchez (KCA, key KATIE). Sarize Fourie 17 May 2020 "Rachel Dawson" is a
-- former hair stylist (Instagram hair_by_racheld), not Rachel White (key RACHEL), so she gets her own key; the variant is strict with
-- no home branch, so it never matches text by itself. Her photo is still to be found (staff_name_variants.photo).
insert into staff_name_variants (staff_key, variant, kind, strict, ci, label, home_branch, role, note)
values ('RACHEL_DAWSON', 'Rachel Dawson', 'name', true, false, 'Rachel Dawson (former)', null, 'Stylist',
 $n$Kate, 18 Oct 2026: Rachel Dawson, a former hair stylist (Instagram hair_by_racheld), named by Sarize Fourie on Marasy's page, 17 May 2020. NOT Rachel White (key RACHEL, KCA). Strict with no home branch, so the name never matches review text by itself; attached by hand through google_reviews.staff_manual. Photo still to find.$n$)
on conflict (staff_key, variant) do nothing;
update google_reviews set staff_manual = array['KATIE'] where review_id = 'seed:manual-mry-184e72ed126b6dda' and branch = 'Marasy, Abu Dhabi';
update google_reviews set staff_manual = array['RACHEL_DAWSON'] where review_id = 'seed:manual-mry-172257bc1cf3dad9' and branch = 'Marasy, Abu Dhabi';
