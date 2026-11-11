-- Recruitment: a "photo not professional" mark on a person (Kate, 11 Nov 2026). Run after recruit_photos.sql. Additive.
--
-- Kate's standard for Probably no: no profile photo, a photo that looks personal rather than professional, no CV (plus the two old reasons, not in the UAE and role not on
-- the open list). The first and third are read from the data; the second cannot be judged by a program, so Kate or Coach Emma click it on the person.
--   recruit_applicants.photo_unprofessional   boolean, false by default
--   recruit_set_photo_flag(id, flag)          Kate / Emma only (recruit_guard), returns ok
--   recruit_get()                             now also returns 'photo_bad' and the first five 'msg_ids' per person (the page links a direct email's attached CV to that email in Gmail)
-- Undo: drop the function and the column, put recruit_get back from recruit_photos.sql.

alter table public.recruit_applicants add column if not exists photo_unprofessional boolean not null default false;

create or replace function public.recruit_set_photo_flag(p_id uuid, p_flag boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_id is null or p_flag is null then raise exception 'bad request'; end if;
  update public.recruit_applicants set photo_unprofessional = p_flag, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.recruit_set_photo_flag(uuid, boolean) from public, anon;
grant execute on function public.recruit_set_photo_flag(uuid, boolean) to authenticated;

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
        'reviewed_at', a.reviewed_at, 'reviewed_by', a.reviewed_by, 'photo', a.photo_path, 'photo_bad', a.photo_unprofessional, 'msg_ids', to_jsonb(a.msg_ids[1:5]), 'mailboxes', to_jsonb(a.mailboxes))
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $$;
