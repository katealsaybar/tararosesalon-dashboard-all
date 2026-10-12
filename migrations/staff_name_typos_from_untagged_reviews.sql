-- Google Reviews: six typo rows for current staff, from the untagged-reviews check (Kate, 13 Oct 2026). Already applied; this is the record.
-- Kate said Mave, Mai, Katy, Kat, Dani and Nicking were typos of current staff. Checked against Phorest sales lines:
--   Mave    -> MEVIL   Sara "SoSo" S.B.O. is Sara Bin Othman, Long Blowdry with Mevil Miraflor at KCA on 28 Nov 2025 (the review is Dec 2025)
--   Mai     -> MAY     Merima Custovic (KCA, 2024) has had many blow-dries with May Fernandez since 2021
--   Katy    -> KATIE   "Haadia ." had a cut and finish with Katie Sanchez at KCA on 24 Mar 2025 (the review says a haircut with Katy)
--   Kat     -> KATIE   the review is from about 2021; Katie Sanchez was at KCA from 11 Aug 2021, Kate Siryk only from 3 Jan 2023
--   Dani    -> DINA    moza alnaqbi, pedicure and manicure at KCA, Sep 2025; Dina Paycao did 236 mani/pedi at KCA Jun-Dec 2025. NOT confirmed from a booking
--   Nicking -> NIKKI   "Nicking and Anne did hair" (KCA 2024); Nikki already has Nilki, Nikii, Niki as typos
-- Strict ones (capitalised, own branch only): Mai, Katy, Kat, Dani. Mave and Nicking are loose.
insert into public.staff_name_variants (staff_key, variant, kind, strict, ci, note) values
 ('MEVIL', 'Mave',    'typo', false, false, 'Sara Bin Othman had a Long Blowdry with Mevil on 28 Nov 2025'),
 ('MAY',   'Mai',     'typo', true,  false, 'Merima Custovic, KCA 2024'),
 ('KATIE', 'Katy',    'typo', true,  false, 'Haadia Rauf, KCA Sep 2025'),
 ('KATIE', 'Kat',     'typo', true,  false, 'Caroline Stotter-brooks, KCA 2021'),
 ('DINA',  'Dani',    'typo', true,  false, 'moza alnaqbi, KCA Sep 2025; not confirmed from a booking'),
 ('NIKKI', 'Nicking', 'typo', false, false, 'Jane Preston, KCA Sep 2024')
on conflict (staff_key, variant) do nothing;
