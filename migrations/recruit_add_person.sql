-- Recruitment: add a person by hand (Kate, 16 Nov 2026). Run after recruit_cv_files.sql. Additive.
--
-- "pano yung mga wala sa email na applicant" / "nag punta lang sa salon to apply" / "pwede ko naman gawan ng profile tapos uplaod ko here sa database" / "allow me to add people too manually".
-- A walk-in has no email in the inboxes, so Kate or Coach Emma types the profile on the page (and can attach the CV and a photo).
--   source 'manual'                 allowed now (it was form or email only); the page shows Came from "Added by hand"
--   recruit_add_person(...)         creates the person (name is required; WhatsApp and email are optional) and returns {id, name} or {duplicate, id, name} when the same
--                                   person key (email, else last 9 digits of the WhatsApp, else the name) is already there; nothing is overwritten in that case.
--                                   The person counts as already looked at (reviewed_at / reviewed_by), because whoever typed the profile has read it, and is Worth a look by hand
--                                   (look_override), so the hiring list never moves someone Kate added herself to Probably no.
--   recruit_set_cv(id, path, name)  attaches a CV the browser uploaded to the private bucket recruit-cvs (the same way recruit_set_photo works for photos)
--   policies recruit_cvs_add / recruit_cvs_remove   Kate / Coach Emma (recruit_can()) may add or remove files in recruit-cvs from the page
-- Undo: drop the two functions and the two policies, put the source check back to form and email, delete the rows with source = 'manual'.

alter table public.recruit_applicants drop constraint if exists recruit_applicants_source_check;
alter table public.recruit_applicants add constraint recruit_applicants_source_check check (source in ('form', 'email', 'manual'));

drop policy if exists recruit_cvs_add on storage.objects;
drop policy if exists recruit_cvs_remove on storage.objects;
create policy recruit_cvs_add on storage.objects for insert to authenticated with check (bucket_id = 'recruit-cvs' and public.recruit_can());
create policy recruit_cvs_remove on storage.objects for delete to authenticated using (bucket_id = 'recruit-cvs' and public.recruit_can());

create or replace function public.recruit_add_person(
  p_name text, p_whatsapp text, p_email text, p_role text, p_emirate text, p_country text, p_experience text, p_about text, p_work_link text
) returns jsonb
language plpgsql security definer set search_path = public as $$
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
  return jsonb_build_object('id', v_id, 'name', v_name, 'by', who);
end $$;

create or replace function public.recruit_set_cv(p_id uuid, p_path text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard(); old text;
begin
  if p_id is null or p_path is null or p_path not like p_id::text || '/%' then raise exception 'bad file path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'recruit-cvs' and o.name = p_path) then raise exception 'the file did not upload'; end if;
  select cv_file into old from public.recruit_applicants where id = p_id for update;
  if not found then raise exception 'that person is no longer there'; end if;
  update public.recruit_applicants set cv_file = p_path, cv_file_name = left(coalesce(nullif(btrim(p_name), ''), 'CV'), 200), updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'old', old);
end $$;

revoke all on function public.recruit_add_person(text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.recruit_set_cv(uuid, text, text) from public, anon;
grant execute on function public.recruit_add_person(text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.recruit_set_cv(uuid, text, text) to authenticated;
