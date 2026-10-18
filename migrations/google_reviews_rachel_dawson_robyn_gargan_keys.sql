-- Kate, 18 Oct 2026: Rachel Dawson's reviews connected to the Google Reviews database, and the two former-stylist keys made to match their cards.
-- 1) The cards in staff-profiles.js are 'RACHEL DAWSON' and 'ROBYN GARGAN' (with a space, like every other two-word key there), but the name
--    rows and hand tags were saved as RACHEL_DAWSON and ROBYN_GARGAN, so the page listed each as a second, photo-less person and the
--    Podium Race count for the card read 0. The rows and tags are renamed to the card's key.
-- 2) staff_not (new): staff keys a review must NOT credit although its text names them. "Rachel" is both Rachel Dawson (Style Director,
--    Marasy 2020 to 2022, Saadiyat, Khalifa City A, Motor City, to March 2024) and Rachel White (Khalifa City A, Sep 2024 to Jan 2025), and the
--    loose spelling Rachel on key RACHEL (White) matched every one of them. A review tagged to Dawson by hand gets RACHEL here. The page
--    (add ons/google-reviews/app.js tagStaff) and league_review_counts() both honour it.
-- 3) Tagged: the 5 Motor City reviews dated Sep 2023 and the 1 dated Sep 2024 (Rachel White never worked at Motor City), and Leanne Healy's
--    Khalifa City A review dated Sep 2021 ("my colourist Rachel", five years back; White joined in Sep 2024). The 13 Khalifa City A reviews dated
--    Sep 2025 ("a year ago") stay on Rachel White. Left alone, waiting on Kate: Larisa Sorescu and Amanda Finkl (Khalifa City A, 2019),
--    Ciara Butler (Khalifa City A, 2024), Abby Giljum (Saadiyat, 2024).
update staff_name_variants set staff_key = 'RACHEL DAWSON' where staff_key = 'RACHEL_DAWSON';
update staff_name_variants set staff_key = 'ROBYN GARGAN' where staff_key = 'ROBYN_GARGAN';
update google_reviews set staff_manual = array_replace(staff_manual, 'RACHEL_DAWSON', 'RACHEL DAWSON') where 'RACHEL_DAWSON' = any(staff_manual);
update google_reviews set staff_manual = array_replace(staff_manual, 'ROBYN_GARGAN', 'ROBYN GARGAN') where 'ROBYN_GARGAN' = any(staff_manual);

alter table google_reviews add column if not exists staff_not text[];

update google_reviews set staff_manual = array['RACHEL DAWSON'], staff_not = array['RACHEL']
where review_id in ('seed:e5f1d39d439a40ca1bc69955', 'seed:ed512dc02f26f800c23a3efc', 'seed:03d18acb520b446bc0f5463a',
  'seed:2dce7a986dd19440b9f9c097', 'seed:1dc38e1ac744812a35279f35', 'seed:30a36651e6e2ae08a67a0603', 'seed:aee9874d589ef6fb8a2b05a7');
