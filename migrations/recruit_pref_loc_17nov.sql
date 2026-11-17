-- Kate, 17 Nov 2026 ("we should also add another column for preferred loc if abu dhabi or dubai", "checking cv's if ano preferences nila"; in the 11am meeting Frances raised that an
-- applicant's address can say Abu Dhabi while the role is in Dubai, or the other way round, and the form does not ask).
--  * recruit_applicants.pref_loc: Dubai, Abu Dhabi or Either (null = not stated); pref_src: where it came from (Application text, CV, By hand)
--  * recruit_set_pref(person, place): set or clear it by hand (logged in Who changed what)
--  * recruit_apply_pref(person, place, source): the reader of the CV files writes through this (never overwrites a value set by hand)
--  * first fill: only where the person's own application text says it ("looking for an opportunity in Dubai", "relocating to Abu Dhabi", both named = Either); where they live is NOT a preference
--  * ate Jho (Jhoana) also handles beautician applicants, so notify_roles gets Beautician
-- Undo: drop function recruit_set_pref, recruit_apply_pref; drop the two columns; re-run recruit_assign_17nov.sql for recruit_get; remove Beautician from recruit_settings notify_roles.

alter table public.recruit_applicants add column if not exists pref_loc text check (pref_loc is null or pref_loc in ('Dubai', 'Abu Dhabi', 'Either'));
alter table public.recruit_applicants add column if not exists pref_src text;

create or replace function public.recruit_set_pref(p_id uuid, p_loc text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); v text := nullif(btrim(coalesce(p_loc, '')), '');
begin
  if p_id is null then raise exception 'bad request'; end if;
  if v is not null and v not in ('Dubai', 'Abu Dhabi', 'Either') then raise exception 'unknown place'; end if;
  update public.recruit_applicants set pref_loc = v, pref_src = case when v is null then null else 'By hand' end, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  perform public.recruit_log(array[p_id], who, case when v is null then 'Preferred location: cleared' else 'Preferred location: ' || v end);
  return jsonb_build_object('ok', true);
end $f$;
grant execute on function public.recruit_set_pref(uuid, text) to authenticated;

-- for the CV reader (service role only): fills a blank, never replaces what a person set by hand
create or replace function public.recruit_apply_pref(p_id uuid, p_loc text, p_src text) returns boolean
language plpgsql security definer set search_path to 'public' as $f$
declare n int;
begin
  if p_loc is null or p_loc not in ('Dubai', 'Abu Dhabi', 'Either') then return false; end if;
  update public.recruit_applicants set pref_loc = p_loc, pref_src = left(coalesce(p_src, 'CV'), 40)
   where id = p_id and pref_src is distinct from 'By hand';
  get diagnostics n = row_count;
  if n > 0 then insert into public.recruit_activity (applicant_id, by, what) values (p_id, 'Automatic', 'Preferred location read: ' || p_loc || ' (' || coalesce(p_src, 'CV') || ')'); end if;
  return n > 0;
end $f$;
revoke all on function public.recruit_apply_pref(uuid, text, text) from public, anon, authenticated;

-- first fill from what the person wrote
with t as (
  select id, lower(coalesce(about, '')) a from public.recruit_applicants where pref_loc is null),
s as (
  select id,
    (a ~ '(prefer|looking for|looking to|seeking|interested in|willing to|open to|opportunit|job in|position in|work in|work at|relocat|branch)[^.\n]{0,70}(abu ?dhabi|abudhabi)') pref_ad,
    (a ~ '(prefer|looking for|looking to|seeking|interested in|willing to|open to|opportunit|job in|position in|work in|work at|relocat|branch)[^.\n]{0,70}dubai') pref_dx,
    (a ~ '(abu ?dhabi|abudhabi)[^.\n]{0,15}(or|and|/|&|,)[^.\n]{0,15}dubai|dubai[^.\n]{0,15}(or|and|/|&|,)[^.\n]{0,15}(abu ?dhabi|abudhabi)') both_named
  from t),
r as (
  select id, case when both_named and (pref_ad or pref_dx) then 'Either' when pref_ad and not pref_dx then 'Abu Dhabi' when pref_dx and not pref_ad then 'Dubai' end loc from s)
update public.recruit_applicants a set pref_loc = r.loc, pref_src = 'Application text' from r where a.id = r.id and r.loc is not null;

update public.recruit_settings set value = value || '"Beautician"'::jsonb, updated_at = now(), updated_by = 'Kate Alsaybar'
 where key = 'notify_roles' and not (value ? 'Beautician');

create or replace function public.recruit_get() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); em text := lower(public.kb_me_email());
begin
  return jsonb_build_object(
    'me', who,
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from public.recruit_settings s), '{}'::jsonb),
    'settings_meta', coalesce((select jsonb_object_agg(s.key, jsonb_build_object('by', s.updated_by, 'at', s.updated_at)) from public.recruit_settings s where s.updated_by is not null), '{}'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'email', a.email, 'whatsapp', a.whatsapp,
        'country', a.country, 'emirate', a.emirate, 'experience', a.experience, 'specialist', a.specialist, 'paths', a.paths,
        'role_key', a.role_key, 'role_txt', a.role_txt, 'role_set', a.role_override, 'work_link', a.work_link, 'link_kind', a.link_kind, 'ig_handle', a.ig_handle,
        'cv_link', a.cv_link, 'cv_file', a.cv_file, 'cv_file_name', a.cv_file_name, 'about', left(a.about, 800), 'source', a.source,
        'applied_at', a.applied_at, 'last_applied_at', a.last_applied_at, 'replied_at', a.replied_at,
        'candidate_replied_at', a.candidate_replied_at, 'bounced', a.bounced,
        'start_date', a.start_date, 'stage_note', a.stage_note, 'is_test', a.is_test, 'stage', a.stage, 'decided_by', a.decided_by, 'decided_at', a.decided_at, 'merged', cardinality(a.msg_ids),
        'reviewed_at', a.reviewed_at, 'reviewed_by', a.reviewed_by, 'photo', a.photo_path, 'photo_bad', a.photo_unprofessional, 'look_ok', a.look_override, 'no_ok', a.no_override, 'not_app', a.not_applicant, 'mailboxes', to_jsonb(a.mailboxes),
        'edited_by', a.edited_by, 'edited_at', a.edited_at, 'edited_what', a.edited_what,
        'assigned_to', a.assigned_to, 'assigned_at', a.assigned_at, 'assigned_mine', (a.assigned_email is not null and a.assigned_email = em),
        'pref_loc', a.pref_loc, 'pref_src', a.pref_src)
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $f$;
