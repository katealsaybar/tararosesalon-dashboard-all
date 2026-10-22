-- Kate, 22 Oct 2026: the SOPs and inductions are Level 2 and up for now, because many of their pages still say "to check".
-- Level 1 (staff) reaches a section through kb_sections.staff_dept (kb_can_read_for and kb_access_as read it), so clearing it takes the
-- eight Learn sections away from Level 1 and leaves Levels 2, 3 and 5 as they were (min_level 2; Level 4 already skips them, see
-- kb_level4_sections.sql). card-links keeps 'Call Centre' and magazines (ROSES) keeps 'All'.
-- To put them back for staff, once the pages are checked:
--   update public.kb_sections set staff_dept = 'Hair' where key in ('hair-sop', 'hair-induction');
--   update public.kb_sections set staff_dept = 'Beauty' where key in ('beauty-sop', 'beauty-induction');
--   update public.kb_sections set staff_dept = 'Front Desk' where key in ('front-desk', 'front-desk-induction');
--   update public.kb_sections set staff_dept = 'Call Centre' where key in ('call-centre', 'call-centre-induction');

update public.kb_sections set staff_dept = null
 where key in ('hair-sop', 'hair-induction', 'beauty-sop', 'beauty-induction',
               'front-desk', 'front-desk-induction', 'call-centre', 'call-centre-induction');
