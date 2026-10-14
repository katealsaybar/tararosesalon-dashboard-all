-- Team Home: Staff Card Links (Kate, 14 Oct 2026). /hub/card-links holds a link per stylist and
-- beautician to her card on promo.tararosesalon.com/stylist--beautician-cards-page, by branch and
-- department, for the call centre. Level 2 and up open it, and staff_dept 'Call Centre' is ready
-- for when kb_staff_dept_for() maps call centre staff (it does not yet, same as call-centre).
insert into public.kb_sections (key, dept, min_level, staff_dept, sort) values
  ('card-links', 'Call Centre', 2, 'Call Centre', 66)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level,
  staff_dept = excluded.staff_dept, sort = excluded.sort;
