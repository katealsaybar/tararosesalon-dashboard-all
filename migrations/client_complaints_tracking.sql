-- Client Complaints tracking (Kate, 22 Oct 2026): "mas madali i-track yung complaints resolutions at paano siya na-resolve", instead of
-- talking about them in WhatsApp. Run after client_complaints.sql (it patches the v5 functions in place, and supersedes its
-- client_complaint_submit). A complaint logged from the page starts Open unless it was resolved when logged; follow-up notes go in
-- client_complaint_updates; Mark resolved sets the outcome (status resolved, resolution, resolved_at) and Reopen clears it again.
-- Applied live 22 Oct 2026. Historical rows (from the Phorest notes) have status null and are untouched.

alter table public.client_complaints add column if not exists status text, add column if not exists resolved_at timestamptz;

create table if not exists public.client_complaint_updates (
  id bigserial primary key,
  complaint_id bigint not null references public.client_complaints(id) on delete cascade,
  at timestamptz not null default now(),
  by_name text, by_email text, note text, resolution text, status text);
alter table public.client_complaint_updates enable row level security;
do $p$ begin
  if not exists (select 1 from pg_policies where tablename = 'client_complaint_updates' and policyname = 'owner_read') then
    create policy owner_read on public.client_complaint_updates for select to authenticated using ((select public.is_dashboard_owner()));
  end if;
end $p$;
create index if not exists client_complaint_updates_cid on public.client_complaint_updates (complaint_id);

-- submit: "not resolved yet" (an empty resolution) keeps it open
create or replace function public.client_complaint_submit(
  p_client text, p_branch text, p_date date, p_stylist text, p_service text, p_type text, p_detail text,
  p_resolution text, p_resolution_detail text, p_handled_by text, p_google_url text)
returns bigint
language plpgsql security definer
set search_path to ''
as $function$
declare
  me record; nid bigint; nm text := regexp_replace(trim(coalesce(p_client, '')), '\s+', ' ', 'g');
  gu text := nullif(trim(coalesce(p_google_url, '')), '');
  rs text := nullif(trim(coalesce(p_resolution, '')), '');
begin
  select * into me from public.dashboard_me() limit 1;
  if me.level is null or me.level < 2 or me.scope is not null then
    raise exception 'Logging a complaint is for Levels 2 and up';
  end if;
  if length(nm) < 3 then raise exception 'Write the client''s full name'; end if;
  if p_branch not in ('SAA', 'KCA', 'MC', 'AQ', 'BAH') then raise exception 'Pick the branch'; end if;
  if p_date is null or p_date > current_date or p_date < date '2016-01-01' then raise exception 'Pick the date of the visit'; end if;
  if p_type not in ('colour_result', 'nail_service', 'treatment_result', 'cut_result', 'price_or_billing', 'booking_or_admin', 'wait_or_time',
                    'staff_attitude', 'skin_reaction_or_injury', 'facility_or_parking', 'product', 'other') then raise exception 'Pick what the complaint was about'; end if;
  if rs is not null and rs not in ('free_redo', 'refund', 'discount_or_credit', 'free_service_or_product', 'adjusted_same_visit', 'apology_or_explanation',
                          'escalated_followup', 'client_lost_or_cancelled', 'no_action_noted') then raise exception 'Pick how it was resolved'; end if;
  if length(trim(coalesce(p_detail, ''))) < 10 then raise exception 'Write what happened (a sentence)'; end if;
  if gu is not null and gu !~* '^https?://' then raise exception 'The Google link must start with http'; end if;
  insert into public.client_complaints (src, ref, phorest_id, client_name, branch_code, event_date, stylists, services, note, regex_tier, reviewed,
      is_complaint, complaint_type, detail, resolution, resolution_detail, handled_by, confidence, submitted_by, submitted_email, submitted_at, google_url,
      status, resolved_at)
  values ('visit', 'sub-' || gen_random_uuid()::text, 'manual:' || lower(nm), nm, p_branch, p_date, nullif(trim(coalesce(p_stylist, '')), ''),
      nullif(trim(coalesce(p_service, '')), ''), left(trim(p_detail), 4000), 'S', true, true, p_type, left(trim(p_detail), 300), rs,
      nullif(left(trim(coalesce(p_resolution_detail, '')), 300), ''), nullif(left(trim(coalesce(p_handled_by, '')), 80), ''), 'high',
      coalesce(me.name, 'Unknown'), (select lower(u.email) from auth.users u where u.id = auth.uid()), now(), gu,
      case when rs is null then 'open' else 'resolved' end, case when rs is null then null else now() end)
  returning id into nid;
  return nid;
end
$function$;

create or replace function public.client_complaint_update(p_id bigint, p_note text, p_resolution text, p_status text)
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
begin
  select * into me from public.dashboard_me() limit 1;
  if me.level is null or me.level < 2 or me.scope is not null then raise exception 'Not allowed'; end if;
  select * into cr from public.client_complaints where id = p_id and submitted_at is not null;
  if not found then raise exception 'That complaint cannot be updated here'; end if;
  if st not in ('note', 'resolved', 'open') then raise exception 'Unknown status'; end if;
  if rs is not null and rs not in ('free_redo', 'refund', 'discount_or_credit', 'free_service_or_product', 'adjusted_same_visit', 'apology_or_explanation',
                          'escalated_followup', 'client_lost_or_cancelled', 'no_action_noted') then raise exception 'Pick how it was resolved'; end if;
  if st = 'resolved' and rs is null then raise exception 'Pick how it was resolved'; end if;
  if st <> 'resolved' and nt = '' then raise exception 'Write the update'; end if;
  insert into public.client_complaint_updates (complaint_id, by_name, by_email, note, resolution, status)
  values (p_id, coalesce(me.name, 'Unknown'), em, nt, case when st = 'resolved' then rs end, st);
  if st = 'resolved' then
    update public.client_complaints set status = 'resolved', resolution = rs, resolved_at = now(),
      resolution_detail = coalesce(nullif(nt, ''), resolution_detail) where id = p_id;
  elsif st = 'open' then
    update public.client_complaints set status = 'open', resolution = null, resolved_at = null where id = p_id;
  end if;
  return true;
end
$function$;
revoke all on function public.client_complaint_update(bigint, text, text, text) from public, anon;
grant execute on function public.client_complaint_update(bigint, text, text, text) to authenticated;

-- The summary gains the open count (tiles.open_now, all dates, the picked branches) and shows open ones as "open" in the outcome bars; the list
-- gains p_status ('all', 'open', 'resolved') and returns status, resolved_at and the follow-up updates. The 13-argument list is dropped.
do $do$
declare r record; d text; i int;
  s_old text[] := array[
    $q$'low_confidence', (select count(*) from v where confidence = 'low'),$q$,
    $q$'low_confidence', (select count(*) from v where confidence = 'low'), 'open_now', (select count(*) from public.client_complaints oc where oc.is_complaint and oc.status = 'open' and (b = 'all' or oc.branch_code = any(bs))),$q$,
    $q$coalesce(resolution, 'unclear') as k$q$,
    $q$case when status = 'open' then 'open' else coalesce(resolution, 'unclear') end as k$q$];
  l_old text[] := array[
    $q$p_to date DEFAULT NULL::date)$q$,
    $q$p_to date DEFAULT NULL::date, p_status text DEFAULT 'all'::text)$q$,
    $q$and (q = '' or position$q$,
    $q$and (coalesce(p_status, 'all') = 'all' or c.status = p_status)
      and (q = '' or position$q$,
    $q$'by_email', p.submitted_email,$q$,
    $q$'by_email', p.submitted_email, 'status', p.status, 'resolved_at', p.resolved_at, 'updates', (select coalesce(jsonb_agg(jsonb_build_object('at', u.at, 'by', u.by_name, 'note', u.note, 'res', u.resolution, 'status', u.status) order by u.at, u.id), '[]'::jsonb) from public.client_complaint_updates u where u.complaint_id = p.id),$q$];
begin
  select p.oid into r from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'client_complaints_summary';
  d := pg_get_functiondef(r.oid);
  for i in 1 .. 2 loop
    if position(s_old[2*i-1] in d) = 0 then raise exception 'summary pattern % missing', i; end if;
    d := replace(d, s_old[2*i-1], s_old[2*i]);
  end loop;
  execute d;
  select p.oid into r from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'client_complaints_list';
  d := pg_get_functiondef(r.oid);
  for i in 1 .. 3 loop
    if position(l_old[2*i-1] in d) = 0 then raise exception 'list pattern % missing', i; end if;
    d := replace(d, l_old[2*i-1], l_old[2*i]);
  end loop;
  execute d;
  drop function public.client_complaints_list(text, text, text, text, text, boolean, integer, integer, text, text, text, date, date);
end
$do$;
revoke all on function public.client_complaints_list(text, text, text, text, text, boolean, int, int, text, text, text, date, date, text) from public, anon;
grant execute on function public.client_complaints_list(text, text, text, text, text, boolean, int, int, text, text, text, date, date, text) to authenticated;
