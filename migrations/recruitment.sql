-- Recruitment triage (Kate, 9 Nov 2026). The page for Kate and Coach Emma: one list of applicants from the recruitment inbox and the info inbox,
-- worth a look / probably no / waiting, with Shortlist and Not now. Mockup approved 9 Nov 2026 (docs/mockups/recruitment-triage.html in the cowork repo).
--
-- Who may read or change anything here: Level 5 (Kate) and anyone whose dashboard_users.extra_pages holds 'recruitment' (Coach Emma). Nobody else, whatever their
-- level. The last statement of this file gives Coach Emma that one extra page.
-- Applicant emails, numbers and CV links are personal data, so the tables have row level security with NO policy: nothing reads them except the functions below.
-- The two mailbox scripts (apps-script/sync-recruitment-mailbox.gs, one in recruitment@ and one in info@) push through recruit_import() with the same push pass the
-- other pushers use. Import never touches stage, decided_by or decided_at, so a decision made on the page is never undone by a sync.
-- Undo all of it: drop the five functions, then drop table public.recruit_applicants and public.recruit_settings, then
--   update public.dashboard_users set extra_pages = array_remove(extra_pages, 'recruitment');
-- Applied live 9 Nov 2026 (Kate said go), including Coach Emma's extra page below. Tested rolled back first.

create table if not exists public.recruit_applicants (
  id                   uuid primary key default gen_random_uuid(),
  person_key           text not null unique,        -- lower(email), else last 9 digits of the WhatsApp number, else the lower-cased name
  name                 text,
  email                text,
  whatsapp             text,
  country              text,
  emirate              text,
  experience           text,
  specialist           text,
  paths                text,
  role_key             text,                          -- stylist, colourist, beauty, nails, front, barber, braider, other
  role_txt             text,
  work_link            text,
  link_kind            text,                          -- instagram, tiktok, facebook, website, other (blank when no link)
  ig_handle            text,
  cv_link              text,
  about                text,
  source               text not null default 'form' check (source in ('form', 'email')),
  mailboxes            text[] not null default '{}',
  msg_ids              text[] not null default '{}',
  applied_at           timestamptz not null,           -- the first time they applied
  last_applied_at      timestamptz not null,           -- the latest time (people apply twice)
  replied_at           timestamptz,                    -- our first human reply (the automatic brochure email does not count)
  candidate_replied_at timestamptz,                    -- they answered the automatic email
  bounced              boolean not null default false, -- our email to them came back undeliverable
  stage                text not null default 'new' check (stage in ('new', 'screening', 'interview_booked', 'trade_test', 'offer', 'hired', 'not_now', 'rejected')),
  decided_by           text,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists recruit_applicants_stage_idx on public.recruit_applicants (stage, applied_at);
alter table public.recruit_applicants enable row level security;   -- no policies on purpose

create table if not exists public.recruit_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.recruit_settings enable row level security;     -- no policies on purpose

-- Starting values. The two reply texts are placeholders until Kate and Coach Emma have written the real ones and the brand review has passed them;
-- the page says so until templates_confirmed is true.
insert into public.recruit_settings (key, value) values
  ('open_roles',         '{"stylist": true, "colourist": true, "beauty": true, "nails": true, "front": false, "barber": false, "braider": false}'::jsonb),
  ('booking_link',       '""'::jsonb),
  ('invite_template',    to_jsonb('Hi {first},' || E'\n\n' || 'Thank you for applying to Tara Rose. We would like to meet you on a short Zoom call. Please choose a time that suits you here: {link}' || E'\n\n' || 'We look forward to meeting you.'::text)),
  ('decline_template',   to_jsonb('Hi {first},' || E'\n\n' || 'Thank you for your interest in Tara Rose. We are not able to take your application forward at the moment, and we wish you every success.'::text)),
  ('templates_confirmed','false'::jsonb),
  ('wait_days',          '14'::jsonb)
on conflict (key) do nothing;

create or replace function public.recruit_guard() returns text
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.name is null or not (m.level >= 5 or 'recruitment' = any (coalesce(m.extra_pages, '{}'::text[]))) then
    raise exception 'Not open to your account';
  end if;
  return m.name;
end $$;

-- the merge key: email, else the last 9 digits of the WhatsApp number, else the name
create or replace function public.recruit_person_key(p_email text, p_whatsapp text, p_name text) returns text
language sql immutable set search_path = public as $$
  select coalesce(
    nullif(lower(btrim(coalesce(p_email, ''))), ''),
    case when length(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g')) >= 9 then 'wa:' || right(regexp_replace(p_whatsapp, '\D', '', 'g'), 9) end,
    case when btrim(coalesce(p_name, '')) <> '' then 'name:' || lower(btrim(p_name)) end)
$$;

-- Everything the page draws, in one call. The about text is cut at 800 characters; the CV and work link open the originals.
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
        'stage', a.stage, 'decided_by', a.decided_by, 'decided_at', a.decided_at, 'merged', cardinality(a.msg_ids))
        order by a.applied_at)
      from (select * from public.recruit_applicants order by applied_at desc limit 3000) a), '[]'::jsonb));
end $$;

-- Move people between stages. p_stage 'new' is the undo: it clears who decided and when.
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
         updated_at = now()
   where id = any (p_ids);
  get diagnostics n = row_count;
  return jsonb_build_object('changed', n);
end $$;

-- Which roles are open, the booking link and the two reply texts (only these keys).
create or replace function public.recruit_settings_set(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_key is null or p_key not in ('open_roles', 'booking_link', 'invite_template', 'decline_template', 'templates_confirmed', 'wait_days') then
    raise exception 'unknown setting';
  end if;
  if p_value is null then raise exception 'a value is needed'; end if;
  insert into public.recruit_settings (key, value, updated_at, updated_by) values (p_key, p_value, now(), who)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = who;
end $$;

-- The mailbox scripts. One row per thing they saw; kind is application, reply (they answered the automatic email), human_reply (we answered them) or bounce.
-- application merges into the person with the same email (else WhatsApp, else name): the first application date stays, the newest form answers win, a direct
-- email never overwrites what the website form said. p_dry true writes nothing and returns the same counts.
create or replace function public.recruit_import(p_pass uuid, p_rows jsonb, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; kind text; ts timestamptz; k text; em text; ex public.recruit_applicants; prefer_new boolean;
  i_name text; i_wa text; i_country text; i_emirate text; i_exp text; i_spec text; i_paths text; i_rkey text; i_rtxt text;
  i_link text; i_lkind text; i_ig text; i_cv text; i_about text; i_source text; mb text; mid text;
  n_new int := 0; n_merged int := 0; n_reply int := 0; n_human int := 0; n_bounce int := 0; n_unmatched int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'at most 1000 rows per call'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    kind := coalesce(r->>'kind', 'application');
    begin ts := coalesce(nullif(r->>'at', '')::timestamptz, now()); exception when others then ts := now(); end;
    em := nullif(lower(btrim(coalesce(r->>'email', ''))), '');
    mb := nullif(btrim(coalesce(r->>'mailbox', '')), '');
    mid := nullif(btrim(coalesce(r->>'msg_id', '')), '');
    if kind = 'application' then k := public.recruit_person_key(em, r->>'whatsapp', r->>'name');
    else k := public.recruit_person_key(em, null, null); end if;
    if k is null then n_unmatched := n_unmatched + 1; continue; end if;
    select * into ex from public.recruit_applicants where person_key = k;

    if kind = 'application' then
      i_name := nullif(btrim(coalesce(r->>'name', '')), '');      i_wa := nullif(btrim(coalesce(r->>'whatsapp', '')), '');
      i_country := nullif(btrim(coalesce(r->>'country', '')), '');  i_emirate := nullif(btrim(coalesce(r->>'emirate', '')), '');
      i_exp := nullif(btrim(coalesce(r->>'experience', '')), '');   i_spec := nullif(btrim(coalesce(r->>'specialist', '')), '');
      i_paths := nullif(btrim(coalesce(r->>'paths', '')), '');      i_rkey := nullif(btrim(coalesce(r->>'role_key', '')), '');
      i_rtxt := nullif(btrim(coalesce(r->>'role_txt', '')), '');    i_link := nullif(btrim(coalesce(r->>'work_link', '')), '');
      i_lkind := nullif(btrim(coalesce(r->>'link_kind', '')), '');  i_ig := nullif(btrim(coalesce(r->>'ig_handle', '')), '');
      i_cv := nullif(btrim(coalesce(r->>'cv_link', '')), '');       i_about := nullif(btrim(coalesce(r->>'about', '')), '');
      i_source := case when r->>'source' = 'email' then 'email' else 'form' end;
      if ex.id is null then
        n_new := n_new + 1;
        if not p_dry then
          insert into public.recruit_applicants (person_key, name, email, whatsapp, country, emirate, experience, specialist, paths, role_key, role_txt,
                 work_link, link_kind, ig_handle, cv_link, about, source, mailboxes, msg_ids, applied_at, last_applied_at)
          values (k, i_name, em, i_wa, i_country, i_emirate, i_exp, i_spec, i_paths, i_rkey, i_rtxt, i_link, i_lkind, i_ig, i_cv, i_about, i_source,
                  case when mb is null then '{}' else array[mb] end, case when mid is null then '{}' else array[mid] end, ts, ts);
        end if;
      else
        n_merged := n_merged + 1;
        prefer_new := ts >= ex.last_applied_at and not (i_source = 'email' and ex.source = 'form');
        if not p_dry then
          update public.recruit_applicants set
            name = case when prefer_new then coalesce(i_name, ex.name) else coalesce(ex.name, i_name) end,
            email = coalesce(ex.email, em),
            whatsapp = case when prefer_new then coalesce(i_wa, ex.whatsapp) else coalesce(ex.whatsapp, i_wa) end,
            country = case when prefer_new then coalesce(i_country, ex.country) else coalesce(ex.country, i_country) end,
            emirate = case when prefer_new then coalesce(i_emirate, ex.emirate) else coalesce(ex.emirate, i_emirate) end,
            experience = case when prefer_new then coalesce(i_exp, ex.experience) else coalesce(ex.experience, i_exp) end,
            specialist = case when prefer_new then coalesce(i_spec, ex.specialist) else coalesce(ex.specialist, i_spec) end,
            paths = case when prefer_new then coalesce(i_paths, ex.paths) else coalesce(ex.paths, i_paths) end,
            role_key = case when prefer_new then coalesce(i_rkey, ex.role_key) else coalesce(ex.role_key, i_rkey) end,
            role_txt = case when prefer_new then coalesce(i_rtxt, ex.role_txt) else coalesce(ex.role_txt, i_rtxt) end,
            work_link = case when prefer_new then coalesce(i_link, ex.work_link) else coalesce(ex.work_link, i_link) end,
            link_kind = case when prefer_new then coalesce(i_lkind, ex.link_kind) else coalesce(ex.link_kind, i_lkind) end,
            ig_handle = case when prefer_new then coalesce(i_ig, ex.ig_handle) else coalesce(ex.ig_handle, i_ig) end,
            cv_link = case when prefer_new then coalesce(i_cv, ex.cv_link) else coalesce(ex.cv_link, i_cv) end,
            about = case when prefer_new then coalesce(i_about, ex.about) else coalesce(ex.about, i_about) end,
            source = case when ex.source = 'form' or i_source = 'form' then 'form' else 'email' end,
            mailboxes = case when mb is null or mb = any (ex.mailboxes) then ex.mailboxes else array_append(ex.mailboxes, mb) end,
            msg_ids = case when mid is null or mid = any (ex.msg_ids) then ex.msg_ids else array_append(ex.msg_ids, mid) end,
            applied_at = least(ex.applied_at, ts),
            last_applied_at = greatest(ex.last_applied_at, ts),
            updated_at = now()
          where id = ex.id;
        end if;
      end if;

    elsif ex.id is null then
      n_unmatched := n_unmatched + 1;     -- a reply or bounce from someone we do not know never creates a person
    elsif kind = 'reply' then
      n_reply := n_reply + 1;
      if not p_dry then update public.recruit_applicants set candidate_replied_at = greatest(coalesce(candidate_replied_at, ts), ts), updated_at = now() where id = ex.id; end if;
    elsif kind = 'human_reply' then
      n_human := n_human + 1;
      if not p_dry then update public.recruit_applicants set replied_at = least(coalesce(replied_at, ts), ts), updated_at = now() where id = ex.id; end if;
    elsif kind = 'bounce' then
      n_bounce := n_bounce + 1;
      if not p_dry then update public.recruit_applicants set bounced = true, updated_at = now() where id = ex.id; end if;
    else
      n_unmatched := n_unmatched + 1;
    end if;
  end loop;
  return jsonb_build_object('dry', p_dry, 'new', n_new, 'merged', n_merged, 'replies', n_reply, 'human_replies', n_human, 'bounces', n_bounce, 'unmatched', n_unmatched);
end $$;

-- Supabase grants new functions to anon and authenticated by default, so the revokes name them: only the three page functions go to authenticated,
-- only the passworded import goes to anon, and the two helpers go to nobody.
revoke all on function public.recruit_guard() from public, anon, authenticated;
revoke all on function public.recruit_person_key(text, text, text) from public, anon, authenticated;
revoke all on function public.recruit_get() from public, anon;
revoke all on function public.recruit_set_stage(uuid[], text) from public, anon;
revoke all on function public.recruit_settings_set(text, jsonb) from public, anon;
revoke all on function public.recruit_import(uuid, jsonb, boolean) from public, authenticated;
grant execute on function public.recruit_get() to authenticated;
grant execute on function public.recruit_set_stage(uuid[], text) to authenticated;
grant execute on function public.recruit_settings_set(text, jsonb) to authenticated;
grant execute on function public.recruit_import(uuid, jsonb, boolean) to anon;

-- Giving Coach Emma the page (one row, undone with array_remove):
update public.dashboard_users set extra_pages = array_append(coalesce(extra_pages, '{}'::text[]), 'recruitment')
 where email = 'emmalouise@tararosesalon.com' and not ('recruitment' = any (coalesce(extra_pages, '{}'::text[])));
