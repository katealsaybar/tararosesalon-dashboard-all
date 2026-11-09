-- Recruitment: one person, one card (Kate, 9 Nov 2026).
-- Kate said go on the rules below (analysis: same person showed up on more than one card whenever someone used a second email address, and
-- recruit_import only ever looked at one key, the first email it saw).
--
-- WHAT IT DOES
--  1. Aliases. recruit_aliases holds every email (cleaned: lower case, no +tag, no dots on Gmail) and every WhatsApp number (international format,
--     UAE numbers written 05x / 5x / 00971 / +971 05x all become 9715x...) a person has used. recruit_import finds people through it, so a second email or
--     a second mailbox can no longer create a second card.
--  2. Automatic merge only on strong keys: the same cleaned email, or the same international WhatsApp number when the two names agree (share a word, or one
--     is blank). The same number with two different names is NOT merged by the machine, it shows up as a suggestion. Instagram handle is never an automatic key:
--     on 9 Nov all 5 handle matches were different people.
--  3. Possible duplicates (recruit_dup_suggestions): same name, same Instagram handle, a name or email one or two letters off, the same email name on another
--     domain, the same number with different names, the same last 9 digits written differently. A human confirms with recruit_merge_people() or says
--     recruit_not_same_set() and the pair never comes back.
--  4. A merge keeps every email, WhatsApp number, message link and mailbox on the one person, the earliest applied date and the latest one, the furthest stage a
--     human set, our first reply and their last reply. It never resurrects: a declined person stays declined (declined + new = declined), hired stays hired,
--     and hired + declined, or declined + already moved on, is refused with a message so a person looks at it. The person keeps the first card.
--  5. Reversible. Every merge writes recruit_merge_log with both rows as they were and the aliases that moved; recruit_unmerge(log id) puts both people back
--     (messages that arrived after the merge stay on the first card; a stage someone set after the merge is kept).
--  6. recruit_import: applications first, then replies and bounces (so a reply in the same batch finds its person), lookup through the aliases, an application
--     that matches an alias merges into that person and adds its new email or number to them. A reply or bounce from an address nobody has yet is kept in
--     recruit_import_unmatched (90 days) and applied when that person turns up. Import still never touches stage, decided_by or decided_at.
--
-- Nothing here is open to anon or to ordinary staff: Level 5 and Coach Emma (recruit_guard) only, same as the page.
-- Backup taken before anything changed: recruit_applicants_backup_premerge_9nov.
-- Undo all of it (after unmerging what you want back): drop the functions recruit_alias_add, recruit_apply_signal, recruit_do_merge, recruit_merge_people,
--   recruit_unmerge, recruit_dup_suggestions, recruit_not_same_set, recruit_person_aliases, recruit_merge_history, recruit_norm_email, recruit_norm_wa,
--   recruit_name_key, recruit_name_compatible, recruit_stage_rank; drop tables recruit_aliases, recruit_merge_log, recruit_not_same, recruit_import_unmatched;
--   then put recruit_import back from migrations/recruitment.sql.

-- 0. the backup (whole table, 278 rows on 9 Nov, no policy on purpose)
create table if not exists public.recruit_applicants_backup_premerge_9nov as select * from public.recruit_applicants;
alter table public.recruit_applicants_backup_premerge_9nov enable row level security;

-- 1. helpers ---------------------------------------------------------------------------------------------------------------------------------------

create or replace function public.recruit_norm_email(p text) returns text
language sql immutable set search_path = public as $$
  select case
    when nullif(btrim(coalesce(p, '')), '') is null then null
    when position('@' in p) = 0 then lower(btrim(p))
    else coalesce(
      nullif(case when split_part(lower(btrim(p)), '@', 2) in ('gmail.com', 'googlemail.com')
                  then replace(split_part(split_part(lower(btrim(p)), '@', 1), '+', 1), '.', '')
                  else split_part(split_part(lower(btrim(p)), '@', 1), '+', 1) end, '')
        || '@' || case when split_part(lower(btrim(p)), '@', 2) = 'googlemail.com' then 'gmail.com' else split_part(lower(btrim(p)), '@', 2) end,
      lower(btrim(p)))
  end
$$;

-- International digits (no +). UAE mobiles written 05x.., 5x.., 00971.., +971 05x.. all become 9715xxxxxxxx. Anything else keeps its digits.
-- Null when it is not a plausible number (under 9 or over 15 digits, or one digit repeated).
create or replace function public.recruit_norm_wa(p text) returns text
language sql immutable set search_path = public as $$
  select case when length(x) between 9 and 15 and x !~ '^(\d)\1+$' then x end
  from (
    select case
      when d ~ '^9710\d{9}$' then '971' || substr(d, 5)
      when d ~ '^971\d{9}$' then d
      when d ~ '^0?5\d{8}$' then '971' || right(d, 9)
      else d end x
    from (select case when s like '00%' then substr(s, 3) else s end d
            from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') s) q) w
  ) z
$$;

-- case, accents, spacing and the order of first and last name do not matter: the words, lower case, sorted
create or replace function public.recruit_name_key(p text) returns text
language sql immutable set search_path = public as $$
  select nullif((select string_agg(t, ' ' order by t)
                   from unnest(regexp_split_to_array(lower(translate(coalesce(p, ''),
                        'áàâäãåéèêëíìîïóòôöõúùûüçñÁÀÂÄÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ', 'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn')), '[^a-z]+')) t
                  where t <> ''), '')
$$;

-- two names agree when either is blank or they share a word of 2 letters or more
create or replace function public.recruit_name_compatible(a text, b text) returns boolean
language sql immutable set search_path = public as $$
  select public.recruit_name_key(a) is null or public.recruit_name_key(b) is null
      or exists (select 1 from unnest(string_to_array(public.recruit_name_key(a), ' ')) t
                  where length(t) >= 2 and t = any (string_to_array(public.recruit_name_key(b), ' ')))
$$;

create or replace function public.recruit_stage_rank(p text) returns int
language sql immutable set search_path = public as $$
  select case p when 'new' then 0 when 'screening' then 1 when 'interview_booked' then 2 when 'trade_test' then 3 when 'offer' then 4 when 'hired' then 5 else -1 end
$$;

-- 2. tables ----------------------------------------------------------------------------------------------------------------------------------------

create table if not exists public.recruit_aliases (
  id           uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  kind         text not null check (kind in ('email', 'wa')),
  value        text not null,          -- cleaned email, or international digits
  raw          text,                   -- as the person wrote it
  created_at   timestamptz not null default now(),
  unique (applicant_id, kind, value)
);
create unique index if not exists recruit_aliases_email_uq on public.recruit_aliases (value) where kind = 'email';
create index if not exists recruit_aliases_wa_idx on public.recruit_aliases (value) where kind = 'wa';
alter table public.recruit_aliases enable row level security;

create table if not exists public.recruit_merge_log (
  id              uuid primary key default gen_random_uuid(),
  kept_id         uuid not null,
  dropped_id      uuid not null,
  rule            text not null,        -- auto_email, auto_whatsapp, manual
  merged_by       text,
  merged_at       timestamptz not null default now(),
  kept_before     jsonb not null,       -- the kept person as they were
  dropped_row     jsonb not null,       -- the other person as they were (their row is deleted from recruit_applicants)
  dropped_aliases jsonb not null default '[]'::jsonb,
  kept_after      jsonb,
  undone_at       timestamptz,
  undone_by       text
);
create index if not exists recruit_merge_log_kept_idx on public.recruit_merge_log (kept_id);
alter table public.recruit_merge_log enable row level security;

create table if not exists public.recruit_not_same (
  a         uuid not null,
  b         uuid not null,
  marked_by text,
  marked_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
alter table public.recruit_not_same enable row level security;

create table if not exists public.recruit_import_unmatched (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,
  email_norm text not null,
  at         timestamptz not null,
  mailbox    text,
  msg_id     text,
  logged_at  timestamptz not null default now()
);
create unique index if not exists recruit_import_unmatched_uq on public.recruit_import_unmatched (kind, email_norm, at);
alter table public.recruit_import_unmatched enable row level security;

-- 3. alias + signal helpers ------------------------------------------------------------------------------------------------------------------------

create or replace function public.recruit_alias_add(p_id uuid, p_email text, p_wa text) returns void
language plpgsql security definer set search_path = public as $$
declare ne text := public.recruit_norm_email(p_email); nw text := public.recruit_norm_wa(p_wa);
begin
  if ne is not null then
    insert into public.recruit_aliases (applicant_id, kind, value, raw) values (p_id, 'email', ne, lower(btrim(p_email))) on conflict do nothing;
  end if;
  if nw is not null then
    insert into public.recruit_aliases (applicant_id, kind, value, raw) values (p_id, 'wa', nw, btrim(p_wa)) on conflict do nothing;
  end if;
end $$;

-- a reply (they answered the automatic email), human_reply (we answered them) or bounce, applied to one person
create or replace function public.recruit_apply_signal(p_id uuid, p_kind text, p_ts timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'reply' then
    update public.recruit_applicants set candidate_replied_at = greatest(coalesce(candidate_replied_at, p_ts), p_ts), updated_at = now() where id = p_id;
  elsif p_kind = 'human_reply' then
    update public.recruit_applicants set replied_at = least(coalesce(replied_at, p_ts), p_ts), updated_at = now() where id = p_id;
  elsif p_kind = 'bounce' then
    update public.recruit_applicants set bounced = true, updated_at = now() where id = p_id;
  end if;
end $$;

-- 4. the merge -------------------------------------------------------------------------------------------------------------------------------------

-- p_keep stays, p_drop is folded into it and its row is deleted (it is kept whole in recruit_merge_log). Raises when a stage rule says a person must look first.
create or replace function public.recruit_do_merge(p_keep uuid, p_drop uuid, p_rule text, p_who text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k public.recruit_applicants; d public.recruit_applicants; w public.recruit_applicants;
  kd boolean; dd boolean; rk int; rd int; prefer_d boolean; lid uuid; dal jsonb; mail text; after_row jsonb;
begin
  if p_keep is null or p_drop is null or p_keep = p_drop then raise exception 'two different people are needed'; end if;
  perform 1 from public.recruit_applicants where id in (p_keep, p_drop) order by id for update;
  select * into k from public.recruit_applicants where id = p_keep;
  select * into d from public.recruit_applicants where id = p_drop;
  if k.id is null or d.id is null then raise exception 'one of the two people is no longer there'; end if;

  kd := k.stage in ('not_now', 'rejected'); dd := d.stage in ('not_now', 'rejected');
  rk := public.recruit_stage_rank(k.stage); rd := public.recruit_stage_rank(d.stage);
  if (k.stage = 'hired' or d.stage = 'hired') and (kd or dd) then
    raise exception 'one of them is Hired and the other was declined: look at them yourself';
  elsif (kd and rd >= 1) or (dd and rk >= 1) then
    raise exception 'one of them was declined and the other has moved on: look at them yourself';
  end if;
  if kd and dd then w := case when d.stage = 'rejected' and k.stage <> 'rejected' then d else k end;
  elsif kd then w := k;
  elsif dd then w := d;
  elsif rd > rk then w := d;
  else w := k; end if;

  prefer_d := d.last_applied_at > k.last_applied_at and not (d.source = 'email' and k.source = 'form');
  mail := case when k.bounced and not d.bounced and d.email is not null then d.email else k.email end;

  -- every email and number of both people is an alias, then all of the dropped person's aliases move to the kept one
  perform public.recruit_alias_add(k.id, k.email, k.whatsapp);
  perform public.recruit_alias_add(d.id, d.email, d.whatsapp);
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into dal from public.recruit_aliases a where a.applicant_id = d.id;
  delete from public.recruit_aliases da using public.recruit_aliases ka
   where da.applicant_id = d.id and ka.applicant_id = k.id and da.kind = ka.kind and da.value = ka.value;
  update public.recruit_aliases set applicant_id = k.id where applicant_id = d.id;

  update public.recruit_applicants set
    name = case when prefer_d then coalesce(d.name, k.name) else coalesce(k.name, d.name) end,
    email = mail,
    whatsapp = case when prefer_d then coalesce(d.whatsapp, k.whatsapp) else coalesce(k.whatsapp, d.whatsapp) end,
    country = case when prefer_d then coalesce(d.country, k.country) else coalesce(k.country, d.country) end,
    emirate = case when prefer_d then coalesce(d.emirate, k.emirate) else coalesce(k.emirate, d.emirate) end,
    experience = case when prefer_d then coalesce(d.experience, k.experience) else coalesce(k.experience, d.experience) end,
    specialist = case when prefer_d then coalesce(d.specialist, k.specialist) else coalesce(k.specialist, d.specialist) end,
    paths = case when prefer_d then coalesce(d.paths, k.paths) else coalesce(k.paths, d.paths) end,
    role_key = case when prefer_d then coalesce(d.role_key, k.role_key) else coalesce(k.role_key, d.role_key) end,
    role_txt = case when prefer_d then coalesce(d.role_txt, k.role_txt) else coalesce(k.role_txt, d.role_txt) end,
    work_link = case when prefer_d then coalesce(d.work_link, k.work_link) else coalesce(k.work_link, d.work_link) end,
    link_kind = case when prefer_d then coalesce(d.link_kind, k.link_kind) else coalesce(k.link_kind, d.link_kind) end,
    ig_handle = case when prefer_d then coalesce(d.ig_handle, k.ig_handle) else coalesce(k.ig_handle, d.ig_handle) end,
    cv_link = case when prefer_d then coalesce(d.cv_link, k.cv_link) else coalesce(k.cv_link, d.cv_link) end,
    about = case when prefer_d then coalesce(d.about, k.about) else coalesce(k.about, d.about) end,
    source = case when k.source = 'form' or d.source = 'form' then 'form' else 'email' end,
    mailboxes = (select coalesce(array_agg(distinct m order by m), '{}') from unnest(k.mailboxes || d.mailboxes) m),
    msg_ids = (select coalesce(array_agg(distinct m order by m), '{}') from unnest(k.msg_ids || d.msg_ids) m),
    applied_at = least(k.applied_at, d.applied_at),
    last_applied_at = greatest(k.last_applied_at, d.last_applied_at),
    replied_at = least(k.replied_at, d.replied_at),
    candidate_replied_at = greatest(k.candidate_replied_at, d.candidate_replied_at),
    bounced = case when mail is not distinct from k.email then k.bounced else d.bounced end,
    stage = w.stage, decided_by = w.decided_by, decided_at = w.decided_at,
    reviewed_at = least(k.reviewed_at, d.reviewed_at),
    reviewed_by = case when k.reviewed_at is null then d.reviewed_by when d.reviewed_at is null then k.reviewed_by
                       when d.reviewed_at < k.reviewed_at then d.reviewed_by else k.reviewed_by end,
    created_at = least(k.created_at, d.created_at),
    updated_at = now()
  where id = k.id;

  select to_jsonb(a) into after_row from public.recruit_applicants a where a.id = k.id;
  insert into public.recruit_merge_log (kept_id, dropped_id, rule, merged_by, kept_before, dropped_row, dropped_aliases, kept_after)
  values (k.id, d.id, p_rule, p_who, to_jsonb(k), to_jsonb(d), dal, after_row) returning id into lid;
  delete from public.recruit_applicants where id = d.id;
  return lid;
end $$;

-- 5. the page functions (Level 5 and Coach Emma only) ----------------------------------------------------------------------------------------------

create or replace function public.recruit_merge_people(p_keep uuid, p_drop uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard(); lid uuid;
begin
  lid := public.recruit_do_merge(p_keep, p_drop, 'manual', who);
  return jsonb_build_object('log_id', lid, 'kept', p_keep);
end $$;

create or replace function public.recruit_unmerge(p_log uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  who text := public.recruit_guard(); lg public.recruit_merge_log; cur jsonb; base jsonb; r public.recruit_applicants; extra text[]; changed boolean;
begin
  select * into lg from public.recruit_merge_log where id = p_log for update;
  if lg.id is null then raise exception 'no such merge'; end if;
  if lg.undone_at is not null then raise exception 'this merge was already undone'; end if;
  if exists (select 1 from public.recruit_applicants where id = lg.dropped_id) then raise exception 'that person is already back'; end if;
  select to_jsonb(a) into cur from public.recruit_applicants a where a.id = lg.kept_id for update;
  if cur is null then raise exception 'the first card is gone, cannot undo'; end if;

  base := lg.kept_before;
  -- a stage someone set after the merge stays
  changed := (cur->>'stage') is distinct from (lg.kept_after->>'stage') or (cur->>'decided_at') is distinct from (lg.kept_after->>'decided_at');
  if changed then
    base := base || jsonb_build_object('stage', cur->'stage', 'decided_by', cur->'decided_by', 'decided_at', cur->'decided_at',
                                       'reviewed_at', cur->'reviewed_at', 'reviewed_by', cur->'reviewed_by');
  end if;
  -- messages that arrived after the merge stay on the first card
  select coalesce(array_agg(m), '{}') into extra
    from jsonb_array_elements_text(cur->'msg_ids') m
   where m not in (select jsonb_array_elements_text(lg.kept_before->'msg_ids') union select jsonb_array_elements_text(lg.dropped_row->'msg_ids'));
  if cardinality(extra) > 0 then
    base := base || jsonb_build_object(
      'msg_ids', (select coalesce(jsonb_agg(m), '[]'::jsonb) from (select jsonb_array_elements_text(lg.kept_before->'msg_ids') m union select unnest(extra)) q),
      'last_applied_at', to_jsonb(greatest((lg.kept_before->>'last_applied_at')::timestamptz, (cur->>'last_applied_at')::timestamptz)));
  end if;
  r := jsonb_populate_record(null::public.recruit_applicants, base);
  update public.recruit_applicants set
    person_key = r.person_key, name = r.name, email = r.email, whatsapp = r.whatsapp, country = r.country, emirate = r.emirate, experience = r.experience,
    specialist = r.specialist, paths = r.paths, role_key = r.role_key, role_txt = r.role_txt, work_link = r.work_link, link_kind = r.link_kind,
    ig_handle = r.ig_handle, cv_link = r.cv_link, about = r.about, source = r.source, mailboxes = r.mailboxes, msg_ids = r.msg_ids,
    applied_at = r.applied_at, last_applied_at = r.last_applied_at, replied_at = r.replied_at, candidate_replied_at = r.candidate_replied_at,
    bounced = r.bounced, stage = r.stage, decided_by = r.decided_by, decided_at = r.decided_at, reviewed_at = r.reviewed_at, reviewed_by = r.reviewed_by,
    created_at = r.created_at, updated_at = now()
  where id = lg.kept_id;

  insert into public.recruit_applicants select (jsonb_populate_record(null::public.recruit_applicants, lg.dropped_row)).*;
  -- the dropped person's aliases go back to them
  insert into public.recruit_aliases (id, applicant_id, kind, value, raw, created_at)
  select (x->>'id')::uuid, lg.dropped_id, x->>'kind', x->>'value', x->>'raw', (x->>'created_at')::timestamptz from jsonb_array_elements(lg.dropped_aliases) x
  on conflict (id) do update set applicant_id = excluded.applicant_id;

  update public.recruit_merge_log set undone_at = now(), undone_by = who where id = lg.id;
  return jsonb_build_object('log_id', lg.id, 'kept', lg.kept_id, 'back', lg.dropped_id);
end $$;

create or replace function public.recruit_not_same_set(p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_a is null or p_b is null or p_a = p_b then raise exception 'two different people are needed'; end if;
  insert into public.recruit_not_same (a, b, marked_by) values (least(p_a, p_b), greatest(p_a, p_b), who) on conflict do nothing;
end $$;

-- Pairs a person should look at. reasons: same_email, same_whatsapp (the machine did not merge them: names differ or a stage rule), same_name, instagram,
-- close_name, same_email_name, close_email, same_last_digits. Pairs marked not the same are left out.
create or replace function public.recruit_dup_suggestions() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare who text := public.recruit_guard(); res jsonb;
begin
  with b as (
    select a.id, public.recruit_name_key(a.name) nk, public.recruit_norm_email(a.email) ne,
           split_part(coalesce(public.recruit_norm_email(a.email), ''), '@', 1) lp, split_part(coalesce(public.recruit_norm_email(a.email), ''), '@', 2) dom,
           public.recruit_norm_wa(a.whatsapp) wa,
           case when length(regexp_replace(coalesce(a.whatsapp, ''), '\D', '', 'g')) >= 9 then right(regexp_replace(a.whatsapp, '\D', '', 'g'), 9) end w9,
           nullif(lower(regexp_replace(regexp_replace(coalesce(a.ig_handle, ''), '^.*instagram\.com/', '', 'i'), '[@/?\s].*$|^@', '', 'g')), '') ig
      from public.recruit_applicants a),
  hits as (
    select x.id a, y.id b, 'same_email' r from b x join b y on x.id < y.id and x.ne is not null and x.ne = y.ne
    union all select x.id, y.id, 'same_whatsapp' from b x join b y on x.id < y.id and x.wa is not null and x.wa = y.wa
    union all select x.id, y.id, 'instagram' from b x join b y on x.id < y.id and x.ig is not null and x.ig = y.ig
    union all select x.id, y.id, 'same_name' from b x join b y on x.id < y.id and x.nk like '% %' and x.nk = y.nk
    union all select x.id, y.id, 'close_name' from b x join b y on x.id < y.id and x.nk like '% %' and y.nk like '% %' and x.nk <> y.nk
                and length(x.nk) >= 8 and abs(length(x.nk) - length(y.nk)) <= 2 and levenshtein(left(x.nk, 60), left(y.nk, 60)) <= 2
    union all select x.id, y.id, 'same_email_name' from b x join b y on x.id < y.id and length(x.lp) >= 6 and x.lp = y.lp and x.dom <> y.dom
    union all select x.id, y.id, 'close_email' from b x join b y on x.id < y.id and x.dom = y.dom and x.dom <> '' and x.lp <> y.lp
                and length(x.lp) >= 6 and length(y.lp) >= 6 and levenshtein(left(x.lp, 60), left(y.lp, 60)) <= 2
    union all select x.id, y.id, 'same_last_digits' from b x join b y on x.id < y.id and x.w9 is not null and x.w9 = y.w9 and x.wa is distinct from y.wa),
  grp as (
    select h.a, h.b, array_agg(distinct h.r order by h.r) reasons from hits h
     where not exists (select 1 from public.recruit_not_same n where n.a = h.a and n.b = h.b)
     group by h.a, h.b)
  select coalesce(jsonb_agg(jsonb_build_object('a', g.a, 'b', g.b, 'reasons', to_jsonb(g.reasons), 'a_stage', xa.stage, 'b_stage', xb.stage,
                                               'blocked', (xa.stage = 'hired' and xb.stage in ('not_now', 'rejected')) or (xb.stage = 'hired' and xa.stage in ('not_now', 'rejected'))
                                                          or (xa.stage in ('not_now', 'rejected') and public.recruit_stage_rank(xb.stage) >= 1)
                                                          or (xb.stage in ('not_now', 'rejected') and public.recruit_stage_rank(xa.stage) >= 1))
                                 order by cardinality(g.reasons) desc, g.a), '[]'::jsonb)
    into res
    from grp g join public.recruit_applicants xa on xa.id = g.a join public.recruit_applicants xb on xb.id = g.b;
  return jsonb_build_object('count', jsonb_array_length(res), 'pairs', res);
end $$;

-- Every email and number each person has used, as they wrote them (for the details view).
create or replace function public.recruit_person_aliases(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '[]'::jsonb; end if;
  if cardinality(p_ids) > 500 then raise exception 'too many at once'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.applicant_id,
            'emails', (select coalesce(jsonb_agg(x.raw order by x.created_at), '[]'::jsonb) from public.recruit_aliases x where x.applicant_id = a.applicant_id and x.kind = 'email'),
            'whatsapps', (select coalesce(jsonb_agg(x.raw order by x.created_at), '[]'::jsonb) from public.recruit_aliases x where x.applicant_id = a.applicant_id and x.kind = 'wa')))
          from (select distinct applicant_id from public.recruit_aliases where applicant_id = any (p_ids)) a), '[]'::jsonb);
end $$;

create or replace function public.recruit_merge_history() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('log_id', l.id, 'kept_id', l.kept_id, 'kept_name', l.kept_before->>'name', 'dropped_name', l.dropped_row->>'name',
            'rule', l.rule, 'merged_by', l.merged_by, 'merged_at', l.merged_at, 'undone_at', l.undone_at) order by l.merged_at desc)
          from (select * from public.recruit_merge_log order by merged_at desc limit 100) l), '[]'::jsonb);
end $$;

-- 6. the import: the same contract as before (kinds application, reply, human_reply, bounce), now through the aliases ------------------------------------

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
            cv_link = case when prefer_new then coalesce(i_cv, ex.cv_link) else coalesce(ex.cv_link, i_cv) end,
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

-- 7. one consolidation pass over today's people (idempotent: a second run finds nothing) ---------------------------------------------------------------
-- strong keys only: the same cleaned email, or the same international WhatsApp number with agreeing names. The older card stays.
do $$
declare pr record; n_email int := 0; n_wa int := 0; n_skipped int := 0; lid uuid;
begin
  create temporary table if not exists _recruit_skip (a uuid, b uuid) on commit drop;
  loop
    select x.id keep_id, y.id drop_id,
           case when public.recruit_norm_email(x.email) is not null and public.recruit_norm_email(x.email) = public.recruit_norm_email(y.email) then 'auto_email' else 'auto_whatsapp' end rule
      into pr
      from public.recruit_applicants x join public.recruit_applicants y
        on (x.applied_at < y.applied_at or (x.applied_at = y.applied_at and x.id < y.id))
       and ((public.recruit_norm_email(x.email) is not null and public.recruit_norm_email(x.email) = public.recruit_norm_email(y.email))
         or (public.recruit_norm_wa(x.whatsapp) is not null and public.recruit_norm_wa(x.whatsapp) = public.recruit_norm_wa(y.whatsapp)
             and public.recruit_name_compatible(x.name, y.name)))
     where not exists (select 1 from _recruit_skip s where s.a = x.id and s.b = y.id)
     order by x.applied_at, x.id, y.applied_at, y.id limit 1;
    exit when pr.keep_id is null;
    begin
      lid := public.recruit_do_merge(pr.keep_id, pr.drop_id, pr.rule, 'migration recruitment_dedupe');
      if pr.rule = 'auto_email' then n_email := n_email + 1; else n_wa := n_wa + 1; end if;
    exception when others then
      insert into _recruit_skip values (pr.keep_id, pr.drop_id); n_skipped := n_skipped + 1;
    end;
  end loop;
  raise notice 'recruit consolidation: % by email, % by whatsapp, % skipped by a stage rule', n_email, n_wa, n_skipped;
end $$;

-- every remaining person's email and number become aliases (people merged above already have theirs)
insert into public.recruit_aliases (applicant_id, kind, value, raw)
select id, 'email', public.recruit_norm_email(email), lower(btrim(email)) from public.recruit_applicants where public.recruit_norm_email(email) is not null
on conflict do nothing;
insert into public.recruit_aliases (applicant_id, kind, value, raw)
select id, 'wa', public.recruit_norm_wa(whatsapp), btrim(whatsapp) from public.recruit_applicants where public.recruit_norm_wa(whatsapp) is not null
on conflict do nothing;

-- 8. who may call what -----------------------------------------------------------------------------------------------------------------------------
revoke all on function public.recruit_norm_email(text) from public, anon, authenticated;
revoke all on function public.recruit_norm_wa(text) from public, anon, authenticated;
revoke all on function public.recruit_name_key(text) from public, anon, authenticated;
revoke all on function public.recruit_name_compatible(text, text) from public, anon, authenticated;
revoke all on function public.recruit_stage_rank(text) from public, anon, authenticated;
revoke all on function public.recruit_alias_add(uuid, text, text) from public, anon, authenticated;
revoke all on function public.recruit_apply_signal(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.recruit_do_merge(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.recruit_merge_people(uuid, uuid) from public, anon;
revoke all on function public.recruit_unmerge(uuid) from public, anon;
revoke all on function public.recruit_not_same_set(uuid, uuid) from public, anon;
revoke all on function public.recruit_dup_suggestions() from public, anon;
revoke all on function public.recruit_person_aliases(uuid[]) from public, anon;
revoke all on function public.recruit_merge_history() from public, anon;
revoke all on function public.recruit_import(uuid, jsonb, boolean) from public, authenticated;
grant execute on function public.recruit_merge_people(uuid, uuid) to authenticated;
grant execute on function public.recruit_unmerge(uuid) to authenticated;
grant execute on function public.recruit_not_same_set(uuid, uuid) to authenticated;
grant execute on function public.recruit_dup_suggestions() to authenticated;
grant execute on function public.recruit_person_aliases(uuid[]) to authenticated;
grant execute on function public.recruit_merge_history() to authenticated;
grant execute on function public.recruit_import(uuid, jsonb, boolean) to anon;
