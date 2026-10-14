-- Team Home: Magazines (Kate, 14 Oct 2026). /hub/magazines holds the 2022 ROSES magazine
-- issues (8 PDFs, compressed to 5-12 MB each from Tara's Drive "magazines" folder). The PDFs
-- are too big for a bytea column, so they sit in a private Storage bucket and kb_files carries
-- the paths; the page asks for a signed link on each click. Level 2 and up open it (all staff since kb_magazines_all_staff.sql; same rule
-- as hr-forms): kb_can_read('magazines') gates both the kb_files row and the bucket objects.
-- Nothing of the files is in this repo (public). Already applied to Supabase. The files went
-- in through a short-lived anon insert policy on the bucket, dropped right after.

insert into public.kb_sections (key, dept, min_level, staff_dept, sort) values
  ('magazines', 'Marketing', 2, null, 92)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level,
  staff_dept = excluded.staff_dept, sort = excluded.sort;

alter table public.kb_files add column if not exists path  text;   -- object name in kb-magazines
alter table public.kb_files add column if not exists cover text;   -- cover image, same bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kb-magazines', 'kb-magazines', false, 31457280, array['application/pdf', 'image/jpeg'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types, public = false;

drop policy if exists kb_magazines_read on storage.objects;
create policy kb_magazines_read on storage.objects for select to authenticated
  using (bucket_id = 'kb-magazines' and (select public.kb_can_read('magazines'))
         and (select public.kb_level()) >= 2);

-- The 8 issues (2022). Files: magazines/<yyyy-mm[-mm]>.pdf and .jpg in kb-magazines; bytes filled
-- from storage.objects metadata. Newest first (sort 10 = Nov-Dec ... 80 = January).
--   RM-1112 Nov-Dec (Creative Issue) 38 pp · RM-0910 Sep-Oct 30 pp · RM-0607 Jun-Jul (Issue 11-12) 22 pp
--   RM-05 May (10) 18 pp · RM-04 Apr (09) 31 pp, carries 2022 prices · RM-03 Mar (08) 20 pp
--   RM-02 Feb (07) 18 pp · RM-01 Jan (06) 18 pp
-- To add an issue: compress the PDF (images to about 150 dpi), upload it and a 527x682 cover to the
-- bucket (temporary anon insert policy on storage.objects, dropped right after), insert a kb_files row.
