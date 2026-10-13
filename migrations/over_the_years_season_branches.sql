-- Kate, 13 Oct 2026: Over the Years, season on season, one chart with a Where switch (Abu Dhabi, Dubai, side by side, or a
-- single branch) and year chips. The old 'seasons' key is Saadiyat + Khalifa City A added together, which cannot be split
-- afterwards, so over_the_years() now also returns 'season_br': one row per branch, season and year with the takings and the
-- open days held, plus the same figures up to the same calendar day as the last day of takings (tot_w, days_w), so a season
-- still running is read against the same days of last year. The old 'seasons' key stays (the page still reads the season
-- names and dates from it, and the live page reads it until the new code is deployed). Apply after
-- over_the_years_ledger_coverage.sql. Everything else in the function is the live definition, unchanged.

create or replace function public.over_the_years()
returns jsonb language plpgsql stable security invoker set search_path to 'public'
as $function$
declare out jsonb; v_cut date; v_m int; v_d int;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  select max(cut) into v_cut from public.oty_year_branch;
  v_m := extract(month from v_cut)::int; v_d := extract(day from v_cut)::int;
  select jsonb_build_object(
    'cut', v_cut,
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
        group by s.year, s.season, s.sort, s.start_date, s.end_date) r),
    'season_br', (select coalesce(jsonb_agg(r order by r.b, r.sort, r.y), '[]') from (
        select f.branch b, s.year y, s.season, s.sort,
               round(sum(f.sales_net)) tot, count(distinct f.date) days,
               round(sum(f.sales_net) filter (where f.date <= public.oty_same_day(s.year, v_m, v_d))) tot_w,
               count(distinct f.date) filter (where f.date <= public.oty_same_day(s.year, v_m, v_d)) days_w
        from public.oty_seasons s
        join public.financial_totals f on f.date between s.start_date and s.end_date and f.branch in ('SAA','KCA','MC','AQ')
        group by f.branch, s.year, s.season, s.sort) r)
  ) into out;
  return out;
end;
$function$;
grant execute on function public.over_the_years() to authenticated;
