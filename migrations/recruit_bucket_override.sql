-- Recruitment: change Worth a look / Probably no by hand, both ways, in the row (Kate, 11 Nov 2026: "i should be able to change sa column sa row din mismo"). Run after recruit_look_override.sql. Additive.
--
-- recruit_look_override.sql let a person be moved TO Worth a look. This adds the other direction and one function for the row's Status dropdown:
--   recruit_applicants.no_override      boolean, false by default; true = shown in Probably no whatever the checks say
--   recruit_set_bucket(id, to)          to = 'look' (look_override on, no_override off), 'no' (the other way round) or 'auto' (both off, the checks decide). Kate / Coach Emma only.
--   recruit_get()                       now also returns 'no_ok'
-- Only matters while the person is new. recruit_set_look_override stays (the page now calls recruit_set_bucket).
--
-- Also (Kate, 11 Nov 2026, Oxana Kaza: "hindi sya dapat kasama, client po sya"): some people who write to info@ or recruitment@ are not applicants (a client asking for an
-- appointment, a supplier, a creator). Kate or Coach Emma can take them out of the list, and put them back:
--   recruit_applicants.not_applicant     boolean, false by default; true = out of every list and count, kept under "Not applicants" at the bottom of the page
--   recruit_set_not_applicant(id, flag)  Kate / Coach Emma only
--   recruit_get()                        also returns 'no_ok' and 'not_app'
-- Undo: drop the two functions and the two columns, put recruit_get back from recruit_look_override.sql.

alter table public.recruit_applicants add column if not exists no_override boolean not null default false;
alter table public.recruit_applicants add column if not exists not_applicant boolean not null default false;

create or replace function public.recruit_set_bucket(p_id uuid, p_to text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_id is null or p_to is null or p_to not in ('look', 'no', 'auto') then raise exception 'bad request'; end if;
  update public.recruit_applicants set look_override = (p_to = 'look'), no_override = (p_to = 'no'), updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.recruit_set_bucket(uuid, text) from public, anon;
grant execute on function public.recruit_set_bucket(uuid, text) to authenticated;

create or replace function public.recruit_set_not_applicant(p_id uuid, p_flag boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_id is null or p_flag is null then raise exception 'bad request'; end if;
  update public.recruit_applicants set not_applicant = p_flag, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.recruit_set_not_applicant(uuid, boolean) from public, anon;
grant execute on function public.recruit_set_not_applicant(uuid, boolean) to authenticated;

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
        'reviewed_at', a.reviewed_at, 'reviewed_by', a.reviewed_by, 'photo', a.photo_path, 'photo_bad', a.photo_unprofessional, 'look_ok', a.look_override, 'no_ok', a.no_override, 'not_app', a.not_applicant, 'mailboxes', to_jsonb(a.mailboxes))
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $$;
