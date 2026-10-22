-- Kate, 22 Oct 2026: Level 1 (the team) can open Wellness Voucher Performance (Team Home's 'campaigns' section).
-- The report is its own page, /wellness-voucher-approvals/performance/, with no sign-in: it reads totals only (cash collected, credit
-- placed, redeemed, by branch, who sold them), so a Level 1 login has nothing extra to read. 'All' is how a section opens to Level 1
-- staff of every department (kb_can_read_for and kb_access_as read staff_dept), the way ROSES Magazine does. Levels 2 to 5 are unchanged.
-- To undo: update public.kb_sections set staff_dept = null where key = 'campaigns';
update public.kb_sections set staff_dept = 'All' where key = 'campaigns';
