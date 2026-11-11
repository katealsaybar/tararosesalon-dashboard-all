-- Recruitment: a real CV link beats a dead Brevo tracking link (Kate, 11 Nov 2026). Run after recruitment_dedupe.sql. Changes recruit_import only.
--
-- 249 applicants had a cv_link that was a Brevo click-tracking redirect (badhbgjd.r.*.sendibt*.com, tsp1-brevo.net, /tr/cl/...), which returns 404 and hides the real
-- file. The mailbox script (apps-script/sync-recruitment-mailbox.gs) now rebuilds the real link on the website's Gravity Forms folder and sends it; this change makes
-- the database take it:
--   1. an incoming cv_link that is a tracking link is ignored (never stored);
--   2. a stored tracking link is replaced by any real incoming link, whichever copy of the email is newer. Every other field keeps the old merge rule.
-- Backup of the old values: recruit_cv_links_backup_11nov (applicant id + old cv_link), RLS on, no policies.
-- Undo: put recruit_import back from recruitment_dedupe.sql; restore the links from the backup table.

create table if not exists public.recruit_cv_links_backup_11nov as
  select id, cv_link, now() as saved_at from public.recruit_applicants where cv_link ~* '^https?://[^/]*(sendibt[0-9]*|brevo)[^/]*/';
alter table public.recruit_cv_links_backup_11nov enable row level security;

create or replace function public.recruit_import(p_pass uuid, p_rows jsonb, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; knd text; ts timestamptz; k text; em text; nem text; nwa text; ex public.recruit_applicants; prefer_new boolean; by_alias text; new_id uuid; u record;
  i_name text; i_wa text; i_country text; i_emirate text; i_exp text; i_spec text; i_paths text; i_rkey text; i_rtxt text;
  i_link text; i_lkind text; i_ig text; i_cv text; i_about text; i_source text; mb text; mid text;
  n_new int := 0; n_merged int := 0; n_reply int := 0; n_human int := 0; n_bounce int := 0; n_unmatched int := 0; n_by_alias int := 0; n_replayed int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'at most 1000 rows per call'; end if;
  if not p_dry then delete from public.recruit_import_unmatched where logged_at < now() - interval '90 days'; end if;

  -- applications first, so a reply or bounce in the same batch finds its person
  for r in select e.v from jsonb_array_elements(p_rows) with ordinality as e(v, n)
            order by case when coalesce(e.v->>'kind', 'application') = 'application' then 0 else 1 end, e.n
  loop
    knd := coalesce(r->>'kind', 'application');
    begin ts := coalesce(nullif(r->>'at', '')::timestamptz, now()); exception when others then ts := now(); end;
    em := nullif(lower(btrim(coalesce(r->>'email', ''))), '');
    nem := public.recruit_norm_email(em);
    mb := nullif(btrim(coalesce(r->>'mailbox', '')), '');
    mid := nullif(btrim(coalesce(r->>'msg_id', '')), '');
    ex := null; by_alias := null;

    if knd = 'application' then
      i_name := nullif(btrim(coalesce(r->>'name', '')), '');      i_wa := nullif(btrim(coalesce(r->>'whatsapp', '')), '');
      nwa := public.recruit_norm_wa(i_wa);
      k := public.recruit_person_key(em, i_wa, i_name);
      if k is null then n_unmatched := n_unmatched + 1; continue; end if;
      -- 1. the same cleaned email (any email this person has used)
      if nem is not null then
        select a.* into ex from public.recruit_applicants a join public.recruit_aliases al on al.applicant_id = a.id
         where al.kind = 'email' and al.value = nem limit 1;
      end if;
      -- 2. the same international WhatsApp number, when the names agree
      if ex.id is null and nwa is not null then
        select a.* into ex from public.recruit_applicants a join public.recruit_aliases al on al.applicant_id = a.id
         where al.kind = 'wa' and al.value = nwa and public.recruit_name_compatible(a.name, i_name) order by a.applied_at, a.id limit 1;
        if ex.id is not null then by_alias := 'wa'; end if;
      end if;
      -- 3. the old key (kept so nothing that matched before stops matching)
      if ex.id is null then select * into ex from public.recruit_applicants where person_key = k; end if;
      if ex.id is not null and by_alias is null and nem is not null and lower(coalesce(ex.email, '')) <> em then by_alias := 'email'; end if;

      i_country := nullif(btrim(coalesce(r->>'country', '')), '');  i_emirate := nullif(btrim(coalesce(r->>'emirate', '')), '');
      i_exp := nullif(btrim(coalesce(r->>'experience', '')), '');   i_spec := nullif(btrim(coalesce(r->>'specialist', '')), '');
      i_paths := nullif(btrim(coalesce(r->>'paths', '')), '');      i_rkey := nullif(btrim(coalesce(r->>'role_key', '')), '');
      i_rtxt := nullif(btrim(coalesce(r->>'role_txt', '')), '');    i_link := nullif(btrim(coalesce(r->>'work_link', '')), '');
      i_lkind := nullif(btrim(coalesce(r->>'link_kind', '')), '');  i_ig := nullif(btrim(coalesce(r->>'ig_handle', '')), '');
      i_cv := nullif(btrim(coalesce(r->>'cv_link', '')), '');       i_about := nullif(btrim(coalesce(r->>'about', '')), '');
      -- a Brevo click-tracking link is dead (404) and hides the real file: never store one (11 Nov 2026)
      if i_cv ~* '^https?://[^/]*(sendibt[0-9]*|brevo)[^/]*/' then i_cv := null; end if;
      i_source := case when r->>'source' = 'email' then 'email' else 'form' end;

      if ex.id is null then
        n_new := n_new + 1;
        if not p_dry then
          if exists (select 1 from public.recruit_applicants where person_key = k) then k := k || ':' || substr(gen_random_uuid()::text, 1, 8); end if;
          insert into public.recruit_applicants (person_key, name, email, whatsapp, country, emirate, experience, specialist, paths, role_key, role_txt,
                 work_link, link_kind, ig_handle, cv_link, about, source, mailboxes, msg_ids, applied_at, last_applied_at)
          values (k, i_name, em, i_wa, i_country, i_emirate, i_exp, i_spec, i_paths, i_rkey, i_rtxt, i_link, i_lkind, i_ig, i_cv, i_about, i_source,
                  case when mb is null then '{}' else array[mb] end, case when mid is null then '{}' else array[mid] end, ts, ts)
          returning id into new_id;
          perform public.recruit_alias_add(new_id, em, i_wa);
          -- replies or bounces that came in before this person did
          if nem is not null then
            for u in with dl as (delete from public.recruit_import_unmatched where email_norm = nem returning kind, at) select dl.kind, dl.at from dl loop
              perform public.recruit_apply_signal(new_id, u.kind, u.at); n_replayed := n_replayed + 1;
            end loop;
          end if;
        end if;
      else
        n_merged := n_merged + 1;
        if by_alias is not null then n_by_alias := n_by_alias + 1; end if;
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
            -- a real file link always replaces a stored Brevo tracking link; otherwise the old rule
            cv_link = case when i_cv is not null and ex.cv_link ~* '^https?://[^/]*(sendibt[0-9]*|brevo)[^/]*/' then i_cv
                           when prefer_new then coalesce(i_cv, ex.cv_link) else coalesce(ex.cv_link, i_cv) end,
            about = case when prefer_new then coalesce(i_about, ex.about) else coalesce(ex.about, i_about) end,
            source = case when ex.source = 'form' or i_source = 'form' then 'form' else 'email' end,
            mailboxes = case when mb is null or mb = any (ex.mailboxes) then ex.mailboxes else array_append(ex.mailboxes, mb) end,
            msg_ids = case when mid is null or mid = any (ex.msg_ids) then ex.msg_ids else array_append(ex.msg_ids, mid) end,
            applied_at = least(ex.applied_at, ts),
            last_applied_at = greatest(ex.last_applied_at, ts),
            updated_at = now()
          where id = ex.id;
          perform public.recruit_alias_add(ex.id, em, i_wa);
          if nem is not null and by_alias is not null then
            for u in with dl as (delete from public.recruit_import_unmatched where email_norm = nem returning kind, at) select dl.kind, dl.at from dl loop
              perform public.recruit_apply_signal(ex.id, u.kind, u.at); n_replayed := n_replayed + 1;
            end loop;
          end if;
        end if;
      end if;

    else
      -- reply, human_reply, bounce: find the person by any email they have used
      if nem is not null then
        select a.* into ex from public.recruit_applicants a join public.recruit_aliases al on al.applicant_id = a.id where al.kind = 'email' and al.value = nem limit 1;
        if ex.id is null then select * into ex from public.recruit_applicants where person_key = nem or lower(email) = em limit 1; end if;
      end if;
      if nem is null or knd not in ('reply', 'human_reply', 'bounce') then
        n_unmatched := n_unmatched + 1;
      elsif ex.id is null then
        n_unmatched := n_unmatched + 1;     -- never creates a person; kept for 90 days and applied if that person turns up
        if not p_dry then
          insert into public.recruit_import_unmatched (kind, email_norm, at, mailbox, msg_id) values (knd, nem, ts, mb, mid) on conflict do nothing;
        end if;
      else
        if knd = 'reply' then n_reply := n_reply + 1; elsif knd = 'human_reply' then n_human := n_human + 1; else n_bounce := n_bounce + 1; end if;
        if not p_dry then perform public.recruit_apply_signal(ex.id, knd, ts); end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('dry', p_dry, 'new', n_new, 'merged', n_merged, 'matched_by_other_email_or_number', n_by_alias, 'replies', n_reply,
                            'human_replies', n_human, 'bounces', n_bounce, 'unmatched', n_unmatched, 'replayed', n_replayed);
end $$;
