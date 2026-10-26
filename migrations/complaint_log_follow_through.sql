-- Log a Client Complaint, follow-through (Kate, 26 Oct 2026, from Belle's review of the page). Run after client_complaints.sql and
-- client_complaints_tracking.sql. Additive: new columns, a files table and a private storage bucket, and the submit, update and list functions
-- replaced by versions that take the same arguments plus new ones with defaults, so the page that is live today keeps working until the new one ships.
--
--   Mobile number         client_phone, searchable from the page's search box (digits only, 4 or more).
--   Dates, separately     event_date stays "date of the appointment"; complaint_date is the day the client complained (what reception wrote in Phorest);
--                         resolved_at is the date resolved; resolution is the outcome.
--   Reply in 2 days, close in 7 (Belle): measured from the date of the complaint, in Dubai time. An open complaint with no reply by the end of day 2
--                         or not closed by the end of day 7 is "overdue"; every other open one is "pending". first_response_at is set by the update
--                         "Client contacted, solution offered" (or by closing it).
--   Why pending, who is responsible: pending_reason and responsible, written with any update and shown in the list.
--   Colour revisit (Belle): a colour complaint is not closed on a promise, only once she has come back. Closing it as a redo, fixed, talked through,
--                         credit, free item or escalated needs the revisit date, whether she was happy and what the stylist did.
--   Files (Belle): screenshots of the conversation and photos, in the private bucket complaint-files (images, PDF, text; 10 MB each; 10 per complaint).

alter table public.client_complaints
  add column if not exists client_phone text,
  add column if not exists complaint_date date,
  add column if not exists responsible text,
  add column if not exists pending_reason text,
  add column if not exists first_response_at timestamptz,
  add column if not exists revisit_date date,
  add column if not exists revisit_happy text,
  add column if not exists revisit_note text;

alter table public.client_complaint_updates
  add column if not exists responsible text,
  add column if not exists pending_reason text;

-- ── files ──
create table if not exists public.client_complaint_files (
  id bigserial primary key,
  complaint_id bigint not null references public.client_complaints(id) on delete cascade,
  path text not null unique,
  name text not null,
  size_bytes bigint,
  mime text,
  by_name text, by_email text,
  at timestamptz not null default now());
alter table public.client_complaint_files enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where tablename = 'client_complaint_files' and policyname = 'owner_read') then
    create policy owner_read on public.client_complaint_files for select to authenticated using ((select public.is_dashboard_owner()));
  end if;
end $p$;
create index if not exists client_complaint_files_cid on public.client_complaint_files (complaint_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-files', 'complaint-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf', 'text/plain'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.cq_can_files() returns boolean
language sql stable security definer set search_path to ''
as $$ select exists (select 1 from public.dashboard_me() m where m.level >= 2 and m.scope is null) $$;
revoke all on function public.cq_can_files() from public, anon;
grant execute on function public.cq_can_files() to authenticated;

drop policy if exists cq_files_read on storage.objects;
create policy cq_files_read on storage.objects for select to authenticated
  using (bucket_id = 'complaint-files' and public.cq_can_files());
drop policy if exists cq_files_add on storage.objects;
create policy cq_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-files' and public.cq_can_files());
drop policy if exists cq_files_del on storage.objects;
create policy cq_files_del on storage.objects for delete to authenticated
  using (bucket_id = 'complaint-files' and public.cq_can_files() and owner = (select auth.uid()));

-- ── helpers ──
-- The Dubai day, because the Supabase clock is UTC and the salons are four hours ahead.
create or replace function public.cq_today() returns date language sql stable set search_path to ''
as $$ select (now() at time zone 'Asia/Dubai')::date $$;

-- A colour complaint is closed by the revisit, not by the promise of one. These outcomes need it; a refund, a client who left and "no outcome
-- written" do not, because she is not coming back to be asked.
create or replace function public.cq_needs_revisit(p_type text, p_res text) returns boolean language sql immutable set search_path to ''
as $$ select p_type = 'colour_result' and p_res in ('free_redo', 'adjusted_same_visit', 'free_service_or_product', 'apology_or_explanation',
                                                    'discount_or_credit', 'escalated_followup') $$;

-- overdue: no reply by the end of day 2, or not closed by the end of day 7 (counted from the date of the complaint). pending: open and still inside both.
create or replace function public.cq_flag(p_status text, p_cdate date, p_first timestamptz) returns text language sql stable set search_path to ''
as $$ select case when p_status is distinct from 'open' or p_cdate is null then null
                  when public.cq_today() > p_cdate + 7 or (p_first is null and public.cq_today() > p_cdate + 2) then 'overdue'
                  else 'pending' end $$;

-- ── submit ──
drop function if exists public.client_complaint_submit(text, text, date, text, text, text, text, text, text, text, text, boolean);
create or replace function public.client_complaint_submit(
  p_client text, p_branch text, p_date date, p_stylist text, p_service text, p_type text, p_detail text,
  p_resolution text, p_resolution_detail text, p_handled_by text, p_google_url text, p_force boolean default false,
  p_phone text default null, p_complaint_date date default null, p_responsible text default null)
returns bigint
language plpgsql security definer
set search_path to ''
as $function$
declare
  me record; nid bigint; nm text := regexp_replace(trim(coalesce(p_client, '')), '\s+', ' ', 'g');
  gu text := nullif(trim(coalesce(p_google_url, '')), '');
  rs text := nullif(trim(coalesce(p_resolution, '')), '');
  ph text := nullif(regexp_replace(trim(coalesce(p_phone, '')), '[^0-9+]', '', 'g'), '');
  cd date := coalesce(p_complaint_date, public.cq_today());
begin
  select * into me from public.dashboard_me() limit 1;
  if me.level is null or me.level < 2 or me.scope is not null then
    raise exception 'Logging a complaint is for Levels 2 and up';
  end if;
  if length(nm) < 3 then raise exception 'Write the client''s full name'; end if;
  if ph is not null and length(regexp_replace(ph, '\D', '', 'g')) not between 7 and 15 then raise exception 'Check the mobile number (7 to 15 digits)'; end if;
  if p_branch not in ('SAA', 'KCA', 'MC', 'AQ', 'BAH') then raise exception 'Pick the branch'; end if;
  if p_date is null or p_date > public.cq_today() or p_date < date '2016-01-01' then raise exception 'Pick the date of the appointment'; end if;
  if cd > public.cq_today() or cd < p_date then raise exception 'The date of the complaint cannot be before the appointment or in the future'; end if;
  if p_type not in ('colour_result', 'nail_service', 'treatment_result', 'cut_result', 'price_or_billing', 'booking_or_admin', 'wait_or_time',
                    'staff_attitude', 'skin_reaction_or_injury', 'facility_or_parking', 'product', 'other') then raise exception 'Pick what the complaint was about'; end if;
  if rs is not null and rs not in ('free_redo', 'refund', 'discount_or_credit', 'free_service_or_product', 'adjusted_same_visit', 'apology_or_explanation',
                          'escalated_followup', 'client_lost_or_cancelled', 'no_action_noted') then raise exception 'Pick how it was resolved'; end if;
  if public.cq_needs_revisit(p_type, rs) then
    raise exception 'A colour complaint is closed once she has come back and agreed. Log it as open, then add the revisit when she returns.';
  end if;
  if length(trim(coalesce(p_detail, ''))) < 10 then raise exception 'Write what happened (a sentence)'; end if;
  if gu is not null and gu !~* '^https?://' then raise exception 'The Google link must start with http'; end if;
  perform pg_advisory_xact_lock(hashtext('cq:' || lower(nm)));
  if exists (select 1 from public.cq_dupes(nm, p_branch, p_date) x where x.exact) then
    raise exception 'DUPLICATE: already on file: %. Open it and add a follow-up instead of logging it again.',
      (select string_agg(public.cq_dupe_text(x.event_date, x.branch_code, x.src_logged, x.submitted_by, x.status), '; ') from public.cq_dupes(nm, p_branch, p_date) x where x.exact);
  end if;
  if not coalesce(p_force, false) and exists (select 1 from public.cq_dupes(nm, p_branch, p_date)) then
    raise exception 'SIMILAR: %',
      (select string_agg(public.cq_dupe_text(x.event_date, x.branch_code, x.src_logged, x.submitted_by, x.status), '; ') from public.cq_dupes(nm, p_branch, p_date) x);
  end if;
  insert into public.client_complaints (src, ref, phorest_id, client_name, branch_code, event_date, stylists, services, note, regex_tier, reviewed,
      is_complaint, complaint_type, detail, resolution, resolution_detail, handled_by, confidence, submitted_by, submitted_email, submitted_at, google_url,
      status, resolved_at, client_phone, complaint_date, responsible, first_response_at)
  values ('visit', 'sub-' || gen_random_uuid()::text, 'manual:' || lower(nm), nm, p_branch, p_date, nullif(trim(coalesce(p_stylist, '')), ''),
      nullif(trim(coalesce(p_service, '')), ''), left(trim(p_detail), 4000), 'S', true, true, p_type, left(trim(p_detail), 300), rs,
      nullif(left(trim(coalesce(p_resolution_detail, '')), 300), ''), nullif(left(trim(coalesce(p_handled_by, '')), 80), ''), 'high',
      coalesce(me.name, 'Unknown'), (select lower(u.email) from auth.users u where u.id = auth.uid()), now(), gu,
      case when rs is null then 'open' else 'resolved' end, case when rs is null then null else now() end,
      ph, cd, nullif(left(trim(coalesce(p_responsible, '')), 80), ''), case when rs is null then null else now() end)
  returning id into nid;
  return nid;
end
$function$;
revoke all on function public.client_complaint_submit(text, text, date, text, text, text, text, text, text, text, text, boolean, text, date, text) from public, anon;
grant execute on function public.client_complaint_submit(text, text, date, text, text, text, text, text, text, text, text, boolean, text, date, text) to authenticated;

-- ── update ──
-- status: note, responded (the client was contacted or a solution offered: starts the 2 day clock off), resolved, open (reopen)
drop function if exists public.client_complaint_update(bigint, text, text, text);
create or replace function public.client_complaint_update(
  p_id bigint, p_note text, p_resolution text, p_status text,
  p_responsible text default null, p_pending_reason text default null,
  p_revisit_date date default null, p_revisit_happy text default null, p_revisit_note text default null)
returns boolean
language plpgsql security definer
set search_path to ''
as $function$
declare
  me record; cr public.client_complaints;
  em text := (select lower(u.email) from auth.users u where u.id = auth.uid());
  st text := coalesce(nullif(p_status, ''), 'note');
  nt text := left(trim(coalesce(p_note, '')), 1000);
  rs text := nullif(trim(coalesce(p_resolution, '')), '');
  rh text := nullif(trim(coalesce(p_revisit_happy, '')), '');
  rn text := nullif(left(trim(coalesce(p_revisit_note, '')), 400), '');
begin
  select * into me from public.dashboard_me() limit 1;
  if me.level is null or me.level < 2 or me.scope is not null then raise exception 'Not allowed'; end if;
  select * into cr from public.client_complaints where id = p_id and submitted_at is not null;
  if not found then raise exception 'That complaint cannot be updated here'; end if;
  if st not in ('note', 'responded', 'resolved', 'open') then raise exception 'Unknown status'; end if;
  if rs is not null and rs not in ('free_redo', 'refund', 'discount_or_credit', 'free_service_or_product', 'adjusted_same_visit', 'apology_or_explanation',
                          'escalated_followup', 'client_lost_or_cancelled', 'no_action_noted') then raise exception 'Pick how it was resolved'; end if;
  if st = 'resolved' and rs is null then raise exception 'Pick how it was resolved'; end if;
  if st <> 'resolved' and nt = '' then raise exception 'Write the update'; end if;
  if st = 'resolved' and public.cq_needs_revisit(cr.complaint_type, rs) then
    if p_revisit_date is null or p_revisit_date > public.cq_today() or p_revisit_date < cr.event_date
       or rh is null or rh not in ('yes', 'no', 'unsure') or rn is null or length(rn) < 3 then
      raise exception 'A colour complaint needs the revisit: the date she came back, whether she was happy and what the stylist did';
    end if;
  end if;
  insert into public.client_complaint_updates (complaint_id, by_name, by_email, note, resolution, status, responsible, pending_reason)
  values (p_id, coalesce(me.name, 'Unknown'), em, nt, case when st = 'resolved' then rs end, st,
          nullif(left(trim(coalesce(p_responsible, '')), 80), ''), nullif(left(trim(coalesce(p_pending_reason, '')), 300), ''));
  if p_responsible is not null then
    update public.client_complaints set responsible = nullif(left(trim(p_responsible), 80), '') where id = p_id;
  end if;
  if st = 'resolved' then
    update public.client_complaints set status = 'resolved', resolution = rs, resolved_at = now(), pending_reason = null,
      first_response_at = coalesce(first_response_at, now()),
      resolution_detail = coalesce(nullif(nt, ''), resolution_detail),
      revisit_date = case when public.cq_needs_revisit(cr.complaint_type, rs) then p_revisit_date else revisit_date end,
      revisit_happy = case when public.cq_needs_revisit(cr.complaint_type, rs) then rh else revisit_happy end,
      revisit_note = case when public.cq_needs_revisit(cr.complaint_type, rs) then rn else revisit_note end
      where id = p_id;
  elsif st = 'open' then
    update public.client_complaints set status = 'open', resolution = null, resolved_at = null where id = p_id;
  elsif st = 'responded' then
    update public.client_complaints set first_response_at = coalesce(first_response_at, now()) where id = p_id;
  end if;
  if st <> 'resolved' and p_pending_reason is not null then
    update public.client_complaints set pending_reason = nullif(left(trim(p_pending_reason), 300), '') where id = p_id;
  end if;
  return true;
end
$function$;
revoke all on function public.client_complaint_update(bigint, text, text, text, text, text, date, text, text) from public, anon;
grant execute on function public.client_complaint_update(bigint, text, text, text, text, text, date, text, text) to authenticated;

-- ── files: register what the page uploaded, and remove it ──
create or replace function public.client_complaint_add_file(p_id bigint, p_path text, p_name text, p_size bigint, p_mime text)
returns bigint
language plpgsql security definer
set search_path to ''
as $function$
declare me record; nid bigint; em text := (select lower(u.email) from auth.users u where u.id = auth.uid());
begin
  select * into me from public.dashboard_me() limit 1;
  if me.level is null or me.level < 2 or me.scope is not null then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.client_complaints where id = p_id and submitted_at is not null) then raise exception 'That complaint cannot take files'; end if;
  if p_path is null or p_path not like p_id::text || '/%' then raise exception 'Bad file path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'complaint-files' and o.name = p_path) then raise exception 'The file did not upload'; end if;
  if (select count(*) from public.client_complaint_files where complaint_id = p_id) >= 10 then raise exception 'A complaint can hold 10 files'; end if;
  insert into public.client_complaint_files (complaint_id, path, name, size_bytes, mime, by_name, by_email)
  values (p_id, p_path, left(coalesce(nullif(trim(p_name), ''), 'file'), 160), p_size, left(p_mime, 80), coalesce(me.name, 'Unknown'), em)
  on conflict (path) do nothing
  returning id into nid;
  return nid;
end
$function$;
revoke all on function public.client_complaint_add_file(bigint, text, text, bigint, text) from public, anon;
grant execute on function public.client_complaint_add_file(bigint, text, text, bigint, text) to authenticated;

-- Removes the row (the uploader, or Level 5) and says which path to take out of the bucket.
create or replace function public.client_complaint_remove_file(p_file_id bigint)
returns text
language plpgsql security definer
set search_path to ''
as $function$
declare me record; em text := (select lower(u.email) from auth.users u where u.id = auth.uid()); pth text;
begin
  select * into me from public.dashboard_me() limit 1;
  if me.level is null or me.level < 2 or me.scope is not null then raise exception 'Not allowed'; end if;
  delete from public.client_complaint_files f where f.id = p_file_id and (me.level >= 5 or f.by_email = em) returning f.path into pth;
  return pth;
end
$function$;
revoke all on function public.client_complaint_remove_file(bigint) from public, anon;
grant execute on function public.client_complaint_remove_file(bigint) to authenticated;

-- ── list ──
-- The 14 argument version is replaced by one with p_flag. New in each row: phone, complaint_date, responsible, pending_reason, first_response_at,
-- revisit_*, flag (overdue, pending or null), days_open (to today, or to the day it was resolved), reply_due, close_due and the files.
-- On the Log a Complaint page (p_src = 'logged') the masthead's Period cuts by the date of the complaint, not the appointment.
-- Sorts: date (appointment), cdate (complaint), resolved, priority (overdue first, then pending, oldest first, then the resolved, newest first).
drop function if exists public.client_complaints_list(text, text, text, text, text, boolean, integer, integer, text, text, text, date, date, text);
create or replace function public.client_complaints_list(
  p_branch text default 'all', p_src text default 'visit', p_type text default 'all', p_resolution text default 'all', p_q text default '',
  p_low boolean default false, p_limit integer default 30, p_offset integer default 0, p_sort text default 'date', p_dir text default 'desc',
  p_google text default 'all', p_from date default null, p_to date default null, p_status text default 'all', p_flag text default 'all')
returns jsonb
language plpgsql stable security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
declare
  q text := lower(trim(coalesce(p_q, '')));
  qd text := regexp_replace(lower(trim(coalesce(p_q, ''))), '\D', '', 'g');
  lim int := least(greatest(coalesce(p_limit, 30), 1), 100);
  off int := greatest(coalesce(p_offset, 0), 0);
  s text := case when p_sort in ('date', 'branch', 'client', 'detail', 'resolution', 'cdate', 'resolved', 'priority') then p_sort else 'date' end;
  d text := case when p_dir = 'asc' then 'asc' else 'desc' end;
  today date := public.cq_today();
  out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 or (select public.dashboard_scope()) is not null then
    raise exception 'Client Complaints is for Levels 2 and up';
  end if;

  with hit as (
    select c.*, g.review_date as g_date, g.stars as g_stars, g.url as g_url,
      case when c.submitted_at is not null then coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date, c.event_date) end as cdate,
      case when c.submitted_at is not null then public.cq_flag(c.status, coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date, c.event_date), c.first_response_at) end as flag
    from public.client_complaints c
    left join lateral public.cq_google_review(c.client_name, c.event_date) g on true
    where c.is_complaint
      and c.src = case when p_src = 'client' then 'client' else 'visit' end
      and (coalesce(p_src, '') <> 'logged' or c.submitted_at is not null)
      and (coalesce(nullif(p_branch, ''), 'all') = 'all' or c.branch_code = any(string_to_array(p_branch, ',')))
      and (coalesce(p_type, 'all') = 'all' or c.complaint_type = p_type)
      and (coalesce(p_resolution, 'all') = 'all' or c.resolution = p_resolution)
      and (not coalesce(p_low, false) or c.confidence = 'low')
      and (coalesce(p_google, 'all') = 'all' or (p_google = 'yes') = (g.review_date is not null or c.google_url is not null))
      and (coalesce(p_status, 'all') = 'all' or c.status = p_status)
  ), pick as (
    select h.* from hit h
    where (coalesce(p_flag, 'all') = 'all' or h.flag = p_flag)
      and (p_from is null or (case when p_src = 'logged' then h.cdate else h.event_date end) >= p_from)
      and (p_to is null or (case when p_src = 'logged' then h.cdate else h.event_date end) <= p_to)
      and (q = '' or position(q in lower(coalesce(h.client_name, '') || ' ' || coalesce(h.stylists, '') || ' ' ||
             coalesce(h.detail, '') || ' ' || coalesce(h.resolution_detail, '') || ' ' || coalesce(h.note, '') || ' ' ||
             coalesce(h.responsible, '') || ' ' || coalesce(h.pending_reason, ''))) > 0
           or (length(qd) >= 4 and regexp_replace(coalesce(h.client_phone, ''), '\D', '', 'g') like '%' || qd || '%'))
  ), page as (
    select h.*, count(*) over () as total,
      row_number() over (order by
        case when s = 'date' and d = 'asc' then h.event_date end asc nulls last,
        case when s = 'date' and d = 'desc' then h.event_date end desc nulls last,
        case when s = 'cdate' and d = 'asc' then h.cdate end asc nulls last,
        case when s = 'cdate' and d = 'desc' then h.cdate end desc nulls last,
        case when s = 'resolved' and d = 'asc' then h.resolved_at end asc nulls last,
        case when s = 'resolved' and d = 'desc' then h.resolved_at end desc nulls last,
        case when s = 'priority' and d = 'asc' then
          (case when h.flag = 'overdue' then 0 when h.flag = 'pending' then 1 else 2 end) * 1000000
          + (case when h.flag is not null then (h.cdate - date '2016-01-01') else 500000 - (coalesce(h.resolved_at::date, h.event_date, date '2016-01-01') - date '2016-01-01') end) end asc,
        case when s = 'priority' and d = 'desc' then
          (case when h.flag = 'overdue' then 0 when h.flag = 'pending' then 1 else 2 end) * 1000000
          + (case when h.flag is not null then (h.cdate - date '2016-01-01') else 500000 - (coalesce(h.resolved_at::date, h.event_date, date '2016-01-01') - date '2016-01-01') end) end desc,
        case when s = 'branch' and d = 'asc' then h.branch_code end asc nulls last,
        case when s = 'branch' and d = 'desc' then h.branch_code end desc nulls last,
        case when s = 'client' and d = 'asc' then lower(coalesce(h.client_name, '')) end asc,
        case when s = 'client' and d = 'desc' then lower(coalesce(h.client_name, '')) end desc,
        case when s = 'detail' and d = 'asc' then lower(coalesce(h.detail, '')) end asc,
        case when s = 'detail' and d = 'desc' then lower(coalesce(h.detail, '')) end desc,
        case when s = 'resolution' and d = 'asc' then coalesce(h.resolution, '') end asc,
        case when s = 'resolution' and d = 'desc' then coalesce(h.resolution, '') end desc,
        h.event_date desc nulls last, lower(coalesce(h.client_name, '')), h.id desc) as rn
    from pick h
    order by rn
    limit lim offset off
  )
  select jsonb_build_object(
    'total', coalesce((select max(total) from page), 0),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'src', p.src, 'branch', p.branch_code, 'date', p.event_date, 'client', p.client_name,
      'phorest_id', p.phorest_id, 'stylists', p.stylists, 'services', p.services, 'fee', p.fee_total,
      'type', p.complaint_type, 'detail', p.detail, 'resolution', p.resolution,
      'resolution_detail', p.resolution_detail, 'handled_by', p.handled_by, 'confidence', p.confidence,
      'note', p.note, 'g_manual', p.google_url, 'by', p.submitted_by, 'by_at', p.submitted_at, 'by_email', p.submitted_email, 'status', p.status, 'resolved_at', p.resolved_at,
      'phone', p.client_phone, 'complaint_date', p.cdate, 'responsible', p.responsible, 'pending_reason', p.pending_reason, 'first_response_at', p.first_response_at,
      'revisit_date', p.revisit_date, 'revisit_happy', p.revisit_happy, 'revisit_note', p.revisit_note,
      'flag', p.flag,
      'days_open', case when p.cdate is null then null else coalesce((p.resolved_at at time zone 'Asia/Dubai')::date, today) - p.cdate end,
      'reply_due', case when p.cdate is null then null else p.cdate + 2 end, 'close_due', case when p.cdate is null then null else p.cdate + 7 end,
      'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'size', f.size_bytes, 'mime', f.mime, 'path', f.path, 'by', f.by_name, 'by_email', f.by_email, 'at', f.at) order by f.at, f.id), '[]'::jsonb)
                from public.client_complaint_files f where f.complaint_id = p.id),
      'updates', (select coalesce(jsonb_agg(jsonb_build_object('at', u.at, 'by', u.by_name, 'note', u.note, 'res', u.resolution, 'status', u.status, 'responsible', u.responsible, 'pending_reason', u.pending_reason) order by u.at, u.id), '[]'::jsonb)
                from public.client_complaint_updates u where u.complaint_id = p.id),
      'g_date', p.g_date, 'g_stars', p.g_stars, 'g_url', p.g_url
    ) order by p.rn), '[]'::jsonb)
  ) into out
  from page p;

  return out;
end
$function$;
revoke all on function public.client_complaints_list(text, text, text, text, text, boolean, integer, integer, text, text, text, date, date, text, text) from public, anon;
grant execute on function public.client_complaints_list(text, text, text, text, text, boolean, integer, integer, text, text, text, date, date, text, text) to authenticated;

-- The strip at the top of Log a Complaint: how many logged complaints are overdue, pending, and still waiting for a first reply (all dates, picked branches).
create or replace function public.client_complaint_flags(p_branch text default 'all')
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 or (select public.dashboard_scope()) is not null then
    raise exception 'Client Complaints is for Levels 2 and up';
  end if;
  select jsonb_build_object(
    'overdue', count(*) filter (where f = 'overdue'),
    'pending', count(*) filter (where f = 'pending'),
    'unreplied', count(*) filter (where f is not null and first_response_at is null),
    'resolved', count(*) filter (where status = 'resolved'))
  into out
  from (select public.cq_flag(c.status, coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date, c.event_date), c.first_response_at) as f,
               c.first_response_at, c.status
        from public.client_complaints c
        where c.is_complaint and c.submitted_at is not null
          and (coalesce(nullif(p_branch, ''), 'all') = 'all' or c.branch_code = any(string_to_array(p_branch, ',')))) x;
  return out;
end
$function$;
revoke all on function public.client_complaint_flags(text) from public, anon;
grant execute on function public.client_complaint_flags(text) to authenticated;
