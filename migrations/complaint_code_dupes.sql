-- Complaint triage, batch 2, steps 1 and 2 (Kate, 29 Oct 2026).
--
-- 1. Complaint code  CMP-<BRANCH>-<YYYYMMDD>-<NN>, for example CMP-SAA-20261029-01. Branch as it was when the complaint was logged, the date is the
--    Dubai day it was logged, NN is a running number per branch per day that starts again at 01. Only complaints logged on the form get one (the
--    Phorest-note ones do not). A trigger gives it on insert and keeps it for life, so a branch corrected later does not change the code.
--    The counter row is locked by the upsert, so two complaints logged in the same second cannot get the same number.
-- 2. Duplicate check by mobile number as well as by name (last 9 digits, so +971 50... and 050... are the same). A match shows its code and who
--    holds it. A record can be linked as a duplicate of another: it stays on file, is not counted twice and drops out of the pipeline.
--
-- Run after complaint_triage.sql. Additive; the old 3 argument cq_dupes and client_complaint_dupes are replaced by versions with an optional phone.

alter table public.client_complaints
  add column if not exists code text,
  add column if not exists duplicate_of bigint references public.client_complaints(id) on delete set null,
  add column if not exists duplicate_by text,
  add column if not exists duplicate_at timestamptz;
create unique index if not exists client_complaints_code_u on public.client_complaints (code) where code is not null;
create index if not exists client_complaints_dupof on public.client_complaints (duplicate_of) where duplicate_of is not null;
create index if not exists client_complaints_phone9 on public.client_complaints (right(regexp_replace(client_phone, '\D', '', 'g'), 9)) where client_phone is not null;

-- short names the triage and the pickers show ("Coach Emma", not "Emma Usher (Coach Emma)")
alter table public.complaint_notify_recipients add column if not exists short_name text;
update public.complaint_notify_recipients set short_name = case lower(email)
    when 'ashleighfairgrieve@hotmail.com' then 'Ashleigh' when 'kate@tararosesalon.com' then 'Kate' when 'haxthausen.partners@gmail.com' then 'Mette'
    when 'emmawilliamson2107@gmail.com' then 'Emma W' when 'emmalouise@tararosesalon.com' then 'Coach Emma' when 'jho.tararose@gmail.com' then 'Jho'
    when 'cristine.tararose@gmail.com' then 'Cristine' when 'shiela.tararose@gmail.com' then 'Shiela' when 'frances.tararose@gmail.com' then 'Frances'
    when 'monashona030@gmail.com' then 'Mona' end
 where short_name is null;

-- ---------------------------------------------------------------- the code
create table if not exists public.complaint_code_counter (
  branch text not null, day date not null, n int not null default 0, primary key (branch, day));
alter table public.complaint_code_counter enable row level security;

create or replace function public.cmp_assign_code() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b text; d date; k int;
begin
  if new.submitted_at is not null and new.code is null then
    b := coalesce(nullif(new.branch_code, ''), 'XX');
    d := (new.submitted_at at time zone 'Asia/Dubai')::date;
    insert into public.complaint_code_counter as cc (branch, day, n) values (b, d, 1)
      on conflict (branch, day) do update set n = cc.n + 1 returning n into k;
    new.code := 'CMP-' || b || '-' || to_char(d, 'YYYYMMDD') || '-' || lpad(k::text, 2, '0');
  end if;
  return new;
end $$;
revoke all on function public.cmp_assign_code() from public, anon, authenticated;

drop trigger if exists client_complaints_code_trg on public.client_complaints;
create trigger client_complaints_code_trg before insert on public.client_complaints
  for each row execute function public.cmp_assign_code();

-- the logged complaints that exist already, in the order they were logged
do $b$
declare r record; k int;
begin
  for r in select id, coalesce(nullif(branch_code, ''), 'XX') b, (submitted_at at time zone 'Asia/Dubai')::date d
             from public.client_complaints where submitted_at is not null and code is null order by submitted_at, id loop
    insert into public.complaint_code_counter as cc (branch, day, n) values (r.b, r.d, 1)
      on conflict (branch, day) do update set n = cc.n + 1 returning n into k;
    update public.client_complaints set code = 'CMP-' || r.b || '-' || to_char(r.d, 'YYYYMMDD') || '-' || lpad(k::text, 2, '0') where id = r.id;
  end loop;
end $b$;

-- a code, or a part of one ("SAA 20261029" is not enough, "saa-20261029-01" is), or the plain id, to the complaint id
create or replace function public.cmp_find(p_code text) returns bigint
language sql stable security definer set search_path = '' as $$
  select c.id from public.client_complaints c
   where c.code is not null
     and regexp_replace(upper(c.code), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g')
$$;
revoke all on function public.cmp_find(text) from public, anon;

-- ---------------------------------------------------------------- who holds a complaint
create or replace function public.cmp_rname(p_id bigint) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(short_name, name) from public.complaint_notify_recipients where id = p_id
$$;

create or replace function public.cmp_me_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select coalesce(r.short_name, r.name) from public.complaint_notify_recipients r where lower(r.email) = lower(coalesce(public.kb_me_email(), '#none')) limit 1),
    (select s.name from public.kb_staff s where lower(s.email) = lower(coalesce(public.kb_me_email(), '#none')) limit 1),
    public.kb_me_email())
$$;

-- "taken by Ashleigh", "waiting for Emma W", "stuck, nobody has taken it": in words, for the duplicate box and the list
create or replace function public.cmp_holder(p_id bigint) returns text
language plpgsql stable security definer set search_path = '' as $$
declare t record; br text; nm text;
begin
  select * into t from public.complaint_triage where complaint_id = p_id;
  if not found then return null; end if;
  select branch_code into br from public.client_complaints where id = p_id;
  if t.state = 'claimed' then return 'taken by ' || coalesce(public.cmp_rname(t.claimed_by), 'someone'); end if;
  if t.state = 'active' then
    select string_agg(public.cmp_rname(r.recipient_id), ' and ' order by r.recipient_id) into nm from public.complaint_triage_routes r
     where r.grp = t.grp and r.step = t.step and (r.branch_code is null or r.branch_code = br);
    return 'waiting for ' || coalesce(nm, 'someone');
  end if;
  if t.state = 'stuck' then return 'stuck, nobody has taken it'; end if;
  if t.state = 'minor' then return 'in the daily summary'; end if;
  return 'closed';
end $$;

-- the person it is with right now (took it, or it is their turn on the chain)
create or replace function public.cmp_holds(p_id bigint) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare t record; br text; me bigint[] := public.cmp_my_ids();
begin
  select * into t from public.complaint_triage where complaint_id = p_id;
  if not found then return false; end if;
  select branch_code into br from public.client_complaints where id = p_id;
  if t.state = 'claimed' then return t.claimed_by is not null and t.claimed_by = any (me); end if;
  if t.state = 'active' then
    return exists (select 1 from public.complaint_triage_routes r where r.grp = t.grp and r.step = t.step and r.recipient_id = any (me)
                     and (r.branch_code is null or r.branch_code = br));
  end if;
  return false;
end $$;

-- who may assign, and link a duplicate: leadership, the branch coordinator and whoever has it now
create or replace function public.cmp_manage(p_id bigint) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare br text;
begin
  select branch_code into br from public.client_complaints where id = p_id;
  if not found then return false; end if;
  return public.cmp_leader() or public.cmp_coord(br) or public.cmp_holds(p_id);
end $$;
revoke all on function public.cmp_rname(bigint), public.cmp_me_name(), public.cmp_holder(bigint), public.cmp_holds(bigint), public.cmp_manage(bigint) from public, anon;
grant execute on function public.cmp_rname(bigint), public.cmp_me_name(), public.cmp_holder(bigint), public.cmp_holds(bigint), public.cmp_manage(bigint) to authenticated;

-- ---------------------------------------------------------------- duplicate check, by name and by mobile number
drop function if exists public.client_complaint_dupes(text, text, date);
drop function if exists public.cq_dupes(text, text, date);

create or replace function public.cq_dupes(p_name text, p_branch text, p_date date, p_phone text default null)
returns table(id bigint, event_date date, branch_code text, complaint_type text, status text, submitted_by text, src_logged boolean, exact boolean,
              code text, holder text, by_phone boolean)
language sql stable security definer set search_path = '' as $$
  with n as (select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g')) as nm,
                    right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9) as ph),
  c as (
    select k.id, k.event_date, k.branch_code, k.complaint_type, k.status, k.submitted_by, (k.submitted_at is not null) as logged, k.code,
           lower(regexp_replace(trim(coalesce(k.client_name, '')), '\s+', ' ', 'g')) as cn,
           right(regexp_replace(coalesce(k.client_phone, ''), '\D', '', 'g'), 9) as cp
    from public.client_complaints k
    where k.is_complaint and k.duplicate_of is null)
  select c.id, c.event_date, c.branch_code, c.complaint_type, c.status, c.submitted_by, c.logged,
         (length(c.cn) >= 3 and c.cn = n.nm and c.branch_code = p_branch and c.event_date = p_date) as exact,
         c.code, case when c.logged then public.cmp_holder(c.id) end,
         (length(n.ph) = 9 and c.cp = n.ph) as by_phone
  from c, n
  where (length(n.nm) >= 3 and length(c.cn) >= 3 and (
            (c.cn = n.nm and (c.event_date is null or p_date is null or abs(c.event_date - p_date) <= 30 or c.status = 'open'))
         or (n.nm like '% %' and c.cn like '% %'
             and split_part(c.cn, ' ', 1) = split_part(n.nm, ' ', 1)
             and reverse(split_part(reverse(c.cn), ' ', 1)) = reverse(split_part(reverse(n.nm), ' ', 1))
             and (c.event_date is null or p_date is null or abs(c.event_date - p_date) <= 14))))
     or (length(n.ph) = 9 and c.cp = n.ph and (c.event_date is null or p_date is null or abs(c.event_date - p_date) <= 30 or c.status = 'open'))
  order by 8 desc, 11 desc, c.event_date desc nulls last
  limit 6
$$;
revoke all on function public.cq_dupes(text, text, date, text) from public, anon, authenticated;

-- ", code CMP-SAA-20261029-01, waiting for Emma W" after the usual sentence
create or replace function public.cq_dupe_tail(p_code text, p_holder text, p_phone boolean default false) returns text
language sql immutable set search_path = '' as $$
  select case when p_phone then ', same mobile number' else '' end
      || case when p_code is not null then ', code ' || p_code else '' end
      || case when p_holder is not null then ', ' || p_holder else '' end
$$;

create or replace function public.client_complaint_dupes(p_name text, p_branch text, p_date date, p_phone text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me record;
begin
  select * into me from public.dashboard_me() limit 1;
  if me.level is null or me.level < 2 or me.scope is not null then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'exact', d.exact, 'code', d.code, 'holder', d.holder, 'by_phone', d.by_phone,
            'text', public.cq_dupe_text(d.event_date, d.branch_code, d.src_logged, d.submitted_by, d.status))
            order by d.exact desc, d.by_phone desc, d.event_date desc nulls last)
          from public.cq_dupes(p_name, p_branch, p_date, p_phone) d), '[]'::jsonb);
end $$;
revoke all on function public.client_complaint_dupes(text, text, date, text) from public, anon;
grant execute on function public.client_complaint_dupes(text, text, date, text) to authenticated;

-- ---------------------------------------------------------------- link and unlink a duplicate
create or replace function public.cmp_link_duplicate(p_id bigint, p_of text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c record; root bigint; rc record; me text := lower(coalesce(public.kb_me_email(), '#none')); nm text := public.cmp_me_name();
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  select * into c from public.client_complaints where id = p_id and submitted_at is not null;
  if not found then return jsonb_build_object('ok', false, 'why', 'only a complaint logged on the form can be linked'); end if;
  if not (public.cmp_manage(p_id) or lower(coalesce(c.submitted_email, '')) = me) then
    return jsonb_build_object('ok', false, 'why', 'only the person who logged it, the coordinator, whoever has it or leadership can link it');
  end if;
  root := public.cmp_find(p_of);
  if root is null then return jsonb_build_object('ok', false, 'why', 'there is no complaint with that code'); end if;
  select coalesce(duplicate_of, id) into root from public.client_complaints where id = root;   -- always point at the first one
  if root = p_id then return jsonb_build_object('ok', false, 'why', 'a complaint cannot be a duplicate of itself'); end if;
  if not public.cmp_can(root) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  select * into rc from public.client_complaints where id = root;
  update public.client_complaints set duplicate_of = root, duplicate_by = nm, duplicate_at = now() where id = p_id;
  update public.client_complaints set duplicate_of = root where duplicate_of = p_id;
  update public.complaint_triage set state = 'done', due_at = null where complaint_id = p_id and state in ('active', 'stuck');
  insert into public.client_complaint_updates (complaint_id, by_name, by_email, note, status)
    values (p_id, nm, me, 'Linked as a duplicate of ' || coalesce(rc.code, 'another complaint') || '. It stays on file and is not counted twice.', 'note');
  insert into public.complaint_triage_events (complaint_id, kind, by_email, detail) values (p_id, 'duplicate', me, 'of ' || coalesce(rc.code, root::text));
  return jsonb_build_object('ok', true, 'of', rc.code);
end $$;

create or replace function public.cmp_unlink_duplicate(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c record; me text := lower(coalesce(public.kb_me_email(), '#none')); nm text := public.cmp_me_name();
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  select * into c from public.client_complaints where id = p_id and duplicate_of is not null;
  if not found then return jsonb_build_object('ok', false, 'why', 'it is not linked as a duplicate'); end if;
  if not (public.cmp_manage(p_id) or lower(coalesce(c.submitted_email, '')) = me) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  update public.client_complaints set duplicate_of = null, duplicate_by = null, duplicate_at = null where id = p_id;
  -- it was switched off while linked: back to someone who took it, or to "stuck" so a person has to look at it
  update public.complaint_triage set state = case when claimed_by is not null then 'claimed' when grp = 'minor' then 'minor' else 'stuck' end, due_at = null
   where complaint_id = p_id and state = 'done';
  insert into public.client_complaint_updates (complaint_id, by_name, by_email, note, status)
    values (p_id, nm, me, 'No longer linked as a duplicate.', 'note');
  insert into public.complaint_triage_events (complaint_id, kind, by_email, detail) values (p_id, 'unduplicate', me, null);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.cmp_link_duplicate(bigint, text), public.cmp_unlink_duplicate(bigint) from public, anon;
grant execute on function public.cmp_link_duplicate(bigint, text), public.cmp_unlink_duplicate(bigint) to authenticated;

-- ---------------------------------------------------------------- patch the live functions (take the live definition, change it, keep the rest)
do $m$
declare
  d text;
begin
  -- the form: duplicate check with the mobile number, and the code and holder in the messages
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'client_complaint_submit' and pronamespace = 'public'::regnamespace;
  if position('cq_dupes(nm, p_branch, p_date, ph)' in d) = 0 then
    d := replace(d, 'public.cq_dupes(nm, p_branch, p_date)', 'public.cq_dupes(nm, p_branch, p_date, ph)');
    d := replace(d, 'public.cq_dupe_text(x.event_date, x.branch_code, x.src_logged, x.submitted_by, x.status)',
                    'public.cq_dupe_text(x.event_date, x.branch_code, x.src_logged, x.submitted_by, x.status) || public.cq_dupe_tail(x.code, x.holder, x.by_phone)');
    d := replace(d, E'  perform pg_advisory_xact_lock(hashtext(''cq:'' || lower(nm)));\n',
                    E'  perform pg_advisory_xact_lock(hashtext(''cq:'' || lower(nm)));\n  perform pg_advisory_xact_lock(hashtext(''cqp:'' || right(regexp_replace(ph, ''\\D'', '''', ''g''), 9)));\n');
    if position('cq_dupes(nm, p_branch, p_date, ph)' in d) = 0 or position('cq_dupe_tail' in d) = 0 or position('cqp:' in d) = 0 then
      raise exception 'client_complaint_submit changed shape, edit by hand';
    end if;
    execute d;
  end if;

  -- the list: the code, who holds it, duplicates (no flag), and the search finds a code or a part of one
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'client_complaints_list' and pronamespace = 'public'::regnamespace;
  if position('qc text' in d) = 0 then
    d := replace(d, E'  today date := public.cq_today();\n', E'  today date := public.cq_today();\n  qc text := regexp_replace(lower(coalesce(p_q, '''')), ''[^a-z0-9]'', '''', ''g'');\n');
    d := replace(d, 'case when c.submitted_at is not null then public.cq_flag(', 'case when c.submitted_at is not null and c.duplicate_of is null then public.cq_flag(');
    d := replace(d, E'like ''%'' || qd || ''%''))\n', E'like ''%'' || qd || ''%'')\n           or (length(qc) >= 4 and regexp_replace(lower(coalesce(h.code, '''')), ''[^a-z0-9]'', '''', ''g'') like ''%'' || qc || ''%''))\n');
    d := replace(d, '''id'', p.id, ''src'', p.src,',
      '''id'', p.id, ''code'', p.code, ''duplicate_of'', p.duplicate_of, ''duplicate_code'', (select dd.code from public.client_complaints dd where dd.id = p.duplicate_of), ''holder'', case when p.submitted_at is not null and p.duplicate_of is null then public.cmp_holder(p.id) end, ''src'', p.src,');
    if position('qc text' in d) = 0 or position('cq_flag(' in d) = 0 or position('length(qc) >= 4' in d) = 0 or position('''duplicate_code''' in d) = 0
       or position('c.duplicate_of is null then public.cq_flag' in d) = 0 then
      raise exception 'client_complaints_list changed shape, edit by hand';
    end if;
    execute d;
  end if;

  -- the strip at the top and the summary: a duplicate is not counted twice
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'client_complaint_flags' and pronamespace = 'public'::regnamespace;
  if position('duplicate_of' in d) = 0 then
    d := replace(d, E'where c.is_complaint and c.submitted_at is not null\n', E'where c.is_complaint and c.submitted_at is not null and c.duplicate_of is null\n');
    if position('duplicate_of' in d) = 0 then raise exception 'client_complaint_flags changed shape, edit by hand'; end if;
    execute d;
  end if;
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'client_complaints_summary' and pronamespace = 'public'::regnamespace;
  if position('duplicate_of' in d) = 0 then
    d := replace(d, 'where is_complaint and src = ''visit'' and (b = ''all'' or branch_code = any(bs))', 'where is_complaint and src = ''visit'' and duplicate_of is null and (b = ''all'' or branch_code = any(bs))');
    d := replace(d, E'    where is_complaint and src = ''visit''\n      and (p_from is null or event_date >= p_from)', E'    where is_complaint and src = ''visit'' and duplicate_of is null\n      and (p_from is null or event_date >= p_from)');
    d := replace(d, 'oc.status = ''open'' and (b = ''all''', 'oc.status = ''open'' and oc.duplicate_of is null and (b = ''all''');
    if (length(d) - length(replace(d, 'duplicate_of', ''))) / length('duplicate_of') <> 3 then raise exception 'client_complaints_summary changed shape, edit by hand'; end if;
    execute d;
  end if;

  -- the responder page: the code, and a linked duplicate drops off My complaints
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'cmp_get' and pronamespace = 'public'::regnamespace;
  if position('''code''' in d) = 0 then
    d := replace(d, '''id'', c.id, ''branch'', c.branch_code,', '''id'', c.id, ''code'', c.code, ''duplicate_of'', c.duplicate_of, ''duplicate_code'', (select dd.code from public.client_complaints dd where dd.id = c.duplicate_of), ''branch'', c.branch_code,');
    if position('''code''' in d) = 0 then raise exception 'cmp_get changed shape, edit by hand'; end if;
    execute d;
  end if;
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'cmp_my_list' and pronamespace = 'public'::regnamespace;
  if position('''code''' in d) = 0 then
    d := replace(d, '''id'', c.id, ''branch'', c.branch_code,', '''id'', c.id, ''code'', c.code, ''branch'', c.branch_code,');
    d := replace(d, 'where c.submitted_at is not null and public.cmp_can(c.id)', 'where c.submitted_at is not null and c.duplicate_of is null and public.cmp_can(c.id)');
    if position('''code''' in d) = 0 or position('c.duplicate_of is null' in d) = 0 then raise exception 'cmp_my_list changed shape, edit by hand'; end if;
    execute d;
  end if;
end
$m$;
