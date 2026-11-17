-- Kate, 17 Nov 2026 ("add assign to self button pala, kasi baka mag unahan ate jho at ate frances sa pag tingin ng applicants ... pag napindot na nung isa, mag notify samin lahat real time
-- sino may access sa recruitment page beh no matter which part of the dashboard we are").
--  * recruit_applicants.assigned_to / assigned_email / assigned_at: who has taken this person
--  * recruit_assign(person, take, force): take = true claims the person; if someone else already has them it refuses and says who (force = true takes them over); take = false lets go
--    (only the person who holds it, or Level 5)
--  * a claim writes ONE notice (popup) for everyone else who can open Recruitment (Level 5 or the 'recruitment' extra page): "Jho took Aisha Khan". The notice is shown by the
--    bell on every signed-in page, not only on Recruitment.
--  * site_notice_ping: one empty row per claim, in the realtime publication. The bell (js/notifications.js) and the Recruitment page listen to it, so the notice appears at once instead of
--    at the next 60 second check. The row holds no data (only a time), so any signed-in person may read it.
--  * the claim is in the person's history (Who changed what) but does not replace Last change.
-- Undo: drop function recruit_assign, _notice_ping; alter publication supabase_realtime drop table site_notice_ping; drop table site_notice_ping; drop the three assigned_ columns;
-- re-run recruit_editor_name_part2_17nov.sql for recruit_get.

alter table public.recruit_applicants add column if not exists assigned_to text;
alter table public.recruit_applicants add column if not exists assigned_email text;
alter table public.recruit_applicants add column if not exists assigned_at timestamptz;

create table if not exists public.site_notice_ping (
  id bigserial primary key,
  at timestamptz not null default now()
);
alter table public.site_notice_ping enable row level security;
drop policy if exists site_notice_ping_read on public.site_notice_ping;
create policy site_notice_ping_read on public.site_notice_ping for select to authenticated using (true);
revoke all on public.site_notice_ping from anon;
grant select on public.site_notice_ping to authenticated;
revoke all on sequence public.site_notice_ping_id_seq from anon, authenticated;
do $p$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'site_notice_ping') then
    alter publication supabase_realtime add table public.site_notice_ping;
  end if;
end $p$;

create or replace function public._notice_ping() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.site_notice_ping default values;
  delete from public.site_notice_ping where at < now() - interval '1 day';
end $$;
revoke all on function public._notice_ping() from public, anon, authenticated;

create or replace function public.recruit_assign(p_id uuid, p_take boolean default true, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare
  who text := public.recruit_guard(); em text := lower(public.kb_me_email()); lv int;
  a public.recruit_applicants; r record; pname text; n int := 0;
begin
  select * into a from public.recruit_applicants where id = p_id for update;
  if not found then raise exception 'that person is no longer there'; end if;
  select m.level into lv from public.dashboard_me() m limit 1;

  if not coalesce(p_take, true) then
    if a.assigned_to is null then return jsonb_build_object('ok', true, 'free', true); end if;
    if a.assigned_email is distinct from em and coalesce(lv, 0) < 5 then
      return jsonb_build_object('ok', false, 'taken_by', a.assigned_to);
    end if;
    update public.recruit_applicants set assigned_to = null, assigned_email = null, assigned_at = null where id = p_id;
    perform public.recruit_log(array[p_id], who, 'Let go of the assignment (was ' || a.assigned_to || ')', false);
    return jsonb_build_object('ok', true, 'free', true);
  end if;

  if a.assigned_email = em then return jsonb_build_object('ok', true, 'mine', true, 'already', true); end if;
  if a.assigned_to is not null and not coalesce(p_force, false) then
    return jsonb_build_object('ok', false, 'taken_by', a.assigned_to, 'at', a.assigned_at);
  end if;

  update public.recruit_applicants set assigned_to = who, assigned_email = em, assigned_at = now() where id = p_id;
  perform public.recruit_log(array[p_id], who, case when a.assigned_to is null then 'Assigned to ' || who else 'Took over from ' || a.assigned_to end, false);

  pname := coalesce(nullif(btrim(a.name), ''), 'a new applicant');
  for r in select lower(u.email) as email from public.dashboard_users u
            where lower(u.email) <> em and (u.level >= 5 or 'recruitment' = any (coalesce(u.extra_pages, '{}'::text[]))) loop
    perform public._notice_push('recruit_claim', p_id::text || ':' || floor(extract(epoch from clock_timestamp()))::text || ':' || r.email, r.email,
      left(who || ' took ' || pname, 110),
      case when a.assigned_to is null then 'Leave ' || pname || ' with ' || who || ' so you are not both looking at the same person.'
           else who || ' took over ' || pname || ' from ' || a.assigned_to || '.' end,
      'chat', '/?view=recruitment&cand=' || p_id::text, 'Open', true);
    n := n + 1;
  end loop;
  perform public._notice_ping();
  return jsonb_build_object('ok', true, 'mine', true, 'notified', n);
end $f$;
grant execute on function public.recruit_assign(uuid, boolean, boolean) to authenticated;

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
        'assigned_to', a.assigned_to, 'assigned_at', a.assigned_at, 'assigned_mine', (a.assigned_email is not null and a.assigned_email = em))
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $f$;
