-- Kate, 13 Oct 2026: Over the Years, "What each year has behind it". The Ledgers row was hardcoded to 2025 onwards
-- in over-the-years.js, so it stayed grey for 2022, 2023 and 2024 after those ledgers were backfilled. The page now
-- reads how many days of ledger each year and branch really holds (branch_staff_daily, distinct dates up to today)
-- and compares them with the days Phorest has for the same branch.
--
-- Counting those live took about 3 seconds, so it goes into the hourly cache table like everything else on the page:
-- oty_year_branch gets led_days, oty_refresh() fills it, over_the_years() returns it as 'ledger' (y, b, led, days).
-- Apply after over_the_years_cache.sql. Both functions are otherwise the live definitions, unchanged.

alter table public.oty_year_branch add column if not exists led_days int;

create or replace function public.oty_refresh()
returns void language plpgsql security definer set search_path to 'public' set work_mem to '128MB'
as $function$
declare v_cut date; v_m int; v_d int;
begin
  select max(date) into v_cut from public.financial_totals where date >= date_trunc('year', current_date)::date;
  v_cut := coalesce(v_cut, current_date - 1);
  v_m := extract(month from v_cut)::int; v_d := extract(day from v_cut)::int;

  create temp table _oty on commit drop as
  with c as (select * from public.oty_cuts(v_m, v_d)),
  m as (select extract(year from f.date)::int y, f.branch b, round(sum(f.sales_net)) net,
               round(sum(f.sales_net) filter (where f.date <= c.c)) net_y, count(distinct f.date)::int days
        from public.financial_totals f join c on c.y = extract(year from f.date)::int
        where f.branch in ('SAA','KCA','MC','AQ','FRT') and f.date >= '2021-01-01' group by 1, 2),
  v as (select extract(year from l.date)::int y, l.branch b, count(distinct l.sale_id)::int vis,
               count(distinct l.sale_id) filter (where l.date <= c.c)::int vis_y
        from public.sales_transaction_lines l join c on c.y = extract(year from l.date)::int
        where l.branch in ('SAA','KCA','MC','AQ','FRT') and l.date >= '2021-01-01' group by 1, 2),
  s as (select extract(year from p.date)::int y, p.branch b, sum(p.visits)::int stf,
               (sum(p.visits) filter (where p.date <= c.c))::int stf_y
        from public.phorest_staff_daily p join c on c.y = extract(year from p.date)::int
        where not p.is_total and p.branch in ('SAA','KCA','MC','AQ','FRT') and p.date >= '2021-01-01' group by 1, 2),
  r as (select extract(year from g.review_date)::int y, g.b, count(*)::int rev_n, round(avg(g.stars)::numeric, 2) rev_st,
               (count(*) filter (where g.review_date <= c.c))::int rev_n_y,
               round((avg(g.stars) filter (where g.review_date <= c.c))::numeric, 2) rev_st_y
        from (select case branch when 'Saadiyat, Abu Dhabi' then 'SAA' when 'Khalifa City A, Abu Dhabi' then 'KCA'
                                 when 'Motor City, Dubai' then 'MC' when 'Al Quoz, Dubai' then 'AQ' end b, review_date, stars
              from public.google_reviews where review_date >= '2021-01-01') g
        join c on c.y = extract(year from g.review_date)::int where g.b is not null group by 1, 2),
  -- days of branch ledger held, up to today (the ledger also carries empty roster rows for days still to come)
  g as (select extract(year from d.date)::int y, d.branch b, count(distinct d.date)::int led_days
        from public.branch_staff_daily d
        where d.branch in ('SAA','KCA','MC','AQ','FRT') and d.date >= '2021-01-01' and d.date <= current_date group by 1, 2),
  k as (select y, b from m union select y, b from v union select y, b from s union select y, b from r union select y, b from g)
  select k.y, k.b, m.net, m.net_y, m.days, v.vis, v.vis_y, s.stf, s.stf_y, r.rev_n, r.rev_st, r.rev_n_y, r.rev_st_y, g.led_days
  from k left join m using (y, b) left join v using (y, b) left join s using (y, b) left join r using (y, b) left join g using (y, b);

  insert into public.oty_year_branch (y, b, net, net_y, days, vis, vis_y, stf, stf_y, rev_n, rev_st, rev_n_y, rev_st_y, led_days, cut, refreshed_at)
  select y, b, net, net_y, days, vis, vis_y, stf, stf_y, rev_n, rev_st, rev_n_y, rev_st_y, led_days, v_cut, now() from _oty
  on conflict (y, b) do update set net = excluded.net, net_y = excluded.net_y, days = excluded.days, vis = excluded.vis,
    vis_y = excluded.vis_y, stf = excluded.stf, stf_y = excluded.stf_y, rev_n = excluded.rev_n, rev_st = excluded.rev_st,
    rev_n_y = excluded.rev_n_y, rev_st_y = excluded.rev_st_y, led_days = excluded.led_days, cut = excluded.cut, refreshed_at = excluded.refreshed_at;
  delete from public.oty_year_branch o where not exists (select 1 from _oty t where t.y = o.y and t.b = o.b);
end;
$function$;
revoke all on function public.oty_refresh() from public, anon, authenticated;

create or replace function public.over_the_years()
returns jsonb language plpgsql stable security invoker set search_path to 'public'
as $function$
declare out jsonb;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  select jsonb_build_object(
    'cut', (select max(cut) from public.oty_year_branch),
    'refreshed_at', (select max(refreshed_at) from public.oty_year_branch),
    'money', (select coalesce(jsonb_agg(jsonb_build_object('y', y, 'b', b, 'net', net, 'net_y', net_y, 'days', days) order by y, b), '[]') from public.oty_year_branch where net is not null),
    'visits', (select coalesce(jsonb_agg(jsonb_build_object('y', y, 'b', b, 'vis', vis, 'vis_y', vis_y) order by y, b), '[]') from public.oty_year_branch where vis is not null),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('y', y, 'b', b, 'stf', stf, 'stf_y', stf_y) order by y, b), '[]') from public.oty_year_branch where stf is not null),
    'reviews', (select coalesce(jsonb_agg(jsonb_build_object('y', y, 'b', b, 'n', rev_n, 'st', rev_st, 'n_y', rev_n_y, 'st_y', rev_st_y) order by y, b), '[]') from public.oty_year_branch where rev_n is not null),
    'ledger', (select coalesce(jsonb_agg(jsonb_build_object('y', y, 'b', b, 'led', led_days, 'days', days) order by y, b), '[]') from public.oty_year_branch where led_days is not null),
    'seasons', (select coalesce(jsonb_agg(r order by r.sort, r.y), '[]') from (
        select s.year y, s.season, s.sort, s.start_date, s.end_date,
               round(sum(f.sales_net) / nullif(count(distinct f.date), 0)) per_day, count(distinct f.date) days
        from public.oty_seasons s
        left join public.financial_totals f on f.date between s.start_date and s.end_date and f.branch in ('SAA','KCA')
        group by s.year, s.season, s.sort, s.start_date, s.end_date) r)
  ) into out;
  return out;
end;
$function$;
grant execute on function public.over_the_years() to authenticated;

select public.oty_refresh();
