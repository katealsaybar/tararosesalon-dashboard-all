-- Recruitment: a profile photo taken from the applicant's own CV (Kate, 16 Nov 2026). Run after recruit_ig_photos.sql. Additive.
--
-- Only for people who have NO photo at all (photo_path is null): a photo that Kate or Coach Emma added by hand is never touched, and neither is one the
-- Instagram sync fetched. Instagram goes first: a person who gave an Instagram handle is looked at here only after Instagram has been asked once.
-- A script on Kate's PC (recruitment cv photos/recruit_cv_photos.py) downloads the CV, finds ONE clear face image inside it with a face detector
-- (PDF first two pages, DOCX media, or a photo file sent as the CV), crops a square around the face and sends it through the edge function
-- recruit-cv-photo, which stores it in the private bucket recruit-photos and attaches it here. No face, several faces or no pictures: initials stay.
--
--   recruit_applicants.cv_photo_checked_at  last time the CV was looked at
--   recruit_applicants.cv_photo_result      ok / no_images / no_face / many_faces / unsupported / error
--   recruit_applicants.cv_photo_src         which CV that was (the stored file path or the link), so a new CV gets looked at again
--   recruit_applicants.photo_source         'cv' for these photos (null = by hand, 'instagram' = Instagram sync)
--   recruit_cv_photo_queue(n)               who to look at next: id, cv_link, cv_file (service role only)
--   recruit_cv_photo_done(id, result, path) records the answer; attaches the file only while the person still has no photo; returns true when attached
--   internal_secrets 'recruit_cv_photos_cron'  the header value the script sends (x-cron-secret); kept in the script's gitignored .env
-- Undo: drop the two functions, the three cv_photo columns and the secret row; delete files named <id>/cv-*.jpg in the bucket.

alter table public.recruit_applicants
  add column if not exists cv_photo_checked_at timestamptz,
  add column if not exists cv_photo_result text,
  add column if not exists cv_photo_src text;

alter table public.recruit_applicants drop constraint if exists recruit_cv_photo_result_ok;
alter table public.recruit_applicants add constraint recruit_cv_photo_result_ok
  check (cv_photo_result is null or cv_photo_result in ('ok', 'no_images', 'no_face', 'many_faces', 'unsupported', 'error'));

insert into public.internal_secrets (name, value)
select 'recruit_cv_photos_cron', encode(extensions.gen_random_bytes(24), 'hex')
where not exists (select 1 from public.internal_secrets where name = 'recruit_cv_photos_cron');

create or replace function public.recruit_cv_photo_queue(p_n int default 20)
returns table (id uuid, cv_link text, cv_file text)
language sql stable security definer set search_path = public as $$
  select a.id, a.cv_link, a.cv_file
  from public.recruit_applicants a
  where a.photo_path is null
    and (a.cv_file is not null or (a.cv_link ~* '^https://(www\.)?tararosesalon\.com/'))
    and (a.ig_handle is null or btrim(a.ig_handle) = '' or a.photo_checked_at is not null)
    and (a.cv_photo_checked_at is null
         or a.cv_photo_src is distinct from coalesce(a.cv_file, a.cv_link)
         or (a.cv_photo_result = 'error' and a.cv_photo_checked_at < now() - interval '1 day'))
  order by a.cv_photo_checked_at nulls first, a.applied_at desc
  limit greatest(1, least(coalesce(p_n, 20), 100))
$$;

create or replace function public.recruit_cv_photo_done(p_id uuid, p_result text, p_path text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare attached boolean := false; cur text; src text;
begin
  if p_result not in ('ok', 'no_images', 'no_face', 'many_faces', 'unsupported', 'error') then raise exception 'bad result'; end if;
  select photo_path, coalesce(cv_file, cv_link) into cur, src from public.recruit_applicants where id = p_id for update;
  if not found then return false; end if;
  if p_result = 'ok' and p_path is not null and cur is null then
    if p_path not like p_id::text || '/%' then raise exception 'bad photo path'; end if;
    update public.recruit_applicants
       set photo_path = p_path, photo_source = 'cv', cv_photo_checked_at = now(), cv_photo_result = 'ok', cv_photo_src = src, updated_at = now()
     where id = p_id;
    attached := true;
  else
    -- somebody added a photo meanwhile, or nothing usable in the CV: record the look, change nothing else
    update public.recruit_applicants
       set cv_photo_checked_at = now(), cv_photo_result = case when p_result = 'ok' then 'ok' else p_result end, cv_photo_src = src
     where id = p_id;
  end if;
  return attached;
end $$;

revoke all on function public.recruit_cv_photo_queue(int) from public, anon, authenticated;
revoke all on function public.recruit_cv_photo_done(uuid, text, text) from public, anon, authenticated;
grant execute on function public.recruit_cv_photo_queue(int) to service_role;
grant execute on function public.recruit_cv_photo_done(uuid, text, text) to service_role;
