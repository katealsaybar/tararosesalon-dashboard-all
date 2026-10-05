-- Team Home: the Call Centre Team (Kate, 5 Oct 2026). Two sections, coming soon
-- until pages land in kb_pages. Level 2 and up open them; staff_dept 'Call Centre'
-- is ready for when kb_staff_dept_for() maps call centre staff (it does not yet).
insert into public.kb_sections (key, dept, min_level, staff_dept, sort) values
  ('call-centre',           'Call Centre', 2, 'Call Centre', 62),
  ('call-centre-induction', 'Call Centre', 2, 'Call Centre', 64)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level,
  staff_dept = excluded.staff_dept, sort = excluded.sort;
