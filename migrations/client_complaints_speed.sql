-- Client Complaints speed (Kate, 22 Oct 2026: "loads too long"). Timed as Kate on 22 Oct before: summary 5.4 to 7 s, Google count 8.8 s, one page of
-- the list 8.6 s, and the page asked for all three. After: summary 14 to 29 ms, Google count 135 ms, list 54 to 82 ms. Same numbers (the notes counts
-- per branch matched before and after). Run after client_complaints.sql and client_complaints_tracking.sql. Applied live 22 Oct 2026.
--
-- 1. The Google match no longer runs a regular expression over all 2,700 reviews for every complaint. cq_review_cache holds each reviewer name
--    already cleaned (lower case, one space between words) with an index, and cq_google_review looks the client's name up in it. A trigger on
--    google_reviews refreshes the cache after every insert, update or delete (a statement at a time), so the reviews sync keeps it current.
-- 2. The rate's denominator (visit notes per branch since 1 Jan 2024) no longer scans the 105,000 notes on every call. cq_notes_daily holds the
--    counts per branch and day, and cq_notes_meta the date the notes were pulled. They are a snapshot: run  select public.cq_notes_refresh();
--    again after the notes are re-pulled (phorest_visit_notes).

create table if not exists public.cq_review_cache (nm text not null, review_date date, stars smallint, url text, branch text);
create index if not exists cq_review_cache_nm on public.cq_review_cache (nm, review_date);
alter table public.cq_review_cache enable row level security;

create or replace function public.cq_review_cache_refresh() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cq_review_cache;
  insert into public.cq_review_cache (nm, review_date, stars, url, branch)
  select lower(regexp_replace(trim(r.reviewer), '\s+', ' ', 'g')), r.review_date, r.stars, r.url, r.branch
  from public.google_reviews r where r.reviewer is not null and length(trim(r.reviewer)) >= 5;
end $$;
revoke all on function public.cq_review_cache_refresh() from public, anon, authenticated;

create or replace function public.cq_review_cache_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin perform public.cq_review_cache_refresh(); exception when others then raise warning 'cq review cache: %', sqlerrm; end;
  return null;
end $$;
revoke all on function public.cq_review_cache_trg() from public, anon, authenticated;
drop trigger if exists cq_review_cache_sync on public.google_reviews;
create trigger cq_review_cache_sync after insert or update or delete on public.google_reviews
  for each statement execute function public.cq_review_cache_trg();
select public.cq_review_cache_refresh();

create or replace function public.cq_google_review(p_name text, p_date date)
returns table(review_date date, stars smallint, url text, branch text)
language sql stable security definer
set search_path to ''
as $function$
  select c.review_date, c.stars, c.url, c.branch
  from public.cq_review_cache c
  where length(trim(coalesce(p_name, ''))) >= 5
    and c.nm = lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'))
    and (p_date is null or c.review_date >= p_date)
  order by c.review_date asc nulls last limit 1
$function$;
revoke all on function public.cq_google_review(text, date) from public, anon, authenticated;

create table if not exists public.cq_notes_daily (branch_code text not null, d date not null, n int not null, primary key (branch_code, d));
create table if not exists public.cq_notes_meta (pulled_at timestamptz);
alter table public.cq_notes_daily enable row level security;
alter table public.cq_notes_meta enable row level security;

create or replace function public.cq_notes_refresh() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cq_notes_daily;
  insert into public.cq_notes_daily (branch_code, d, n)
  select bc, visit_date, count(*) from (
    select case branch_short
             when 'Tara Rose Hair and Beauty Salon' then 'KCA'
             when 'Tara Rose Hair and Beauty Salon - Turquoise 7' then 'SAA'
             when 'Tara Rose Hair and Beauty Salon - Al Bateen Street' then 'MRY'
             when 'Motor City Tara Rose Salon' then 'MC'
             when 'Tara Rose Ladies Salon - Al Quoz' then 'AQ'
             when 'Tara Rose Gents Salon - Fratelli ' then 'FRA'
             when 'Tara Rose Salon Bahrain' then 'BAH' end as bc, visit_date
    from public.phorest_visit_notes where visit_date >= date '2024-01-01') x
  where bc is not null group by bc, visit_date;
  delete from public.cq_notes_meta;
  insert into public.cq_notes_meta select max(pulled_at) from public.phorest_visit_notes;
end $$;
revoke all on function public.cq_notes_refresh() from public, anon, authenticated;
select public.cq_notes_refresh();

-- The summary's `noted` CTE now reads cq_notes_daily, and 'copied' reads cq_notes_meta (the rest of the function is as in
-- client_complaints.sql, client_complaints_tracking.sql and the Levels 2 and up guard):
--   noted as (
--     select d.branch_code as bc, sum(d.n) as n from public.cq_notes_daily d
--     where d.d >= date '2024-01-01' and (p_from is null or d.d >= p_from) and (p_to is null or d.d <= p_to) group by 1
--   )
--   'copied', (select max(m.pulled_at) from public.cq_notes_meta m)
-- The live definition is the one to copy from: select pg_get_functiondef('public.client_complaints_summary(text, date, date)'::regprocedure);
