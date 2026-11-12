-- Chat complaints review (Kate, 12 Nov 2026): the people who wrote complaint-like messages to the salon in WhatsApp, Instagram or Facebook (found by the respond.io traceback, read by Claude)
-- and who are not yet on the Client Complaints list. Coach Emma and Kate decide each one: Confirm complaint, Not a complaint, Already in dashboard (and which one), or Unsure.
-- Levels 3 and up (the numbers in the database are the old ones: 3 in the UI is 2 here, and a Bahrain-scoped sign-in is refused), checked in every function (Kate, 12 Nov 2026: "level 3 and up"). Nothing here is sent to a client and nothing alerts anyone.
-- The table holds the rows of the review file: the client, her number, which chat it was, the day, how sure we are, the first matching words and a short note. It is filled once from the
-- review file by a one-off script (names and numbers are not kept in this repo); the decisions are the only thing the page changes.
create table if not exists public.complaint_candidates (
  id             bigserial primary key,
  client_name    text not null,
  phone          text,
  chat           text not null,                  -- SAA, KCA, MC, AQ, Brand number, Instagram, Facebook
  branch_code    text,
  msg_date       date not null,
  confidence     text not null check (confidence in ('likely', 'maybe')),
  health         boolean not null default false, -- skin, scalp, allergy, burn or infection wording: look at these first
  words          text,
  note           text,
  suggested_type text,
  phorest_id     text,                           -- matched by phone when exactly one Phorest client holds the number
  status         text not null default 'todo' check (status in ('todo', 'confirmed', 'not', 'already', 'unsure')),
  final_type     text,
  link_id        bigint references public.client_complaints(id) on delete set null,
  decided_by     text,
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.complaint_candidates enable row level security;   -- no policies: read and written through the functions below only

create or replace function public.complaint_candidates_list(p_status text default 'all', p_chat text default 'all', p_q text default '') returns jsonb
language plpgsql stable security definer set search_path = '' set statement_timeout = '20s' as $$
declare q text := lower(trim(coalesce(p_q, '')));
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 or (select public.dashboard_scope()) is not null then raise exception 'Chat complaints are for Levels 3 and up'; end if;
  return jsonb_build_object(
    'counts', (select jsonb_build_object('total', count(*), 'todo', count(*) filter (where status = 'todo'), 'confirmed', count(*) filter (where status = 'confirmed'),
                 'not', count(*) filter (where status = 'not'), 'already', count(*) filter (where status = 'already'), 'unsure', count(*) filter (where status = 'unsure'))
                 from public.complaint_candidates),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'client', c.client_name, 'phone', c.phone, 'chat', c.chat, 'branch', c.branch_code, 'date', c.msg_date, 'confidence', c.confidence, 'health', c.health,
        'words', c.words, 'note', c.note, 'type', coalesce(c.final_type, c.suggested_type), 'suggested', c.suggested_type, 'status', c.status, 'phorest_id', c.phorest_id,
        'link_id', c.link_id, 'link_code', (select x.code from public.client_complaints x where x.id = c.link_id),
        'decided_by', c.decided_by, 'decided_at', c.decided_at) order by c.health desc, c.msg_date desc, c.id)
      from public.complaint_candidates c
     where (coalesce(p_status, 'all') = 'all' or c.status = p_status)
       and (coalesce(p_chat, 'all') = 'all' or c.chat = p_chat)
       and (q = '' or position(q in lower(c.client_name || ' ' || coalesce(c.note, '') || ' ' || coalesce(c.words, '') || ' ' || coalesce(c.phone, ''))) > 0)), '[]'::jsonb));
end $$;

-- One decision. p_status 'todo' puts it back. Confirm keeps the type (the suggestion unless a person changed it); Already in dashboard needs the complaint it is.
create or replace function public.complaint_candidate_decide(p_id bigint, p_status text, p_type text default null, p_link bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 or (select public.dashboard_scope()) is not null then raise exception 'Chat complaints are for Levels 3 and up'; end if;
  if p_status not in ('todo', 'confirmed', 'not', 'already', 'unsure') then raise exception 'Unknown decision'; end if;
  if p_status = 'already' and p_link is null then raise exception 'Pick the complaint it is'; end if;
  update public.complaint_candidates c set
    status = p_status,
    final_type = case when p_status = 'confirmed' then left(coalesce(nullif(p_type, ''), c.suggested_type), 40) end,
    link_id = case when p_status = 'already' then p_link end,
    decided_by = case when p_status = 'todo' then null else (select auth.jwt() ->> 'email') end,
    decided_at = case when p_status = 'todo' then null else now() end
   where c.id = p_id;
end $$;

-- Her profile for a candidate, the same shape as complaint_client_profile, from the Phorest client the number matched (no Phorest client: only the name and number).
create or replace function public.complaint_candidate_profile(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' set statement_timeout = '20s' as $$
declare c record; e record; out jsonb; out2 jsonb; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 or (select public.dashboard_scope()) is not null then raise exception 'Chat complaints are for Levels 3 and up'; end if;
  select x.id, x.client_name, x.phone, x.phorest_id, x.msg_date into c from public.complaint_candidates x where x.id = p_id;
  if not found then return null; end if;
  select pe.first_name, pe.last_name, pe.mobile, pe.email, pe.email_status, pe.archived
    into e from public.phorest_client_emails pe where pe.phorest_id = c.phorest_id order by pe.pulled_at desc nulls last limit 1;
  out := jsonb_build_object(
    'id', c.id, 'phorest_id', c.phorest_id,
    'name', coalesce(nullif(btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''), c.client_name),
    'phone', coalesce(nullif(c.phone, ''), nullif(e.mobile, '')),
    'email', case when e.email_status = 'real' then e.email end, 'email_status', e.email_status, 'archived', coalesce(e.archived, false),
    'on_phorest', c.phorest_id is not null,
    'branches', coalesce((select jsonb_agg(distinct b.branch_code) from public.phorest_client_branches b where b.phorest_id = c.phorest_id and b.branch_code is not null), '[]'::jsonb));
  if c.phorest_id is not null then
    -- Visits come from what she was sold (sales_transaction_lines by Phorest client id), because phorest_visit_notes only holds visits that carry a note (13 Nov 2026: a client's 10 Sep colour was missing).
    -- A visit from the notes table is added only for a day with no sale, and only when it has a service that was not cancelled or a no-show.
    with sv as (
      select s.date::date as d, min(s.branch) as at,
             jsonb_agg(jsonb_build_object('desc', s.item, 'st', s.employee_name) order by s.item) as items
        from public.sales_transaction_lines s
       where s.client_id = c.phorest_id and s.date::date <= today
       group by s.date::date
    ), nv as (
      select v.visit_date as d, min(trim(v.branch_short)) as at,
             jsonb_agg(jsonb_build_object('desc', i ->> 'desc', 'st', i ->> 'st')) as items
        from public.phorest_visit_notes v
        cross join lateral jsonb_array_elements(coalesce(v.services -> 'items', '[]'::jsonb)) i
       where v.phorest_id = c.phorest_id and v.visit_date <= today
         and coalesce(i ->> 'state', '') not in ('CANCELED', 'NO_SHOW')
         and not exists (select 1 from sv where sv.d = v.visit_date)
       group by v.visit_date
    ), allv as (select * from sv union all select * from nv)
    select jsonb_build_object(
             'visits', count(*),
             'first_visit', min(d),
             'last_visit', max(d),
             'recent', coalesce((select jsonb_agg(jsonb_build_object('date', r.d, 'at', r.at, 'items', r.items) order by r.d desc)
                                   from (select * from allv order by d desc limit 8) r), '[]'::jsonb))
      into out2 from allv;
    out := out || coalesce(out2, jsonb_build_object('visits', 0, 'first_visit', null, 'last_visit', null, 'recent', '[]'::jsonb))
      || jsonb_build_object('others', coalesce((select jsonb_agg(o order by o.date desc nulls last) from (
          select y.id, y.code, coalesce(y.complaint_date, y.event_date) as date, y.complaint_type as type, y.status, y.branch_code as branch
            from public.client_complaints y where y.phorest_id = c.phorest_id and y.is_complaint and y.duplicate_of is null
           order by coalesce(y.complaint_date, y.event_date) desc nulls last limit 30) o), '[]'::jsonb));
  else
    out := out || jsonb_build_object('visits', 0, 'first_visit', null, 'last_visit', null, 'recent', '[]'::jsonb, 'others', '[]'::jsonb);
  end if;
  return out;
end $$;

revoke all on function public.complaint_candidates_list(text, text, text), public.complaint_candidate_decide(bigint, text, text, bigint), public.complaint_candidate_profile(bigint) from public, anon;
grant execute on function public.complaint_candidates_list(text, text, text), public.complaint_candidate_decide(bigint, text, text, bigint), public.complaint_candidate_profile(bigint) to authenticated;
