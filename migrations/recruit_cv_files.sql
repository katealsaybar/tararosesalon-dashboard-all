-- Recruitment: the CV a person attached to a direct email is kept on the dashboard (Kate, 11 Nov 2026). Run after recruit_photo_flag.sql. Additive.
--
-- A direct email carries its CV as an attached file, and Coach Emma has no access to info@, so the page showed "In the email" and nobody could read it. The mailbox script
-- (apps-script/sync-recruitment-mailbox.gs) now sends that attachment to the edge function recruit-cv-upload, which checks the push pass, keeps the file in a private bucket and
-- sets these three columns. Kate and Coach Emma open it from the page (a short-lived signed link, the same way the profile photos work).
--   bucket recruit-cvs                 private, 5 MB a file, pdf / doc / docx / jpeg / png / webp
--   recruit_applicants.cv_file         path inside the bucket, "<applicant id>/<time>-<safe file name>"; null = none stored
--   recruit_applicants.cv_file_name    the file name as attached (shown as the tooltip)
--   recruit_applicants.cv_file_msg     the Gmail message id it came from, so a re-run does not upload it again
--   policy recruit_cvs_read            Kate / Coach Emma only (recruit_can()); nobody can write from the browser, only the edge function (service role) writes
--   recruit_get()                      now returns 'cv_file' and 'cv_file_name' instead of 'msg_ids'
-- A merge (recruit_do_merge) does not carry cv_file across; the dropped person's row, file path included, stays in recruit_merge_log.
-- Undo: drop the three columns and the policy, delete the bucket's files and the bucket, delete the edge function, put recruit_get back from recruit_photo_flag.sql.

alter table public.recruit_applicants add column if not exists cv_file text;
alter table public.recruit_applicants add column if not exists cv_file_name text;
alter table public.recruit_applicants add column if not exists cv_file_msg text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recruit-cvs', 'recruit-cvs', false, 5242880, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp'];

drop policy if exists recruit_cvs_read on storage.objects;
create policy recruit_cvs_read on storage.objects for select to authenticated using (bucket_id = 'recruit-cvs' and public.recruit_can());

create or replace function public.recruit_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  return jsonb_build_object(
    'me', who,
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from public.recruit_settings s), '{}'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'email', a.email, 'whatsapp', a.whatsapp,
        'country', a.country, 'emirate', a.emirate, 'experience', a.experience, 'specialist', a.specialist, 'paths', a.paths,
        'role_key', a.role_key, 'role_txt', a.role_txt, 'work_link', a.work_link, 'link_kind', a.link_kind, 'ig_handle', a.ig_handle,
        'cv_link', a.cv_link, 'cv_file', a.cv_file, 'cv_file_name', a.cv_file_name, 'about', left(a.about, 800), 'source', a.source,
        'applied_at', a.applied_at, 'last_applied_at', a.last_applied_at, 'replied_at', a.replied_at,
        'candidate_replied_at', a.candidate_replied_at, 'bounced', a.bounced,
        'stage', a.stage, 'decided_by', a.decided_by, 'decided_at', a.decided_at, 'merged', cardinality(a.msg_ids),
        'reviewed_at', a.reviewed_at, 'reviewed_by', a.reviewed_by, 'photo', a.photo_path, 'photo_bad', a.photo_unprofessional, 'mailboxes', to_jsonb(a.mailboxes))
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $$;
