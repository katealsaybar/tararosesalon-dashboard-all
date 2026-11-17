-- Kate, 17 Nov 2026 ("since may access na si ate frans and ate jho sa recruitment page, dapat pag may binago sila nakareflect ang name nila").
-- Until now only a change of STATUS kept the name of the person who made it (decided_by). Changing Applying for, the name, Worth a look / Probably no, Not an applicant,
-- the photo, the photo mark, the CV, the Test mark and adding a person kept nobody's name. Now every one of those writes the signed-in person's name (the dashboard_users
-- name, the same one decided_by uses, so Jho Cairel shows as Jho and Frances as Frances) into:
--   recruit_applicants.edited_by / edited_at / edited_what  = the LAST change on that person (shown in the list and the Look panel)
--   recruit_activity                                         = every change, one row each (shown as "Who changed what" in the Look panel)
-- Nothing is ever updated or deleted in recruit_activity by the page. RLS on, no policies, read only through recruit_history() and recruit_get().
-- Undo: drop function recruit_history, recruit_log, recruit_stage_label; drop table recruit_activity; drop the three edited_ columns; re-run the earlier migrations of the
-- functions below (recruit_role_manager_mua_16nov, recruit_name_edit, recruit_bucket_override, recruit_photos, recruit_photo_flag, recruit_add_person, recruit_test_row,
-- recruit_hire, recruit_pipeline_16nov, recruitment_no_reply, recruit_cv_files / the latest recruit_get).

alter table public.recruit_applicants add column if not exists edited_by text;
alter table public.recruit_applicants add column if not exists edited_at timestamptz;
alter table public.recruit_applicants add column if not exists edited_what text;

create table if not exists public.recruit_activity (
  id           bigserial primary key,
  applicant_id uuid not null references public.recruit_applicants(id) on delete cascade,
  at           timestamptz not null default now(),
  by           text not null,
  what         text not null
);
create index if not exists recruit_activity_applicant_idx on public.recruit_activity (applicant_id, at desc);
alter table public.recruit_activity enable row level security;   -- no policies on purpose

create or replace function public.recruit_stage_label(p text) returns text language sql immutable as $f$
  select case p
    when 'new' then 'New' when 'screening' then 'Shortlisted' when 'interview_booked' then 'Interview booked'
    when 'interview_pass' then 'Interview done (pass)' when 'interview_fail' then 'Interview done (fail)'
    when 'trade_test' then 'Trade test scheduled' when 'trade_fail' then 'Trade test done (fail)' when 'trade_pass' then 'Trade test done (pass)'
    when 'offer' then 'For offer letter (to send)' when 'offer_to_send' then 'For offer letter (to send)' when 'offer_sent' then 'For offer letter (sent)'
    when 'start_pending' then 'Finalise start date (pending)' when 'start_accepted' then 'Finalise start date (accepted)'
    when 'hired' then 'Hired' when 'not_now' then 'Not now' when 'rejected' then 'Rejected'
    else p end
$f$;

-- one place that records a change: the log row and the "last change" on the person
create or replace function public.recruit_log(p_ids uuid[], p_by text, p_what text) returns void
language plpgsql security definer set search_path to 'public' as $f$
begin
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  insert into public.recruit_activity (applicant_id, by, what)
    select a.id, p_by, p_what from public.recruit_applicants a where a.id = any (p_ids);
  update public.recruit_applicants set edited_by = p_by, edited_at = now(), edited_what = p_what where id = any (p_ids);
end $f$;
revoke all on function public.recruit_log(uuid[], text, text) from public, anon, authenticated;

-- people who were moved before today: their last change is the move that decided_by already holds
insert into public.recruit_activity (applicant_id, at, by, what)
  select a.id, a.decided_at, a.decided_by, 'Status: ' || public.recruit_stage_label(a.stage)
    from public.recruit_applicants a
   where a.decided_by is not null and a.decided_at is not null and a.stage <> 'new' and a.edited_at is null
     and not exists (select 1 from public.recruit_activity x where x.applicant_id = a.id);
update public.recruit_applicants
   set edited_by = decided_by, edited_at = decided_at, edited_what = 'Status: ' || public.recruit_stage_label(stage)
 where decided_by is not null and decided_at is not null and stage <> 'new' and edited_at is null;

-- ---------- the setters, each now logs ----------
create or replace function public.recruit_set_role(p_id uuid, p_to text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); v text;
begin
  if p_id is null then raise exception 'bad request'; end if;
  v := case when p_to is null or p_to in ('', 'auto') then null else p_to end;
  if v is not null and v not in ('Hairdresser / Hair Stylist', 'Hair Assistant', 'Beautician', 'Make Up Artist', 'Front Desk / Reception', 'Manager', 'Admin', 'Other') then raise exception 'unknown role'; end if;
  update public.recruit_applicants set role_override = v, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  perform public.recruit_log(array[p_id], who, case when v is null then 'Applying for: back to automatic' else 'Applying for: ' || v end);
  return jsonb_build_object('ok', true);
end $f$;

create or replace function public.recruit_set_name(p_id uuid, p_name text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); v text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if p_id is null then raise exception 'bad request'; end if;
  if v is not null and char_length(v) > 120 then raise exception 'name too long'; end if;
  perform set_config('recruit.name_edit', '1', true);
  update public.recruit_applicants set name = v, name_locked = (v is not null), updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  perform public.recruit_log(array[p_id], who, case when v is null then 'Name: cleared, the imported name returns' else 'Edited the name' end);
  return jsonb_build_object('ok', true, 'name', v);
end $f$;

create or replace function public.recruit_set_bucket(p_id uuid, p_to text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
begin
  if p_id is null or p_to is null or p_to not in ('look', 'no', 'auto') then raise exception 'bad request'; end if;
  update public.recruit_applicants set look_override = (p_to = 'look'), no_override = (p_to = 'no'), updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  perform public.recruit_log(array[p_id], who, case p_to when 'look' then 'Moved to Worth a look' when 'no' then 'Moved to Probably no' else 'Back to the automatic checks' end);
  return jsonb_build_object('ok', true);
end $f$;

create or replace function public.recruit_set_not_applicant(p_id uuid, p_flag boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
begin
  if p_id is null or p_flag is null then raise exception 'bad request'; end if;
  update public.recruit_applicants set not_applicant = p_flag, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  perform public.recruit_log(array[p_id], who, case when p_flag then 'Marked as not an applicant' else 'Put back as an applicant' end);
  return jsonb_build_object('ok', true);
end $f$;

create or replace function public.recruit_set_photo(p_id uuid, p_path text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); old text;
begin
  if p_id is null or p_path is null or p_path not like p_id::text || '/%' then raise exception 'bad photo path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'recruit-photos' and o.name = p_path) then raise exception 'the photo did not upload'; end if;
  select photo_path into old from public.recruit_applicants where id = p_id for update;
  if not found then raise exception 'that person is no longer there'; end if;
  update public.recruit_applicants set photo_path = p_path, updated_at = now() where id = p_id;
  perform public.recruit_log(array[p_id], who, case when old is null then 'Added a photo' else 'Changed the photo' end);
  return jsonb_build_object('ok', true, 'old', old);
end $f$;

create or replace function public.recruit_clear_photo(p_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); old text;
begin
  select photo_path into old from public.recruit_applicants where id = p_id for update;
  if not found then raise exception 'that person is no longer there'; end if;
  update public.recruit_applicants set photo_path = null, updated_at = now() where id = p_id;
  perform public.recruit_log(array[p_id], who, 'Removed the photo');
  return jsonb_build_object('ok', true, 'old', old);
end $f$;

create or replace function public.recruit_set_photo_flag(p_id uuid, p_flag boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
begin
  if p_id is null or p_flag is null then raise exception 'bad request'; end if;
  update public.recruit_applicants set photo_unprofessional = p_flag, updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  perform public.recruit_log(array[p_id], who, case when p_flag then 'Marked the photo not professional' else 'Took off the not professional mark' end);
  return jsonb_build_object('ok', true);
end $f$;

create or replace function public.recruit_set_cv(p_id uuid, p_path text, p_name text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); old text;
begin
  if p_id is null or p_path is null or p_path not like p_id::text || '/%' then raise exception 'bad file path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'recruit-cvs' and o.name = p_path) then raise exception 'the file did not upload'; end if;
  select cv_file into old from public.recruit_applicants where id = p_id for update;
  if not found then raise exception 'that person is no longer there'; end if;
  update public.recruit_applicants set cv_file = p_path, cv_file_name = left(coalesce(nullif(btrim(p_name), ''), 'CV'), 200), updated_at = now() where id = p_id;
  perform public.recruit_log(array[p_id], who, case when old is null then 'Attached a CV' else 'Changed the CV' end);
  return jsonb_build_object('ok', true, 'old', old);
end $f$;

create or replace function public.recruit_set_test(p_id uuid, p_flag boolean) returns void
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
begin
  update public.recruit_applicants set is_test = coalesce(p_flag, false), updated_at = now() where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  perform public.recruit_log(array[p_id], who, case when coalesce(p_flag, false) then 'Marked as a Test row' else 'Took off the Test mark' end);
end $f$;

create or replace function public.recruit_set_stage(p_ids uuid[], p_stage text) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); n int;
begin
  if p_stage is null or p_stage not in ('new', 'screening', 'interview_booked', 'interview_pass', 'interview_fail', 'trade_test', 'trade_pass', 'trade_fail', 'offer', 'offer_to_send', 'offer_sent', 'start_pending', 'start_accepted', 'hired', 'not_now', 'rejected') then
    raise exception 'unknown stage';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('changed', 0); end if;
  if cardinality(p_ids) > 500 then raise exception 'too many at once'; end if;
  update public.recruit_applicants
     set stage = p_stage,
         decided_by = case when p_stage = 'new' then null else who end,
         decided_at = case when p_stage = 'new' then null else now() end,
         reviewed_at = coalesce(reviewed_at, now()),
         reviewed_by = coalesce(reviewed_by, who),
         updated_at = now()
   where id = any (p_ids);
  get diagnostics n = row_count;
  perform public.recruit_log(p_ids, who, case when p_stage = 'new' then 'Status: back to New' else 'Status: ' || public.recruit_stage_label(p_stage) end);
  return jsonb_build_object('changed', n);
end $f$;

create or replace function public.recruit_move(p_id uuid, p_stage text, p_note text, p_start date) returns void
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
begin
  if p_stage not in ('trade_test', 'start_pending') then raise exception 'unknown step'; end if;
  if p_stage = 'trade_test' and nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'put in when and where'; end if;
  if p_stage = 'start_pending' then
    if p_start is null then raise exception 'a start date is needed'; end if;
    if p_start < current_date - 30 or p_start > current_date + 366 then raise exception 'that start date looks wrong'; end if;
  end if;
  update public.recruit_applicants
     set stage = p_stage,
         stage_note = case when p_stage = 'trade_test' then left(btrim(p_note), 160) else stage_note end,
         start_date = case when p_stage = 'start_pending' then p_start else start_date end,
         decided_by = who, decided_at = now(),
         reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, who), updated_at = now()
   where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  perform public.recruit_log(array[p_id], who, 'Status: ' || public.recruit_stage_label(p_stage));
end $f$;

create or replace function public.recruit_set_hired(p_id uuid, p_start date) returns void
language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
begin
  if p_start is null then raise exception 'a starting date is needed'; end if;
  if p_start < current_date - 366 or p_start > current_date + 366 then raise exception 'that starting date looks wrong'; end if;
  update public.recruit_applicants
     set stage = 'hired', start_date = p_start, decided_by = who, decided_at = now(),
         reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, who), updated_at = now()
   where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  perform public.recruit_log(array[p_id], who, 'Status: Hired');
end $f$;

-- adding a person by hand: same body as recruit_add_person_17nov (recruit_add_person.sql) plus the log line
create or replace function public.recruit_add_person(
  p_name text, p_whatsapp text, p_email text, p_role text, p_emirate text, p_country text, p_experience text, p_about text, p_work_link text)
returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare
  who text := public.recruit_guard();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_wa text := nullif(btrim(coalesce(p_whatsapp, '')), '');
  v_role text := case when p_role is null or btrim(p_role) in ('', 'auto') then null else btrim(p_role) end;
  v_link text := nullif(btrim(coalesce(p_work_link, '')), '');
  v_key text; v_id uuid; v_old record;
begin
  if v_name is null then raise exception 'a name is needed'; end if;
  if char_length(v_name) > 120 then raise exception 'name too long'; end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200) then raise exception 'that email address does not look right'; end if;
  if v_wa is not null and char_length(v_wa) > 40 then raise exception 'that number is too long'; end if;
  if v_role is not null and v_role not in ('Hairdresser / Hair Stylist', 'Hair Assistant', 'Beautician', 'Front Desk / Reception', 'Admin', 'Other') then raise exception 'unknown role'; end if;
  if char_length(coalesce(p_about, '')) > 2000 or char_length(coalesce(v_link, '')) > 500 then raise exception 'too long'; end if;
  v_key := public.recruit_person_key(v_email, v_wa, v_name);
  if v_key is null then raise exception 'a name is needed'; end if;
  select id, name into v_old from public.recruit_applicants where person_key = v_key;
  if found then return jsonb_build_object('duplicate', true, 'id', v_old.id, 'name', v_old.name); end if;
  insert into public.recruit_applicants (
    person_key, name, name_locked, email, whatsapp, country, emirate, experience, role_txt, role_override, work_link, link_kind, about,
    source, mailboxes, msg_ids, applied_at, last_applied_at, reviewed_at, reviewed_by, look_override)
  values (
    v_key, v_name, true, v_email, v_wa, nullif(btrim(coalesce(p_country, '')), ''), nullif(btrim(coalesce(p_emirate, '')), ''), nullif(btrim(coalesce(p_experience, '')), ''),
    v_role, v_role, v_link,
    case when v_link is null then null when v_link ilike '%instagram.com%' then 'instagram' when v_link ilike '%tiktok.com%' then 'tiktok' when v_link ilike '%facebook.com%' or v_link ilike '%fb.com%' then 'facebook' else 'other' end,
    nullif(btrim(coalesce(p_about, '')), ''),
    'manual', '{}', '{}', now(), now(), now(), who, true)
  returning id into v_id;
  perform public.recruit_log(array[v_id], who, 'Added by hand');
  return jsonb_build_object('id', v_id, 'name', v_name, 'by', who);
end $f$;

-- ---------- reading ----------
create or replace function public.recruit_get() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
begin
  return jsonb_build_object(
    'me', who,
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from public.recruit_settings s), '{}'::jsonb),
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

-- the last 60 changes on one person, newest first (the "Who changed what" list in the Look panel)
create or replace function public.recruit_history(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('by', x.by, 'at', x.at, 'what', x.what) order by x.at desc, x.id desc)
                     from (select * from public.recruit_activity where applicant_id = p_id order by at desc, id desc limit 60) x), '[]'::jsonb);
end $f$;
grant execute on function public.recruit_history(uuid) to authenticated;
