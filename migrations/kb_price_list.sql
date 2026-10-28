-- Kate, 28 Oct 2026: the 2026 price list on Team Home (Belle: "pricelist, para sa mga bagong mag-onboard"), searchable, Level 1 up.
-- Hair and Beauty price pages (11 pages, section 'price-list') come from the two client-ready PDFs built from 2026 NEW PRICELIST.pdf.
-- Opens for every Level 1 staff team ('All', as ROSES Magazine does: the first marker that opens a section to Front Desk and Call Centre
-- Level 1 together) and Levels 2 and up. Level 4 (accounts) is not skipped. A later tick on Page Access (kb:price-list) can change Levels 2 to 4.
-- The page rows themselves are not in this public repo: they were loaded into kb_pages from kb-content/out/price-list-load.sql in the private cowork repo.
insert into public.kb_sections (key, dept, min_level, staff_dept, sort) values
  ('price-list', 'Front Desk', 2, 'All', 56)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level,
  staff_dept = excluded.staff_dept, sort = excluded.sort;
