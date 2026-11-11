-- Recruitment: a person can be moved to Worth a look by hand (Kate, 11 Nov 2026: "how do i put her as worth a look", Desislava Mincheva). Run after recruit_cv_files.sql. Additive.
--
-- Worth a look / Probably no is worked out from the standard (photo, CV, Instagram or Facebook, in the UAE, open role). A person who fails it on paper can still be worth a look
-- (a London freelancer relocating, with a portfolio website instead of Instagram), so Kate or Coach Emma can overrule it on that one person:
--   recruit_applicants.look_override   boolean, false by default; true = shown in Worth a look whatever the checks say (the checks stay visible on the card)
--   recruit_set_look_override(id, flag) Kate / Coach Emma only (recruit_guard)
--   recruit_get()                       now also returns 'look_ok' per person
-- It only matters while the person is new: a Shortlist, No or any later stage works as before.
-- Undo: drop the function and the column, put recruit_get back from recruit_cv_files.sql.

alter table public.recruit_applicants add column if not exists look_override boolean not null default false;

create or replace function public.recruit_set_look_override(p_id uuid, p_flag boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_id is null or p_flag is null then raise exception 'bad request'; end if;
  update public.recruit_applicants set look_override = p_flag, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.recruit_set_look_override(uuid, boolean) from public, anon;
grant execute on function public.recruit_set_look_override(uuid, boolean) to authenticated;

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
        'reviewed_at', a.reviewed_at, 'reviewed_by', a.reviewed_by, 'photo', a.photo_path, 'photo_bad', a.photo_unprofessional, 'look_ok', a.look_override, 'mailboxes', to_jsonb(a.mailboxes))
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $$;
