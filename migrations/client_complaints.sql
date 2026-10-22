-- Client Complaints (Kate, 22 Oct 2026): the historical map of client complaints, from the Phorest client notes and
-- visit notes pulled on 21 Oct 2026 (phorest_client_notes, phorest_visit_notes).
--
-- Reception and the coordinators never kept a list of complainers by name; a complaint is typed into the client's
-- Phorest notes ("Inv kme notes sa phorest"). So the map is built from those notes: a loose keyword pass picked 1,994
-- candidate notes, and each was read and classified (is it a complaint, what kind, how it was resolved). 1,366 are
-- complaints. The classification is a one-off pass over a snapshot; new notes need a re-pull and another pass.
--
-- Table client_complaints (owner_read only, RLS on): one row per candidate note.
--   src            'visit' = a note on one visit (dated, branch known); 'client' = a standing note on the client card
--   regex_tier     A explicit wording, B redo only, C other wording (how it was picked, not how serious it is)
--   is_complaint, complaint_type, detail, resolution, resolution_detail, handled_by, confidence: the classification
-- Visit branch comes from the Phorest branch name on the visit: "Tara Rose Hair and Beauty Salon" = KCA,
-- "... Turquoise 7" = SAA, "... Al Bateen Street" = MRY (checked against sales_transaction_lines by date and stylist).
--
-- The two functions below are the ONLY door the page uses. Security definer, Level 5 only (dashboard_me().level),
-- read only. Safe to run twice.

create table if not exists public.client_complaints (
  id bigserial primary key,
  src text not null check (src in ('visit','client')),
  ref text not null,
  phorest_id text not null,
  client_name text,
  branch_code text,
  phorest_branch_name text,
  event_date date,
  stylists text,
  services text,
  fee_total numeric,
  note text not null,
  regex_tier text,
  reviewed boolean not null default false,
  is_complaint boolean,
  complaint_type text,
  detail text,
  resolution text,
  resolution_detail text,
  handled_by text,
  confidence text,
  created_at timestamptz default now(),
  unique (src, ref)
);
alter table public.client_complaints enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'client_complaints' and policyname = 'owner_read') then
    create policy owner_read on public.client_complaints for select to authenticated using ((select public.is_dashboard_owner()));
  end if;
end $$;

-- 22 Oct 2026 (v4): the masthead's Period. p_from and p_to are null for All time (undated client-card notes only count then).
drop function if exists public.client_complaints_summary(text);
create or replace function public.client_complaints_summary(p_branch text default 'all', p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
declare
  b text := coalesce(nullif(p_branch, ''), 'all');   -- 'all', one code, or several codes separated by commas (the masthead's Branch chips)
  bs text[] := string_to_array(coalesce(nullif(p_branch, ''), 'all'), ',');
  out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Client Complaints is for Level 5 only';
  end if;

  with v as (
    select * from public.client_complaints
    where is_complaint and src = 'visit' and (b = 'all' or branch_code = any(bs))
      and (p_from is null or event_date >= p_from) and (p_to is null or event_date <= p_to)
  ), noted as (
    select case branch_short
             when 'Tara Rose Hair and Beauty Salon' then 'KCA'
             when 'Tara Rose Hair and Beauty Salon - Turquoise 7' then 'SAA'
             when 'Tara Rose Hair and Beauty Salon - Al Bateen Street' then 'MRY'
             when 'Motor City Tara Rose Salon' then 'MC'
             when 'Tara Rose Ladies Salon - Al Quoz' then 'AQ'
             when 'Tara Rose Gents Salon - Fratelli ' then 'FRA'
             when 'Tara Rose Salon Bahrain' then 'BAH' end as bc,
           count(*) as n
    from public.phorest_visit_notes
    where visit_date >= date '2024-01-01' and (p_from is null or visit_date >= p_from) and (p_to is null or visit_date <= p_to)
    group by 1
  ), per as (
    select branch_code,
      count(*) as complaints,
      count(*) filter (where event_date >= date '2025-01-01') as since_2025,
      count(*) filter (where event_date >= date '2024-01-01') as since_2024,
      count(distinct phorest_id) as clients,
      count(*) filter (where resolution = 'free_redo') as free_redo,
      count(*) filter (where resolution = 'refund') as refund,
      count(*) filter (where resolution = 'discount_or_credit') as discount_credit,
      count(*) filter (where resolution = 'free_service_or_product') as free_service,
      count(*) filter (where resolution = 'adjusted_same_visit') as adjusted,
      count(*) filter (where resolution in ('apology_or_explanation', 'escalated_followup')) as talked,
      count(*) filter (where resolution = 'client_lost_or_cancelled') as lost,
      count(*) filter (where resolution in ('no_action_noted', 'unclear')) as no_outcome
    from public.client_complaints
    where is_complaint and src = 'visit'
      and (p_from is null or event_date >= p_from) and (p_to is null or event_date <= p_to)
    group by 1
  )
  select jsonb_build_object(
    'branches', coalesce((select jsonb_agg(jsonb_build_object(
        'branch', p.branch_code, 'complaints', p.complaints, 'since_2025', p.since_2025, 'since_2024', p.since_2024,
        'clients', p.clients, 'noted_since_2024', coalesce(n.n, 0),
        'free_redo', p.free_redo, 'refund', p.refund, 'discount_credit', p.discount_credit, 'free_service', p.free_service,
        'adjusted', p.adjusted, 'talked', p.talked, 'lost', p.lost, 'no_outcome', p.no_outcome
      ) order by p.complaints desc)
      from per p left join noted n on n.bc = p.branch_code), '[]'::jsonb),
    'tiles', jsonb_build_object(
      'complaints', (select count(*) from v),
      'since_2025', (select count(*) from v where event_date >= date '2025-01-01'),
      'clients', (select count(distinct phorest_id) from v),
      'repeat_clients', (select count(*) from (select phorest_id from v group by 1 having count(*) >= 2) x),
      'low_confidence', (select count(*) from v where confidence = 'low'),
      'profile_flags', (select count(*) from public.client_complaints
                        where is_complaint and src = 'client' and p_from is null and p_to is null and (b = 'all' or branch_code = any(bs)))),
    'years', coalesce((select jsonb_agg(jsonb_build_object('yr', y.yr, 'branch', y.branch_code, 'n', y.n) order by y.yr)
      from (select extract(year from event_date)::int as yr, branch_code, count(*) as n
            from v where event_date is not null group by 1, 2) y), '[]'::jsonb),
    'types', coalesce((select jsonb_agg(jsonb_build_object('type', t.k, 'n', t.n) order by t.n desc)
      from (select coalesce(complaint_type, 'unclear') as k, count(*) as n from v group by 1) t), '[]'::jsonb),
    'resolutions', coalesce((select jsonb_agg(jsonb_build_object('resolution', r.k, 'n', r.n) order by r.n desc)
      from (select coalesce(resolution, 'unclear') as k, count(*) as n from v group by 1) r), '[]'::jsonb),
    'reviewed', (select count(*) from public.client_complaints),
    'copied', (select max(pulled_at) from public.phorest_visit_notes)
  ) into out;

  return out;
end
$function$;

-- 22 Oct 2026 (v2): p_branch takes several codes separated by commas; the list takes p_sort and p_dir (column header sort).
-- The old 8-argument list function is dropped so the two do not clash.
drop function if exists public.client_complaints_list(text, text, text, text, text, boolean, int, int);
-- 22 Oct 2026 (v3): which complaints reached Google. cq_google_review matches the client's full name to a Google reviewer name
-- (exact, ignoring case and spacing) and takes the first review on or after the complaint date. A name match only: reviewers
-- often post a first name or a nickname, so a missing match is "not found", not proof there is no review.
create or replace function public.cq_google_review(p_name text, p_date date)
returns table(review_date date, stars smallint, url text, branch text)
language sql stable security definer
set search_path to ''
as $function$
  select r.review_date, r.stars, r.url, r.branch
  from public.google_reviews r
  where length(trim(coalesce(p_name, ''))) >= 5
    and lower(regexp_replace(trim(r.reviewer), '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'))
    and (p_date is null or r.review_date >= p_date)
  order by r.review_date asc nulls last limit 1
$function$;
revoke all on function public.cq_google_review(text, date) from public, anon, authenticated;

drop function if exists public.client_complaints_list(text, text, text, text, text, boolean, int, int, text, text);
drop function if exists public.client_complaints_list(text, text, text, text, text, boolean, int, int, text, text, text);
create or replace function public.client_complaints_list(
  p_branch text default 'all', p_src text default 'visit', p_type text default 'all',
  p_resolution text default 'all', p_q text default '', p_low boolean default false,
  p_limit int default 30, p_offset int default 0, p_sort text default 'date', p_dir text default 'desc',
  p_google text default 'all', p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
declare
  q text := lower(trim(coalesce(p_q, '')));
  lim int := least(greatest(coalesce(p_limit, 30), 1), 100);
  off int := greatest(coalesce(p_offset, 0), 0);
  s text := case when p_sort in ('date', 'branch', 'client', 'detail', 'resolution') then p_sort else 'date' end;
  d text := case when p_dir = 'asc' then 'asc' else 'desc' end;
  out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Client Complaints is for Level 5 only';
  end if;

  with hit as (
    select c.*, g.review_date as g_date, g.stars as g_stars, g.url as g_url
    from public.client_complaints c
    left join lateral public.cq_google_review(c.client_name, c.event_date) g on true
    where c.is_complaint
      and c.src = case when p_src = 'client' then 'client' else 'visit' end
      and (coalesce(nullif(p_branch, ''), 'all') = 'all' or c.branch_code = any(string_to_array(p_branch, ',')))
      and (coalesce(p_type, 'all') = 'all' or c.complaint_type = p_type)
      and (coalesce(p_resolution, 'all') = 'all' or c.resolution = p_resolution)
      and (not coalesce(p_low, false) or c.confidence = 'low')
      and (coalesce(p_google, 'all') = 'all' or (p_google = 'yes') = (g.review_date is not null))
      and (p_from is null or c.event_date >= p_from) and (p_to is null or c.event_date <= p_to)
      and (q = '' or position(q in lower(coalesce(c.client_name, '') || ' ' || coalesce(c.stylists, '') || ' ' ||
             coalesce(c.detail, '') || ' ' || coalesce(c.resolution_detail, '') || ' ' || coalesce(c.note, ''))) > 0)
  ), page as (
    select h.*, count(*) over () as total,
      row_number() over (order by
        case when s = 'date' and d = 'asc' then h.event_date end asc nulls last,
        case when s = 'date' and d = 'desc' then h.event_date end desc nulls last,
        case when s = 'branch' and d = 'asc' then h.branch_code end asc nulls last,
        case when s = 'branch' and d = 'desc' then h.branch_code end desc nulls last,
        case when s = 'client' and d = 'asc' then lower(coalesce(h.client_name, '')) end asc,
        case when s = 'client' and d = 'desc' then lower(coalesce(h.client_name, '')) end desc,
        case when s = 'detail' and d = 'asc' then lower(coalesce(h.detail, '')) end asc,
        case when s = 'detail' and d = 'desc' then lower(coalesce(h.detail, '')) end desc,
        case when s = 'resolution' and d = 'asc' then coalesce(h.resolution, '') end asc,
        case when s = 'resolution' and d = 'desc' then coalesce(h.resolution, '') end desc,
        h.event_date desc nulls last, lower(coalesce(h.client_name, '')), h.id desc) as rn
    from hit h
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
      'note', p.note, 'g_date', p.g_date, 'g_stars', p.g_stars, 'g_url', p.g_url
    ) order by p.rn), '[]'::jsonb)
  ) into out
  from page p;

  return out;
end
$function$;

revoke all on function public.client_complaints_summary(text, date, date) from public, anon;
revoke all on function public.client_complaints_list(text, text, text, text, text, boolean, int, int, text, text, text, date, date) from public, anon;
grant execute on function public.client_complaints_summary(text, date, date) to authenticated;
grant execute on function public.client_complaints_list(text, text, text, text, text, boolean, int, int, text, text, text, date, date) to authenticated;

drop function if exists public.client_complaints_google_count(text);
create or replace function public.client_complaints_google_count(p_branch text default 'all', p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Client Complaints is for Level 5 only';
  end if;
  select jsonb_build_object('total', count(*), 'on_google', count(*) filter (where g.review_date is not null)) into out
  from public.client_complaints c
  left join lateral public.cq_google_review(c.client_name, c.event_date) g on true
  where c.is_complaint and c.src = 'visit'
    and (coalesce(nullif(p_branch, ''), 'all') = 'all' or c.branch_code = any(string_to_array(p_branch, ',')))
    and (p_from is null or c.event_date >= p_from) and (p_to is null or c.event_date <= p_to);
  return out;
end
$function$;
revoke all on function public.client_complaints_google_count(text, date, date) from public, anon;
grant execute on function public.client_complaints_google_count(text, date, date) to authenticated;
