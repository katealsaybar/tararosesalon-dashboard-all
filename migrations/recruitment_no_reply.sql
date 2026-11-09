-- Recruitment: the approved "No" reply, and who has actually looked at an applicant (Kate, 9 Nov 2026).
-- The reply says "I have reviewed your application", so the page only lets a No (single or bulk) go out for people Coach Emma or Kate has opened or acted on.
-- reviewed_at / reviewed_by record that: set when someone opens a person's details, shortlists, says No, puts back or books them (recruit_set_stage does it
-- too), by recruit_mark_reviewed(). People already decided before this file are marked reviewed at their decision time.
-- Also: the reply wording lives in recruit_settings (decline_template, decline_subject, decline_confirmed) and can be edited on the page; the wording below is
-- the brand reviewed copy from docs/RECRUITMENT-NO-REPLY-EMAIL.md (SHIP 9 Nov 2026), unchanged. decline_confirmed stays false until Emma-Louise has confirmed
-- her signature (name and title) on the page.
-- Undo: drop function public.recruit_mark_reviewed(uuid[]); alter table public.recruit_applicants drop column reviewed_at, drop column reviewed_by;
-- then put recruit_get / recruit_set_stage / recruit_settings_set back from migrations/recruitment.sql.

alter table public.recruit_applicants add column if not exists reviewed_at timestamptz, add column if not exists reviewed_by text;
update public.recruit_applicants set reviewed_at = coalesce(decided_at, now()), reviewed_by = coalesce(decided_by, 'earlier decision')
 where stage <> 'new' and reviewed_at is null;

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
        'reviewed_at', a.reviewed_at, 'reviewed_by', a.reviewed_by)
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $$;

create or replace function public.recruit_set_stage(p_ids uuid[], p_stage text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard(); n int;
begin
  if p_stage is null or p_stage not in ('new', 'screening', 'interview_booked', 'trade_test', 'offer', 'hired', 'not_now', 'rejected') then
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
  return jsonb_build_object('changed', n);
end $$;

-- Someone opened a person's details. Never clears it, never touches the stage.
create or replace function public.recruit_mark_reviewed(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard(); n int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('changed', 0); end if;
  if cardinality(p_ids) > 500 then raise exception 'too many at once'; end if;
  update public.recruit_applicants set reviewed_at = now(), reviewed_by = who, updated_at = now()
   where id = any (p_ids) and reviewed_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('changed', n);
end $$;

create or replace function public.recruit_settings_set(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_key is null or p_key not in ('open_roles', 'booking_link', 'invite_template', 'decline_template', 'decline_subject', 'decline_confirmed', 'templates_confirmed', 'wait_days') then
    raise exception 'unknown setting';
  end if;
  if p_value is null then raise exception 'a value is needed'; end if;
  insert into public.recruit_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), who)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = who;
end $$;

revoke all on function public.recruit_mark_reviewed(uuid[]) from public, anon;
grant execute on function public.recruit_mark_reviewed(uuid[]) to authenticated;

-- The approved wording, markers: **bold**, [link text]({careers_url}), {greeting} (the whole first line). Signature is the last block and is editable.
insert into public.recruit_settings (key, value) values
  ('decline_subject', to_jsonb('Your application to Tara Rose Salons'::text)),
  ('decline_confirmed', 'false'::jsonb),
  ('decline_template', to_jsonb($tpl${greeting}

Thank you for applying to Tara Rose Salons. I have reviewed your application, and I would rather give you a clear answer than leave you waiting.

**We will not be taking your application forward at this time.**

We know this is not the answer you were hoping for, and we know how much effort goes into an application. We are grateful you chose us.

If you would like to talk to us again in future, you are welcome to do so through the [careers page on our website]({careers_url}).

Thank you again, and I wish you every success with what comes next.

Warm regards,
Emma-Louise Usher
General Manager, Tara Rose Salons$tpl$::text))
on conflict (key) do update set value = excluded.value, updated_at = now();
