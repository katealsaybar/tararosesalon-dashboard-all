-- Kate, 28 Oct 2026: Belle's "CLIENT MARKETING OPT-OUT LIST" sheet on Team Home, so everyone who sends or approves a blast checks it first.
-- Opens for Level 1 Front Desk and Call Centre (staff_dept 'Reception'), Levels 2, 3 and 5; Level 4 skips it (skip_levels). Applied live 28 Oct 2026.
-- The one page (kb_pages slug marketing-optout-list) holds the link to the Google Sheet and a plain description of its columns.
-- The page row itself is not in this public repo: the sheet link, with clients' names and numbers behind it, stays out of the files.
insert into public.kb_sections (key, dept, min_level, staff_dept, skip_levels, sort) values
  ('marketing-optout', 'Front Desk', 2, 'Reception', '{4}', 57)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level,
  staff_dept = excluded.staff_dept, skip_levels = excluded.skip_levels, sort = excluded.sort;
