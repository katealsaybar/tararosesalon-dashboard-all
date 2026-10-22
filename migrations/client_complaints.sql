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

create or replace function public.client_complaints_summary(p_branch text default 'all')
returns jsonb
language plpgsql stable security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
declare
  b text := coalesce(nullif(p_branch, ''), 'all');
  out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Client Complaints is for Level 5 only';
  end if;

  with v as (
    select * from public.client_complaints
    where is_complaint and src = 'visit' and (b = 'all' or branch_code = b)
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
    where visit_date >= date '2024-01-01'
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
                        where is_complaint and src = 'client' and (b = 'all' or branch_code = b))),
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

create or replace function public.client_complaints_list(
  p_branch text default 'all', p_src text default 'visit', p_type text default 'all',
  p_resolution text default 'all', p_q text default '', p_low boolean default false,
  p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql stable security definer
set search_path to ''
set statement_timeout to '20s'
as $function$
declare
  q text := lower(trim(coalesce(p_q, '')));
  lim int := least(greatest(coalesce(p_limit, 30), 1), 100);
  off int := greatest(coalesce(p_offset, 0), 0);
  out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Client Complaints is for Level 5 only';
  end if;

  with hit as (
    select c.*
    from public.client_complaints c
    where c.is_complaint
      and c.src = case when p_src = 'client' then 'client' else 'visit' end
      and (coalesce(p_branch, 'all') = 'all' or c.branch_code = p_branch)
      and (coalesce(p_type, 'all') = 'all' or c.complaint_type = p_type)
      and (coalesce(p_resolution, 'all') = 'all' or c.resolution = p_resolution)
      and (not coalesce(p_low, false) or c.confidence = 'low')
      and (q = '' or position(q in lower(coalesce(c.client_name, '') || ' ' || coalesce(c.stylists, '') || ' ' ||
             coalesce(c.detail, '') || ' ' || coalesce(c.resolution_detail, '') || ' ' || coalesce(c.note, ''))) > 0)
  ), page as (
    select h.*, count(*) over () as total
    from hit h
    order by h.event_date desc nulls last, lower(coalesce(h.client_name, '')), h.id desc
    limit lim offset off
  )
  select jsonb_build_object(
    'total', coalesce((select max(total) from page), 0),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'src', p.src, 'branch', p.branch_code, 'date', p.event_date, 'client', p.client_name,
      'phorest_id', p.phorest_id, 'stylists', p.stylists, 'services', p.services, 'fee', p.fee_total,
      'type', p.complaint_type, 'detail', p.detail, 'resolution', p.resolution,
      'resolution_detail', p.resolution_detail, 'handled_by', p.handled_by, 'confidence', p.confidence,
      'note', p.note
    ) order by p.event_date desc nulls last, lower(coalesce(p.client_name, '')), p.id desc), '[]'::jsonb)
  ) into out
  from page p;

  return out;
end
$function$;

revoke all on function public.client_complaints_summary(text) from public, anon;
revoke all on function public.client_complaints_list(text, text, text, text, text, boolean, int, int) from public, anon;
grant execute on function public.client_complaints_summary(text) to authenticated;
grant execute on function public.client_complaints_list(text, text, text, text, text, boolean, int, int) to authenticated;
