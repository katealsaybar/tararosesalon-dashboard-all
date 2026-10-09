-- Kate, 9 Oct 2026: spellings and former staff added to staff_name_variants while she went through Google reviews that
-- named a stylist the page did not recognise (the Reviews page and perf_review_names() both read this table). Applied live
-- as the reviews came up; this file is the record, and is safe to run again (rows that exist are skipped, notes fill in
-- only where empty).
--
-- Who is here:
--   Former stylists with no profile in staff-profiles.js (so no Staff Cards card): Paul, Callum, Nimi, Emin, Lina,
--   Aboudi, Billy. Each carries label "<name> (former)", home_branch and role on one row, as Daisy Cropper and the
--   Bahrain team do, which is how the page knows hair from beauty and which branch a strict name counts at.
--   Sunitha is NOT former: a current Al Quoz beauty therapist who has no card.
--   Extra spellings for people who already had rows: Ibrahim (Ebrahim, Ebraheem), Emin (Emiin), Callum (Calum),
--   Neeka (Neka), Ruth (her Instagram handle), MJ (Mj), Shine (Sunshine, and one exact phrase).
--
-- strict = counted only at the person's own branch (common first names); ci = any case. "shine for the pedicure" is an
-- exact phrase on purpose: shine is also an ordinary word, so no general lowercase rule was added.
-- Hazel Mae at Al Quoz is not here: it is ALSO_BRANCH in add ons/google-reviews/app.js.

create temp table _v (staff_key text, variant text, kind text, strict boolean, ci boolean, label text, home_branch text, role text, note text);
insert into _v values
 ('IBRAHIM', 'Ebrahim',   'typo', false, false, null, null, null, 'Kate, 9 Oct 2026: spelling used in reviews'),
 ('IBRAHIM', 'Ebraheem',  'typo', false, false, null, null, null, 'Kate, 9 Oct 2026: spelling used in reviews'),
 ('PAUL',    'Paul',      'name', true,  false, 'Paul (former)',   'AQ', 'Stylist',        'Kate, 9 Oct 2026: former stylist, Motor City Jul to Sep 2023 then Al Quoz to 1 Mar 2024; strict, Al Quoz only'),
 ('CALLUM',  'Callum',    'name', false, false, 'Callum (former)', 'AQ', 'Stylist',        'Kate, 9 Oct 2026: former stylist, Motor City Jul to Sep 2023 then Al Quoz to 1 Mar 2024'),
 ('CALLUM',  'Calum',     'typo', false, false, null, null, null, 'Kate, 9 Oct 2026: spelling used in reviews'),
 ('NIMI',    'Nimi',      'name', false, false, 'Nimi (former)',   'AQ', 'Style Director', 'Kate, 9 Oct 2026: former stylist, Al Quoz Nov 2023 to Jan 2025 (Motor City briefly)'),
 ('EMIN',    'Emin',      'name', false, false, 'Emin (former)',   'AQ', 'Stylist',        'Kate, 9 Oct 2026: former stylist, Al Quoz Mar to Aug 2024 (also Motor City and Fratelli)'),
 ('EMIN',    'Emiin',     'typo', false, false, null, null, null, 'Kate, 9 Oct 2026: spelling used in reviews'),
 ('LINA',    'Lina',      'name', false, false, 'Lina (former)',   'AQ', 'Stylist',        'Kate, 9 Oct 2026: former stylist (archived in Phorest), Saadiyat Dec 2023 to Feb 2024 then Al Quoz to Jul 2024'),
 ('ABOUDI',  'Aboudi',    'name', false, false, 'Aboudi (former)', 'AQ', 'Stylist',        'Kate, 9 Oct 2026: former stylist, Al Quoz Sep 2023 to Jan 2024'),
 ('BILLY',   'Billy',     'name', true,  false, 'Billy (former)',  'AQ', 'Stylist',        'Kate, 9 Oct 2026: former stylist (archived in Phorest), Al Quoz Mar to Dec 2024 and Fratelli to Jul 2025; strict, Al Quoz only'),
 ('SUNITHA', 'Sunitha',   'name', false, false, 'Sunitha',         'AQ', 'Beauty Therapist','Kate, 9 Oct 2026: current Al Quoz beauty therapist with no Staff Cards card'),
 ('NEEKA',   'Neka',      'typo', false, false, null, null, null, 'Kate, 9 Oct 2026: spelling used in reviews'),
 ('RUTH',    'rainbowsby_ruth', 'nickname', false, false, null, null, null, 'Kate, 9 Oct 2026: her Instagram handle, lower case'),
 ('MJ',      'Mj',        'typo', true,  false, null, null, null, 'Kate, 9 Oct 2026: written Mj, the MJ spelling is case-sensitive'),
 ('SHINE',   'Sunshine',  'nickname', true, false, null, null, null, 'Kate, 9 Oct 2026: Shine at Al Quoz; strict, case-sensitive'),
 ('SHINE',   'shine for the pedicure', 'typo', true, true, null, null, null, 'Kate, 9 Oct 2026: one exact phrase, lower case; no general lowercase shine rule (ordinary word)');

insert into staff_name_variants (staff_key, variant, kind, strict, ci, label, home_branch, role, note)
select v.staff_key, v.variant, v.kind, v.strict, v.ci, v.label, v.home_branch, v.role, v.note
from _v v
where not exists (select 1 from staff_name_variants s where s.staff_key = v.staff_key and s.variant = v.variant);

update staff_name_variants s set note = v.note
from _v v
where s.staff_key = v.staff_key and s.variant = v.variant and s.note is null;

drop table _v;
