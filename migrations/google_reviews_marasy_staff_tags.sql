-- Kate, 18 Oct 2026: Marasy's emailed reviews matched to the stylists they name, by hand (google_reviews.staff_manual).
-- Already run on the dashboard's Supabase. Marasy's Robyn is Robyn Gargan (Phorest MRY 1 Jul 2021 to 18 Dec 2022), not Robyn Hart
-- at Motor City (key ROBYN), so she gets her own key; the variant is strict with no home branch, so it never matches text by itself.
-- Not tagged on purpose: Nada Gamil 6 Dec 2022 ("Katie": Kate Siryk or Katie Sanchez?) and Sarize Fourie 17 May 2020
-- ("Rachel Dawson": the only Rachel on file is Rachel White at KCA).
insert into staff_name_variants (staff_key, variant, kind, strict, ci, label, home_branch, role, note)
values ('ROBYN_GARGAN', 'Robyn Gargan', 'name', true, false, 'Robyn Gargan (former)', null, 'Stylist',
 $n$Kate, 18 Oct 2026: Robyn Gargan, Marasy hair stylist (Phorest Robyn Gargan at Marasy 1 Jul 2021 to 18 Dec 2022, 283 days; ledger ROBYN there from Jan 2021). NOT Robyn Hart (key ROBYN, Motor City from Sep 2022). Strict and no home branch, so her name never matches text on its own: she is only ever attached by hand (google_reviews.staff_manual) to Marasy reviews that say Robyn.$n$)
on conflict (staff_key, variant) do nothing;

update google_reviews g set staff_manual = t.k
from (values
 ('seed:manual-mry-1806ac2cd757f93f', array['TEGAN','JACKIE']),
 ('seed:manual-mry-digest-1', array['ROBYN_GARGAN']),
 ('seed:manual-mry-digest-2', array['ROBYN_GARGAN']),
 ('seed:manual-mry-digest-3', array['ROBYN_GARGAN']),
 ('seed:manual-mry-digest-4', array['ROBYN_GARGAN']),
 ('seed:manual-mry-18024196b004c995', array['ROBYN_GARGAN']),
 ('seed:manual-mry-17fcd0619eeeacde', array['FAYE']),
 ('seed:manual-mry-17af42e27412b410', array['LUCIE']),
 ('seed:manual-mry-17abdf49c9df528e', array['JEIDA']),
 ('seed:manual-mry-17a018b68a9a513c', array['JEIDA']),
 ('seed:manual-mry-179ec82dbcf7e3a2', array['LUCIE','JACKIE']),
 ('seed:manual-mry-1798db65824a3ac7', array['LUCIE']),
 ('seed:manual-mry-179682bad6a23bdf', array['JEIDA']),
 ('seed:manual-mry-17917271c5f5ce47', array['LUCIE']),
 ('seed:manual-mry-178782fcd503ef68', array['KATE']),
 ('seed:manual-mry-178742ba2c435624', array['JEIDA']),
 ('seed:manual-mry-177a96360bc28379', array['ROBYN_GARGAN']),
 ('seed:manual-mry-177926c001dc29ff', array['JEIDA']),
 ('seed:manual-mry-1777dd285b6f23fb', array['EMMA']),
 ('seed:manual-mry-176dcddfac62d386', array['ROBYN_GARGAN']),
 ('seed:manual-mry-177074cd7cb6c910', array['JEIDA']),
 ('seed:manual-mry-176933ca45d52488', array['JEIDA']),
 ('seed:manual-mry-17655f6fa691456f', array['JEIDA']),
 ('seed:manual-mry-17641e77d28c81df', array['JEIDA']),
 ('seed:manual-mry-176230220a22bab4', array['JEIDA']),
 ('seed:manual-mry-175fb496215ccd12', array['JEIDA']),
 ('seed:manual-mry-175d9c7685fb722d', array['JEIDA']),
 ('seed:manual-mry-175cc7db86dc4ca4', array['JEIDA']),
 ('seed:manual-mry-17619f0b6ead6828', array['EMMA']),
 ('seed:manual-mry-175d5fd7d942c119', array['EMMA']),
 ('seed:manual-mry-17507d7b755f6ac1', array['JOANNE','JACKIE']),
 ('seed:manual-mry-174af4e5f74fab16', array['NICOLE']),
 ('seed:manual-mry-1749337ca2b822f5', array['NICOLE']),
 ('seed:manual-mry-17375bd4ef1bce59', array['ROBYN_GARGAN','JOANNE','MARICEL'])
) as t(id, k)
where g.review_id = t.id and g.branch = 'Marasy, Abu Dhabi';
