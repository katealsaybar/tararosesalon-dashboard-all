-- Google Reviews: names found in comments that nobody was tagged for (Kate, 13 Oct 2026). Already applied; this is the record.
-- 318 reviews had a comment and no tagged staff. Many named someone who is not in staff_name_variants (mostly people who have left),
-- so 15 name rows were added, all "(former)", no profile card. home_branch is KCA where every review was at Khalifa City A; Zoe has none
-- (her reviews are KCA 2020, AQ 2024-25 and MC 2025). Roles are read from what the reviews say, not confirmed (Kristy's most of all).
-- Distinctive names are loose (any case, any branch); common ones (Denise, Hannah, Jodi, Emily, Anne) are strict (capitalised, KCA only).
-- Shain is a typo row for Shian (Sarah Pickering, KCA Sep 2024).
-- Four reviews tagged by hand in google_reviews.staff_manual, because the text spelled the name in a way the table rightly does not match:
--   MAY: Sara Almansoori (KCA 2023, "MAY IS THE KINDEST"), Yasmine zneidi (KCA Nov 2025, "with may"), mariam al h (KCA Sep 2025, "with may");
--   ZARA: Orla Kenny (KCA 2023, "zara was my", the review is about Saadiyat).
-- Left out on purpose, waiting for Kate: Mave (KCA Dec 2025), Mai (KCA 2024), Katy and Kat (KCA 2025, 2021), Dani (KCA 2025), jemmy (KCA 2022),
-- Nicking (KCA 2024). They could be typos of Mae, May, Katie, Danika, Jaime and Nikki.
insert into public.staff_name_variants (staff_key, variant, kind, strict, ci, note, label, home_branch, role) values
 ('ZOE',     'Zoe',     'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews', 'Zoe (former)', null, 'Stylist'),
 ('KARINA',  'Karina',  'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews', 'Karina Kazaryan (former)', 'KCA', 'Stylist'),
 ('JAIME',   'Jaime',   'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews', 'Jaime (former)', 'KCA', 'Stylist'),
 ('SHIAN',   'Shian',   'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews', 'Shian (former)', 'KCA', 'Stylist'),
 ('SHIAN',   'Shain',   'typo', false, false, 'Sarah Pickering KCA Sep 2024', null, null, null),
 ('LUNA',    'Luna',    'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews', 'Luna (former)', 'KCA', 'Stylist'),
 ('MILIZA',  'Miliza',  'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews', 'Miliza (former)', 'KCA', 'Beauty Therapist'),
 ('SHERINE', 'Sherine', 'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews', 'Sherine (former)', 'KCA', 'Stylist'),
 ('RHIAN',   'Rhian',   'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews', 'Rhian (former)', 'KCA', 'Stylist'),
 ('KRISTY',  'Kristy',  'name', false, false, 'Added 13 Oct 2026 from untagged Google reviews; role not confirmed', 'Kristy (former)', 'KCA', 'Stylist'),
 ('DENISE',  'Denise',  'name', true,  false, 'Added 13 Oct 2026 from untagged Google reviews', 'Denise (former)', 'KCA', 'Stylist'),
 ('HANNAH',  'Hannah',  'name', true,  false, 'Added 13 Oct 2026 from untagged Google reviews', 'Hannah (former)', 'KCA', 'Stylist'),
 ('JODI',    'Jodi',    'name', true,  false, 'Added 13 Oct 2026 from untagged Google reviews', 'Jodi (former)', 'KCA', 'Beauty Therapist'),
 ('EMILY',   'Emily',   'name', true,  false, 'Added 13 Oct 2026 from untagged Google reviews', 'Emily (former)', 'KCA', 'Stylist'),
 ('ANNE',    'Anne',    'name', true,  false, 'Added 13 Oct 2026 from untagged Google reviews', 'Anne (former)', 'KCA', 'Stylist')
on conflict (staff_key, variant) do nothing;
