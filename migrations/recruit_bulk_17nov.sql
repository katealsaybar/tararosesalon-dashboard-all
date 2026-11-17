-- Kate, 17 Nov 2026 ("add bulk actions pls kasi may mga i aassign na ko kay ate frans and ate jho").
--  * recruit_assign_many(ids, to_email, take): assign many people at once. Kate (Level 5) can give people to ate Jho, ate Frances or herself, and takes over people who are already held.
--    Everyone else can only take unassigned people for themselves. take = false lets go (only your own people, Level 5 anyone).
--    One notice per person who can open Recruitment (never one per applicant): the new holder gets a popup ("Kate gave you 12 applicants"), the others a quiet bell line, and the page and
--    the bell refresh live through site_notice_ping. Every person's history gets the line.
--  * recruit_set_pref_many(ids, place): Preferred location for many at once.
--  * recruit_get also returns team (who can open Recruitment) and my_level, so the page can offer the right people.
-- Undo: drop function recruit_assign_many, recruit_set_pref_many; re-run recruit_pref_loc_17nov.sql for recruit_get.

create or replace function public.recruit_assign_many(p_ids uuid[], p_to text default null, p_take boolean default true) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare
  who text := public.recruit_guard(); em text := lower(public.kb_me_email()); lv int;
  tname text; temail text; got uuid[]; n int := 0; skipped int := 0; r record; popup boolean; body text; title text; ts text;
begin
  select m.level into lv from public.dashboard_me() m limit 1;
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('ok', true, 'changed', 0, 'skipped', 0); end if;
  if cardinality(p_ids) > 500 then raise exception 'too many at once'; end if;

  if not coalesce(p_take, true) then
    with u as (
      update public.recruit_applicants set assigned_to = null, assigned_email = null, assigned_at = null
       where id = any (p_ids) and assigned_to is not null and (assigned_email = em or coalesce(lv, 0) >= 5) returning id)
    select coalesce(array_agg(id), '{}') into got from u;
    n := cardinality(got);
    perform public.recruit_log(got, who, 'Let go of the assignment', false);
    perform public._notice_ping();
    return jsonb_build_object('ok', true, 'changed', n, 'skipped', cardinality(p_ids) - n);
  end if;

  if p_to is null or lower(p_to) = em then
    tname := who; temail := em;
  else
    if coalesce(lv, 0) < 5 then raise exception 'only Kate can give people to someone else'; end if;
    select u.name, lower(u.email) into tname, temail from public.dashboard_users u
     where lower(u.email) = lower(p_to) and (u.level >= 5 or 'recruitment' = any (coalesce(u.extra_pages, '{}'::text[])));
    if tname is null then raise exception 'that person cannot open Recruitment'; end if;
  end if;

  with u as (
    update public.recruit_applicants set assigned_to = tname, assigned_email = temail, assigned_at = now()
     where id = any (p_ids)
       and assigned_email is distinct from temail
       and (assigned_to is null or coalesce(lv, 0) >= 5)
    returning id)
  select coalesce(array_agg(id), '{}') into got from u;
  n := cardinality(got);
  skipped := cardinality(p_ids) - n - (select count(*) from public.recruit_applicants where id = any (p_ids) and assigned_email = temail and not (id = any (got)));
  perform public.recruit_log(got, who, case when temail = em then 'Assigned to ' || tname else 'Assigned to ' || tname || ' by ' || who end, false);

  if n > 0 then
    ts := floor(extract(epoch from clock_timestamp()))::text;
    for r in select lower(u.email) as email, u.name from public.dashboard_users u
              where lower(u.email) <> em and (u.level >= 5 or 'recruitment' = any (coalesce(u.extra_pages, '{}'::text[]))) loop
      if temail = em then
        popup := true;
        title := left(who || ' took ' || n || ' applicant' || case when n = 1 then '' else 's' end, 110);
        body := 'Leave ' || case when n = 1 then 'this person' else 'these ' || n || ' people' end || ' with ' || who || ' so you are not both looking at the same applicants.';
      elsif r.email = temail then
        popup := true;
        title := left(who || ' gave you ' || n || ' applicant' || case when n = 1 then '' else 's' end, 110);
        body := 'Open Recruitment and filter Assigned to ' || split_part(tname, ' ', 1) || ' to see them.';
      else
        popup := false;
        title := left(who || ' assigned ' || n || ' applicant' || case when n = 1 then '' else 's' end || ' to ' || split_part(tname, ' ', 1), 110);
        body := split_part(tname, ' ', 1) || ' has them now.';
      end if;
      perform public._notice_push('recruit_claim', 'bulk:' || ts || ':' || n || ':' || r.email || ':' || temail, r.email, title, body, 'chat', '/?view=recruitment', 'Open', popup);
    end loop;
    perform public._notice_ping();
  end if;
  return jsonb_build_object('ok', true, 'changed', n, 'skipped', greatest(skipped, 0), 'to', tname);
end $f$;
grant execute on function public.recruit_assign_many(uuid[], text, boolean) to authenticated;

create or replace function public.recruit_set_pref_many(p_ids uuid[], p_loc text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); v text := nullif(btrim(coalesce(p_loc, '')), ''); got uuid[];
begin
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('ok', true, 'changed', 0); end if;
  if cardinality(p_ids) > 500 then raise exception 'too many at once'; end if;
  if v is not null and v not in ('Dubai', 'Abu Dhabi', 'Either') then raise exception 'unknown place'; end if;
  with u as (
    update public.recruit_applicants set pref_loc = v, pref_src = case when v is null then null else 'By hand' end, updated_at = now()
     where id = any (p_ids) returning id)
  select coalesce(array_agg(id), '{}') into got from u;
  perform public.recruit_log(got, who, case when v is null then 'Preferred location: cleared' else 'Preferred location: ' || v end);
  return jsonb_build_object('ok', true, 'changed', cardinality(got));
end $f$;
grant execute on function public.recruit_set_pref_many(uuid[], text) to authenticated;

create or replace function public.recruit_get() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); em text := lower(public.kb_me_email());
begin
  return jsonb_build_object(
    'me', who,
    'my_level', (select m.level from public.dashboard_me() m limit 1),
    'team', coalesce((select jsonb_agg(jsonb_build_object('name', u.name, 'email', lower(u.email)) order by u.name) from public.dashboard_users u
                       where u.level >= 5 or 'recruitment' = any (coalesce(u.extra_pages, '{}'::text[]))), '[]'::jsonb),
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
