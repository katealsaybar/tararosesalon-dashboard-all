-- Kate, 19 Nov 2026: HR Forms & Waivers (the client waivers, HR forms and booking policy PDFs in kb_files) open to every active
-- staff member who is signed in (Level 1 included), not only Level 2 and up. Same rule Magazines already uses.
-- Applied the same day with the Supabase MCP. Signed-out visitors still get nothing: kb_can_read needs a signed-in staff email.
begin;
update public.kb_sections set staff_dept = 'All' where key = 'hr-forms';
drop policy kb_files_read on public.kb_files;
create policy kb_files_read on public.kb_files for select using (
  (select public.kb_can_read(kb_files.section)) and ((select public.kb_level()) >= 2 or section in ('magazines', 'hr-forms')));
commit;
-- To undo: update public.kb_sections set staff_dept = null where key = 'hr-forms'; then recreate kb_files_read with section = 'magazines' only.
