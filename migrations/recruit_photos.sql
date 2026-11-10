-- Recruitment: a photo on a person (Kate, 10 Nov 2026). Run after recruitment.sql and recruitment_dedupe.sql. Additive.
--
-- Instagram will not hand over a profile picture without Meta app review (20 handle test on 10 Nov 2026: Meta error 10 on all 20), so Kate and Coach Emma
-- add the photo themselves, one by one on the avatar or in bulk by file name. Same two people as the page (recruit_guard).
--   recruit_applicants.photo_path   path inside the private bucket recruit-photos, "<applicant id>/<time>.jpg"; null = initials
--   bucket recruit-photos           private, 512 KB a file, jpeg / png / webp (the page resizes to 240 px and saves a jpeg, about 15 KB)
--   recruit_can()                   true for the people the page is open to (the guard without the exception), used by the storage policies
--   recruit_set_photo(id, path)     attaches an uploaded file, returns the old path so the page can remove that file
--   recruit_clear_photo(id)         back to initials, returns the old path
--   recruit_get()                   now also returns 'photo' per person
-- A merge (recruit_do_merge) keeps the kept person's photo; the dropped person's row, photo path included, stays in recruit_merge_log.
-- Undo: drop the two functions and recruit_can, the four policies, the column, delete the bucket's files and the bucket, and put recruit_get back from recruitment.sql plus reviewed_at / reviewed_by.

alter table public.recruit_applicants add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recruit-photos', 'recruit-photos', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 524288, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.recruit_can() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  return m.name is not null and (m.level >= 5 or 'recruitment' = any (coalesce(m.extra_pages, '{}'::text[])));
end $$;
revoke all on function public.recruit_can() from public, anon;
grant execute on function public.recruit_can() to authenticated;

drop policy if exists recruit_photos_read on storage.objects;
drop policy if exists recruit_photos_add on storage.objects;
drop policy if exists recruit_photos_change on storage.objects;
drop policy if exists recruit_photos_remove on storage.objects;
create policy recruit_photos_read   on storage.objects for select to authenticated using (bucket_id = 'recruit-photos' and public.recruit_can());
create policy recruit_photos_add    on storage.objects for insert to authenticated with check (bucket_id = 'recruit-photos' and public.recruit_can());
create policy recruit_photos_change on storage.objects for update to authenticated using (bucket_id = 'recruit-photos' and public.recruit_can()) with check (bucket_id = 'recruit-photos' and public.recruit_can());
create policy recruit_photos_remove on storage.objects for delete to authenticated using (bucket_id = 'recruit-photos' and public.recruit_can());

create or replace function public.recruit_set_photo(p_id uuid, p_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard(); old text;
begin
  if p_id is null or p_path is null or p_path not like p_id::text || '/%' then raise exception 'bad photo path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'recruit-photos' and o.name = p_path) then raise exception 'the photo did not upload'; end if;
  select photo_path into old from public.recruit_applicants where id = p_id for update;
  if not found then raise exception 'that person is no longer there'; end if;
  update public.recruit_applicants set photo_path = p_path, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'old', old);
end $$;

create or replace function public.recruit_clear_photo(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard(); old text;
begin
  select photo_path into old from public.recruit_applicants where id = p_id for update;
  if not found then raise exception 'that person is no longer there'; end if;
  update public.recruit_applicants set photo_path = null, updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'old', old);
end $$;

revoke all on function public.recruit_set_photo(uuid, text) from public, anon;
revoke all on function public.recruit_clear_photo(uuid) from public, anon;
grant execute on function public.recruit_set_photo(uuid, text) to authenticated;
grant execute on function public.recruit_clear_photo(uuid) to authenticated;

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
        'cv_link', a.cv_link, 'about', left(a.about, 800), 'source', a.source,
        'applied_at', a.applied_at, 'last_applied_at', a.last_applied_at, 'replied_at', a.replied_at,
        'candidate_replied_at', a.candidate_replied_at, 'bounced', a.bounced,
        'stage', a.stage, 'decided_by', a.decided_by, 'decided_at', a.decided_at, 'merged', cardinality(a.msg_ids),
        'reviewed_at', a.reviewed_at, 'reviewed_by', a.reviewed_by, 'photo', a.photo_path)
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $$;
