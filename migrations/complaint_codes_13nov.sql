-- Complaint codes (Kate, 13 Nov 2026). Part 1: table, helpers and the PLAN function (reads only, writes nothing).
-- Format:  C-<BRANCH>-<YYYYMMDD>-<II><NNNN>-<SEQ>      example  C-SAA-20261109-KA8412-001
--   BRANCH  branch code of the complaint, XX when there is none
--   YYYYMMDD the complaint date: complaint_date, else event_date, else the day the row was submitted, else the day it was created
--           (a chat candidate uses msg_date)
--   II      first letter of the first and of the last word of the client's name, letters only (a single word gives X as the 2nd)
--   NNNN    last 4 digits of the client's phone, 0000 when no phone can be found
--   SEQ     this client's Nth complaint, three digits, counted in complaint-date order when backfilled
-- Rules: a code is issued ONCE and never recomputed (a corrected date, a linked duplicate or a new phone does not change it).
-- Old CMP- codes are kept as aliases in complaint_codes.old_code and still resolve in cmp_find and in search.
-- Client key for counting: phone (last 9 digits) when known, else the Phorest id, else the normalised name.
-- Part 2 (complaint_codes_apply_13nov.sql) backfills, adds the triggers and patches the functions that read code.
-- No names or numbers in this file.

create table if not exists public.complaint_codes (
  code text primary key,
  client_key text not null,
  seq int not null,
  complaint_id bigint,
  candidate_id bigint,
  old_code text,
  branch text,
  cdate date,
  date_source text,
  issued_at timestamptz not null default now(),
  constraint complaint_codes_one_target check ((complaint_id is null) <> (candidate_id is null))
);
create unique index if not exists complaint_codes_complaint_u on public.complaint_codes(complaint_id) where complaint_id is not null;
create unique index if not exists complaint_codes_candidate_u on public.complaint_codes(candidate_id) where candidate_id is not null;
create index if not exists complaint_codes_key_i on public.complaint_codes(client_key);
create index if not exists complaint_codes_old_i on public.complaint_codes(old_code) where old_code is not null;
alter table public.complaint_codes enable row level security;
revoke all on public.complaint_codes from anon, authenticated;

alter table public.complaint_candidates add column if not exists code text;
create unique index if not exists complaint_candidates_code_u on public.complaint_candidates(code) where code is not null;

-- letters-only initials: first letter of the first and of the last word; one word gives X as the second letter
create or replace function public.cmp_initials(p_name text) returns text
language sql immutable set search_path = '' as $$
  with w as (
    select ord, regexp_replace(translate(lower(x), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), '[^a-z]', '', 'g') as t
    from unnest(regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+')) with ordinality as u(x, ord)
  ), z as (select t, ord from w where t <> '')
  select case
    when (select count(*) from z) = 0 then 'XX'
    when (select count(*) from z) = 1 then upper(left((select t from z), 1)) || 'X'
    else upper(left((select t from z order by ord limit 1), 1)) || upper(left((select t from z order by ord desc limit 1), 1)) end
$$;

create or replace function public.cmp_last4(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select case when length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 4
              then right(regexp_replace(p_phone, '\D', '', 'g'), 4) else '0000' end
$$;

create or replace function public.cmp_client_key(p_phone text, p_phorest_id text, p_name text) returns text
language sql immutable set search_path = '' as $$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 7 then 'p:' || right(regexp_replace(p_phone, '\D', '', 'g'), 9)
    when coalesce(p_phorest_id, '') <> '' and p_phorest_id not like 'manual:%' then 'i:' || p_phorest_id
    else 'n:' || lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')) end
$$;

create or replace function public.cmp_code_text(p_branch text, p_date date, p_name text, p_phone text, p_seq int) returns text
language sql immutable set search_path = '' as $$
  select 'C-' || coalesce(nullif(btrim(p_branch), ''), 'XX') || '-' || to_char(p_date, 'YYYYMMDD') || '-'
         || public.cmp_initials(p_name) || public.cmp_last4(p_phone) || '-' || lpad(p_seq::text, 3, '0')
$$;

-- the phone of a client_complaints row: the latest Phorest mobile for its client, else the phone typed on the form
create or replace function public.cmp_phone_of(p_phorest_id text, p_client_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select e.mobile_norm from public.phorest_client_emails e
      where e.phorest_id = p_phorest_id and e.mobile_norm is not null and e.mobile_norm <> ''
      order by e.pulled_at desc nulls last limit 1),
    nullif(btrim(coalesce(p_client_phone, '')), ''))
$$;

-- PLAN: what every row would get. Reads only. One row per complaint or confirmed chat candidate that has no code in complaint_codes yet.
-- Order inside one client: complaint date, then id, so the first complaint is -001.
create or replace function public.complaint_codes_plan()
returns table(kind text, id bigint, branch text, cdate date, date_source text, client_key text, phone_found boolean, seq int, new_code text, old_code text)
language sql stable security definer set search_path = '' as $$
  with src as (
    select 'cc'::text as kind, c.id, coalesce(nullif(btrim(c.branch_code), ''), 'XX') as branch,
           coalesce(c.complaint_date, c.event_date, (c.submitted_at at time zone 'Asia/Dubai')::date, (c.created_at at time zone 'Asia/Dubai')::date) as d,
           case when c.complaint_date is not null then 'complaint_date' when c.event_date is not null then 'event_date'
                when c.submitted_at is not null then 'submitted' else 'created' end as ds,
           c.client_name as nm, public.cmp_phone_of(c.phorest_id, c.client_phone) as ph, c.phorest_id as pid,
           (select cc.code from public.client_complaints cc where cc.id = c.id and cc.code like 'CMP-%') as oldc
    from public.client_complaints c
    where (c.is_complaint or c.submitted_at is not null) and c.duplicate_of is null
      and not exists (select 1 from public.complaint_codes k where k.complaint_id = c.id)
    union all
    select 'cand', x.id, coalesce(nullif(btrim(x.branch_code), ''), 'XX'),
           coalesce(x.msg_date, (x.decided_at at time zone 'Asia/Dubai')::date, (x.created_at at time zone 'Asia/Dubai')::date),
           case when x.msg_date is not null then 'msg_date' else 'decided' end,
           x.client_name, nullif(btrim(coalesce(x.phone, '')), ''), x.phorest_id, null
    from public.complaint_candidates x
    where x.status = 'confirmed' and x.code is null
      and not exists (select 1 from public.complaint_codes k where k.candidate_id = x.id)
  ), keyed as (
    select s.*, public.cmp_client_key(s.ph, s.pid, s.nm) as k from src s
  ), base as (
    -- what the client already holds (issued before this run), so a later plan continues the count
    select k.client_key, max(k.seq) as mx from public.complaint_codes k group by 1
  )
  select kd.kind, kd.id, kd.branch, kd.d, kd.ds, kd.k,
         kd.ph is not null,
         coalesce(b.mx, 0) + row_number() over (partition by kd.k order by kd.d, kd.kind, kd.id)::int as seq,
         public.cmp_code_text(kd.branch, kd.d, kd.nm, kd.ph, coalesce(b.mx, 0) + row_number() over (partition by kd.k order by kd.d, kd.kind, kd.id)::int),
         kd.oldc
  from keyed kd left join base b on b.client_key = kd.k
$$;
revoke all on function public.complaint_codes_plan() from public, anon, authenticated;
revoke all on function public.cmp_phone_of(text, text) from public, anon, authenticated;
