-- Kate, 28 Oct 2026: Belle's "STYLIST - Client matching UPDATED" sheet on Team Home, as a guide for everyone who books clients.
-- Opens for Level 1 Front Desk (staff_dept), Levels 2, 3 and 5; Level 4 skips it (skip_levels). Applied live 28 Oct 2026.
-- The one page (kb_pages slug client-matching-guide) holds the link to the Google Sheet and a plain description of its columns.
-- The page row itself is not in this public repo: the sheet link and the stylists' bios behind it stay out of the files.
insert into public.kb_sections (key, dept, min_level, staff_dept, skip_levels, sort) values
  ('client-matching', 'Front Desk', 2, 'Front Desk', '{4}', 55)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level,
  staff_dept = excluded.staff_dept, skip_levels = excluded.skip_levels, sort = excluded.sort;
