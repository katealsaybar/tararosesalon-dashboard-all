-- Kate, 17 Nov 2026, part 2 of recruit_editor_name_17nov.sql ("1. fix, 2. hmm ok fix, 3. sige show and fix, 4. fix"):
--  1. queuing the automatic email to an applicant is logged (who, and when)
--  2. merging two people, undoing a merge and marking two cards "not the same person" are logged
--  3. a setting (booking link, invite reply, No email subject and wording, open roles) now keeps the name of whoever CHANGED it; saving the dialog with a value left as it was no longer
--     counts as a change (before, one Save re-stamped all of them), and recruit_get returns settings_meta so the page can show "last changed by X"
--  4. the first time someone opens a person (Look) is logged as "First looked at" in the history, without replacing the Last change
-- Undo: re-run recruit_editor_name_17nov.sql for recruit_get, then the earlier migrations for recruit_queue_email (recruit_shortlist_email.sql), recruit_settings_set (recruit_open_roles_text.sql),
-- recruit_mark_reviewed (recruitment_no_reply.sql), recruit_merge_people / recruit_unmerge / recruit_not_same_set (recruitment_dedupe.sql); drop the 4 argument recruit_log and re-create the 3 argument one.

drop function if exists public.recruit_log(uuid[], text, text);
create or replace function public.recruit_log(p_ids uuid[], p_by text, p_what text, p_touch boolean default true) returns void
language plpgsql security definer set search_path to 'public' as $f$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  insert into public.recruit_activity (applicant_id, by, what)
    select a.id, p_by, p_what from public.recruit_applicants a where a.id = any (p_ids);
  if p_touch then
    update public.recruit_applicants set edited_by = p_by, edited_at = now(), edited_what = p_what where id = any (p_ids);
  end if;
end $f$;
revoke all on function public.recruit_log(uuid[], text, text, boolean) from public, anon, authenticated;

-- 1. the automatic email
create or replace function public.recruit_queue_email(p_id uuid, p_role text, p_subject text, p_html text, p_text text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare
  who text := public.recruit_guard();
  a public.recruit_applicants; roles jsonb; to_addr text;
begin
  select * into a from public.recruit_applicants where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  if p_subject is null or btrim(p_subject) = '' or length(p_subject) > 200 then raise exception 'bad subject'; end if;
  if p_html is null or length(p_html) > 120000 or p_text is null or length(p_text) > 20000 then raise exception 'bad email size'; end if;

  if a.is_test then
    select lower(u.email) into to_addr from auth.users u where u.id = auth.uid();
    if to_addr is null then return jsonb_build_object('queued', 0, 'reason', 'no_own_address'); end if;
    insert into public.recruit_outbox (applicant_id, to_email, subject, html, text_body, is_test, created_by)
    values (a.id, to_addr, '[TEST] ' || p_subject, p_html, p_text, true, who);
    perform public.recruit_log(array[a.id], who, 'Queued a test email to themselves');
    return jsonb_build_object('queued', 1, 'test', true);
  end if;

  if coalesce((select value from public.recruit_settings where key = 'shortlist_email_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  roles := coalesce((select value from public.recruit_settings where key = 'notify_roles'), '["Front Desk / Reception", "Hair Assistant", "Other"]'::jsonb);
  if p_role is null or not (roles ? p_role) then return jsonb_build_object('queued', 0, 'reason', 'role'); end if;
  if a.email is null or btrim(a.email) = '' or a.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('queued', 0, 'reason', 'no_email'); end if;
  if a.bounced then return jsonb_build_object('queued', 0, 'reason', 'bounced'); end if;
  begin
    insert into public.recruit_outbox (applicant_id, to_email, subject, html, text_body, created_by)
    values (a.id, lower(btrim(a.email)), p_subject, p_html, p_text, who);
  exception when unique_violation then
    return jsonb_build_object('queued', 0, 'reason', 'already_emailed');
  end;
  perform public.recruit_log(array[a.id], who, 'Queued the automatic email to the applicant');
  return jsonb_build_object('queued', 1);
end $f$;

-- 2. merges
create or replace function public.recruit_merge_people(p_keep uuid, p_drop uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); lid uuid; dn text;
begin
  select coalesce(name, 'a card without a name') into dn from public.recruit_applicants where id = p_drop;
  update public.recruit_activity set applicant_id = p_keep where applicant_id = p_drop and exists (select 1 from public.recruit_applicants where id = p_keep);
  lid := public.recruit_do_merge(p_keep, p_drop, 'manual', who);
  perform public.recruit_log(array[p_keep], who, 'Merged in another card: ' || coalesce(dn, 'unknown'));
  return jsonb_build_object('log_id', lid, 'kept', p_keep);
end $f$;

do $m$
declare src text;
begin
  -- recruit_unmerge and recruit_not_same_set keep their bodies; a log line is added before their final return / end
  src := pg_get_functiondef('public.recruit_unmerge'::regproc);
  if src not like '%recruit_log%' then
    src := replace(src, E'  return jsonb_build_object(''log_id'', lg.id, ''kept'', lg.kept_id, ''back'', lg.dropped_id);',
      E'  perform public.recruit_log(array[lg.kept_id, lg.dropped_id], who, ''Undid the merge with '' || coalesce(lg.dropped_row->>''name'', ''another card''));\n  return jsonb_build_object(''log_id'', lg.id, ''kept'', lg.kept_id, ''back'', lg.dropped_id);');
    if src not like '%recruit_log%' then raise exception 'unmerge patch did not apply'; end if;
    execute src;
  end if;
  src := pg_get_functiondef('public.recruit_not_same_set'::regproc);
  if src not like '%recruit_log%' then
    src := replace(src, E'on conflict do nothing;', E'on conflict do nothing;\n  perform public.recruit_log(array[p_a, p_b], who, ''Marked two cards as not the same person'', false);');
    if src not like '%recruit_log%' then raise exception 'not_same patch did not apply'; end if;
    execute src;
  end if;
end $m$;

-- 3. settings keep the name of whoever really changed them
create or replace function public.recruit_settings_set(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); old jsonb; had boolean;
begin
  if p_key is null or p_key not in ('open_roles', 'open_roles_text', 'booking_link', 'invite_template', 'decline_template', 'decline_subject', 'decline_confirmed', 'templates_confirmed', 'wait_days') then
    raise exception 'unknown setting';
  end if;
  if p_value is null then raise exception 'a value is needed'; end if;
  select value into old from public.recruit_settings where key = p_key;
  had := found;
  if had and old is not distinct from p_value then return; end if;
  insert into public.recruit_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), who)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = who;
end $f$;

-- 4. first look
create or replace function public.recruit_mark_reviewed(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); n int; got uuid[];
begin
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('changed', 0); end if;
  if cardinality(p_ids) > 500 then raise exception 'too many at once'; end if;
  with u as (
    update public.recruit_applicants set reviewed_at = now(), reviewed_by = who, updated_at = now()
     where id = any (p_ids) and reviewed_at is null returning id)
  select coalesce(array_agg(id), '{}') into got from u;
  n := cardinality(got);
  perform public.recruit_log(got, who, 'First looked at', false);
  return jsonb_build_object('changed', n);
end $f$;

-- reading: settings_meta = who last changed each setting and when
create or replace function public.recruit_get() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
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
        'edited_by', a.edited_by, 'edited_at', a.edited_at, 'edited_what', a.edited_what)
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $f$;
