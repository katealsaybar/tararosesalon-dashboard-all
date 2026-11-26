-- The Weekly Product Plan's Supplier column now follows the Orders and Receipts page (Kate, 26 Nov 2026: "yes ilagay mo na sa plan").
-- Until now the plan named only DBD, Eideal and Madi, and every other brand counted as DBD (spend_plan_core: the supplier of the longest matching plan_scope brand pattern, else 'DBD').
-- Names are the suppliers of the Orders and Receipts page, spelled the same (DBD, MADI, EIDEAL, NEU, BS PRO, VIVANDI, APOTHECA, H2O). Which brand goes to which was read off that page's own mail
-- (item lines of DBD orders and invoices, BS PRO invoices, NEU, EIDEAL, VIVANDI, APOTHECA and H2O mail, Madi's order emails for Kevin Murphy and its brand introduction for K18) and the 13 Nov 2026 stock meeting
-- (Cloud Nine, Orly, Reflectosil). Bellami and Matis are on DBD's mail only. A brand with no supplier on the Orders page now says 'Not linked yet' instead of DBD: the '.' row is the catch-all that every
-- brand matches and the longest pattern wins, so a brand with its own row keeps that row's supplier. A matching row with no supplier would fall back to DBD, so every row has one.
-- A new brand needs a row here with its supplier. Applied to the live project on 26 Nov 2026; plan_scope rows are not part of the plan's scope rules (a brand pattern still only lets a product in; the '.' row already did that).
update public.plan_scope s set supplier = v.sup
from (values
  ('.', 'Not linked yet'), ('^evo', 'NEU'), ('alterna', 'DBD'), ('amazon keratin', 'EIDEAL'), ('authentic beauty', 'DBD'), ('brazilian blowout', 'Not linked yet'),
  ('caviar', 'DBD'), ('eideal', 'EIDEAL'), ('fab pro', 'NEU'), ('fibre clinix', 'DBD'), ('goldwell', 'Not linked yet'), ('k18', 'MADI'), ('kevin murphy', 'MADI'),
  ('madi', 'MADI'), ('olaplex', 'EIDEAL'), ('philip b', 'APOTHECA'), ('pure blue', 'H2O'), ('schwar', 'DBD'), ('schwarz', 'DBD'), ('stmnt', 'DBD'),
  ('vivandi', 'VIVANDI'), ('xitronix', 'Not linked yet')) as v(pat, sup)
where s.kind = 'brand' and s.pat = v.pat;
insert into public.plan_scope (kind, pat, label, supplier)
select 'brand', v.pat, null, v.sup
from (values
  ('fabuloso', 'NEU'), ('beauty ?works', 'BS PRO'), ('celebrity choice', 'BS PRO'), ('malibu', 'VIVANDI'), ('orly', 'MADI'), ('reflectosil', 'MADI'), ('cloud ?nine', 'MADI'),
  ('\mabc\M', 'DBD'), ('bellami', 'DBD'), ('^matis', 'DBD'), ('^keratin$', 'EIDEAL'), ('amazon', 'EIDEAL')) as v(pat, sup)
where not exists (select 1 from public.plan_scope b where b.kind = 'brand' and b.pat = v.pat);
