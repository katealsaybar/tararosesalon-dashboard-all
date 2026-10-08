-- Kate, 9 Oct 2026: Over the Years. The business year on year, 2021 to now, season by season.
--
--   oty_seasons          one row per season per year: name, start, end. The season list lives here, one
--                        table, so a boundary can move without a rebuild. Ramadan and Eid drift about
--                        11 days earlier every year, which is the whole reason for seasons (Emma Coach's
--                        idea: month against month compares different seasons). The four seasons seeded
--                        are a placeholder until Emma sets the real list.
--   over_the_years()     money, per-staff and per-visit counts, season takings per open day, and Google
--                        review counts and stars, per year and branch. Security INVOKER, so a branch-scoped
--                        login only gets its own branch, the same as every other table read.
--   over_the_years_ig()  Instagram by month (our posts and reels, collab posts, client tags). Those tables
--                        have row-level security and no policies, so this is security definer, Level 3 and
--                        above, the same as the Social page.
--
-- Sources: financial_totals.sales_net (Phorest daily financial totals, net of VAT), the distinct sale_id
-- count in sales_transaction_lines (a visit, through the door), phorest_staff_daily.visits on the staff rows
-- (a client counted once per staff member), google_reviews. The four UAE branches only: SAA, KCA, MC, AQ.
-- "Same days" is 1 Jan to the last day takings are in this year, applied to every year.

create table if not exists public.oty_seasons (
  year int not null,
  season text not null,
  sort int not null,
  start_date date not null,
  end_date date not null,
  primary key (year, season)
);
alter table public.oty_seasons enable row level security;
drop policy if exists oty_seasons_read on public.oty_seasons;
create policy oty_seasons_read on public.oty_seasons for select to authenticated using (true);

insert into public.oty_seasons (year, season, sort, start_date, end_date) values
  (2021, 'Ramadan and Eid', 1, date '2021-04-13', date '2021-05-15'),
  (2022, 'Ramadan and Eid', 1, date '2022-04-02', date '2022-05-04'),
  (2023, 'Ramadan and Eid', 1, date '2023-03-23', date '2023-04-23'),
  (2024, 'Ramadan and Eid', 1, date '2024-03-11', date '2024-04-12'),
  (2025, 'Ramadan and Eid', 1, date '2025-03-01', date '2025-04-01'),
  (2026, 'Ramadan and Eid', 1, date '2026-02-18', date '2026-03-22')
on conflict do nothing;

insert into public.oty_seasons (year, season, sort, start_date, end_date)
select y, v.season, v.sort, make_date(y, v.m1, v.d1), make_date(y, v.m2, v.d2)
from generate_series(2021, 2026) y
cross join (values ('Summer', 2, 6, 1, 8, 31), ('Autumn reset', 3, 9, 1, 10, 31), ('Festive', 4, 11, 1, 12, 31))
  as v(season, sort, m1, d1, m2, d2)
on conflict do nothing;

-- The same calendar day in another year (29 Feb becomes 28 Feb).
create or replace function public.oty_same_day(p_year int, p_month int, p_day int)
returns date language sql immutable parallel safe as $$
  select least(make_date(p_year, p_month, 1) + (p_day - 1),
               (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date)
$$;

-- The cutoff for every year, worked out once (doing it per row took 25 seconds).
create or replace function public.oty_cuts(p_month int, p_day int)
returns table (y int, c date) language sql immutable parallel safe as $$
  select yy, public.oty_same_day(yy, p_month, p_day) from generate_series(2021, extract(year from current_date)::int) yy
$$;
grant execute on function public.oty_cuts(int, int) to authenticated;

create or replace function public.over_the_years()
returns jsonb language plpgsql stable security invoker set search_path to 'public'
as $function$
declare
  v_cut date; v_m int; v_d int; out jsonb;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  select max(date) into v_cut from public.financial_totals where date >= date_trunc('year', current_date)::date;
  v_cut := coalesce(v_cut, current_date - 1);
  v_m := extract(month from v_cut)::int; v_d := extract(day from v_cut)::int;

  select jsonb_build_object(
    'cut', v_cut,
    'money', (select coalesce(jsonb_agg(r order by r.y, r.b), '[]') from (
        select extract(year from f.date)::int y, f.branch b,
               round(sum(f.sales_net)) net,
               round(sum(f.sales_net) filter (where f.date <= c.c)) net_y,
               count(distinct f.date) days
        from public.financial_totals f
        join public.oty_cuts(v_m, v_d) c on c.y = extract(year from f.date)::int
        where f.branch in ('SAA','KCA','MC','AQ') and f.date >= '2021-01-01'
        group by 1, 2) r),
    'visits', (select coalesce(jsonb_agg(r order by r.y, r.b), '[]') from (
        select extract(year from l.date)::int y, l.branch b,
               count(distinct l.sale_id) vis,
               count(distinct l.sale_id) filter (where l.date <= c.c) vis_y
        from public.sales_transaction_lines l
        join public.oty_cuts(v_m, v_d) c on c.y = extract(year from l.date)::int
        where l.branch in ('SAA','KCA','MC','AQ') and l.date >= '2021-01-01'
        group by 1, 2) r),
    'staff', (select coalesce(jsonb_agg(r order by r.y, r.b), '[]') from (
        select extract(year from p.date)::int y, p.branch b,
               sum(p.visits) stf,
               sum(p.visits) filter (where p.date <= c.c) stf_y
        from public.phorest_staff_daily p
        join public.oty_cuts(v_m, v_d) c on c.y = extract(year from p.date)::int
        where not p.is_total and p.branch in ('SAA','KCA','MC','AQ') and p.date >= '2021-01-01'
        group by 1, 2) r),
    -- Saadiyat + Khalifa City A only: the two branches with data in every year. Per day the branches were open.
    'seasons', (select coalesce(jsonb_agg(r order by r.sort, r.y), '[]') from (
        select s.year y, s.season, s.sort, s.start_date, s.end_date,
               round(sum(f.sales_net) / nullif(count(distinct f.date), 0)) per_day,
               count(distinct f.date) days
        from public.oty_seasons s
        left join public.financial_totals f
          on f.date between s.start_date and s.end_date and f.branch in ('SAA','KCA')
        group by s.year, s.season, s.sort, s.start_date, s.end_date) r),
    'reviews', (select coalesce(jsonb_agg(r order by r.y, r.b), '[]') from (
        select extract(year from g.review_date)::int y, g.b,
               count(*) n, round(avg(g.stars)::numeric, 2) st,
               count(*) filter (where g.review_date <= c.c) n_y,
               round((avg(g.stars) filter (where g.review_date <= c.c))::numeric, 2) st_y
        from (select case branch when 'Saadiyat, Abu Dhabi' then 'SAA' when 'Khalifa City A, Abu Dhabi' then 'KCA'
                                 when 'Motor City, Dubai' then 'MC' when 'Al Quoz, Dubai' then 'AQ' end b,
                     review_date, stars
              from public.google_reviews where review_date >= '2021-01-01') g
        join public.oty_cuts(v_m, v_d) c on c.y = extract(year from g.review_date)::int
        where g.b is not null
        group by 1, 2) r)
  ) into out;
  return out;
end;
$function$;
grant execute on function public.over_the_years() to authenticated;
grant execute on function public.oty_same_day(int, int, int) to authenticated;

-- Instagram by month from Jan 2025. Our posts and reels come from Metricool (from Mar 2025; stories are
-- left out, they only start in Jul 2026), collab posts and client tags from the Instagram syncs (from Jun and
-- Dec 2025). A month before a feed started is null in the page, not zero.
create or replace function public.over_the_years_ig()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Instagram is for Level 3 and above';
  end if;
  select jsonb_build_object(
    'start', jsonb_build_object('own', '2025-03', 'collab', '2025-06', 'tags', '2025-12'),
    'months', (select coalesce(jsonb_agg(r order by r.m), '[]') from (
        select to_char(mm, 'YYYY-MM') m,
          (select count(*) from public.metricool_posts p where p.network = 'instagram' and p.kind in ('post', 'reel')
             and p.posted_at >= mm and p.posted_at < mm + interval '1 month') own,
          (select count(*) from public.ig_collab_posts c
             where c.posted_at >= mm and c.posted_at < mm + interval '1 month') collab,
          (select count(*) from public.ig_tagged_posts t
             where t.posted_at >= mm and t.posted_at < mm + interval '1 month') tags
        from generate_series(date '2025-01-01', date_trunc('month', current_date)::date, interval '1 month') mm) r),
    'stories', (select coalesce(jsonb_agg(r order by r.m), '[]') from (
        select to_char(date_trunc('month', p.posted_at), 'YYYY-MM') m, count(*) n
        from public.metricool_posts p where p.network = 'instagram' and p.kind = 'story' group by 1) r)
  ) into out;
  return out;
end;
$function$;
grant execute on function public.over_the_years_ig() to authenticated;
