-- Kate, 14 Oct 2026: Marasy (MRY) reaches the rest of Over the Years. over_the_years_marasy.sql (earlier today) took it into the
-- year summary only. This file takes it into the other three places that still listed four or five branches by name:
--   oty_refresh()        the ledger-days subselect (g) now includes MRY, so its ledger days count the day its 2021 and 2022
--                        ledgers are loaded. Everything else in it is as it was.
--   oty_month_refresh()  both subselects include MRY, so oty_month_branch carries Marasy's months (Jul 2021 to Dec 2022) for the
--                        month grid. A finished month under 10 open days still counts as not trading, which is done in the page.
--   over_the_years()     'season_br' includes MRY, so season on season has Marasy's per-season takings. The old 'seasons'
--                        key stays Saadiyat + Khalifa City A on purpose: it is the like-for-like line.
-- Written from the live function bodies (pg_get_functiondef, 14 Oct 2026), not from the older migration files, which differ.
-- Additive: the page that is live today ignores MRY rows in all three. Applied to gvijxenafoowajqktqvd.

CREATE OR REPLACE FUNCTION public.oty_refresh()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '128MB'
AS $function$
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
        where f.branch in ('SAA','KCA','MC','AQ','FRT','MRY') and f.date >= '2021-01-01' group by 1, 2),
  v as (select extract(year from l.date)::int y, l.branch b, count(distinct l.sale_id)::int vis,
               count(distinct l.sale_id) filter (where l.date <= c.c)::int vis_y
        from public.sales_transaction_lines l join c on c.y = extract(year from l.date)::int
        where l.branch in ('SAA','KCA','MC','AQ','FRT','MRY') and l.date >= '2021-01-01' group by 1, 2),
  s as (select extract(year from p.date)::int y, p.branch b, sum(p.visits)::int stf,
               (sum(p.visits) filter (where p.date <= c.c))::int stf_y
        from public.phorest_staff_daily p join c on c.y = extract(year from p.date)::int
        where not p.is_total and p.branch in ('SAA','KCA','MC','AQ','FRT','MRY') and p.date >= '2021-01-01' group by 1, 2),
  r as (select extract(year from g.review_date)::int y, g.b, count(*)::int rev_n, round(avg(g.stars)::numeric, 2) rev_st,
               (count(*) filter (where g.review_date <= c.c))::int rev_n_y,
               round((avg(g.stars) filter (where g.review_date <= c.c))::numeric, 2) rev_st_y
        from (select case branch when 'Saadiyat, Abu Dhabi' then 'SAA' when 'Khalifa City A, Abu Dhabi' then 'KCA'
                                 when 'Motor City, Dubai' then 'MC' when 'Al Quoz, Dubai' then 'AQ' end b, review_date, stars
              from public.google_reviews where review_date >= '2021-01-01') g
        join c on c.y = extract(year from g.review_date)::int where g.b is not null group by 1, 2),
  g as (select extract(year from d.date)::int y, d.branch b, count(distinct d.date)::int led_days
        from public.branch_staff_daily d
        where d.branch in ('SAA','KCA','MC','AQ','FRT','MRY') and d.date >= '2021-01-01' and d.date <= current_date group by 1, 2),
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

CREATE OR REPLACE FUNCTION public.oty_month_refresh()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '128MB'
AS $function$
declare v_cut date;
begin
  select max(date) into v_cut from public.financial_totals where date >= date_trunc('year', current_date)::date;
  v_cut := coalesce(v_cut, current_date - 1);

  create temp table _otym on commit drop as
  with m as (select extract(year from f.date)::int y, extract(month from f.date)::int m, f.branch b,
                    round(sum(f.sales_net)) net, (count(distinct f.date) filter (where f.sales_net > 0))::int days
             from public.financial_totals f
             where f.branch in ('SAA','KCA','MC','AQ','MRY') and f.date >= '2021-01-01' group by 1, 2, 3),
  s as (select extract(year from p.date)::int y, extract(month from p.date)::int m, p.branch b, sum(p.visits)::int stf
        from public.phorest_staff_daily p
        where not p.is_total and p.branch in ('SAA','KCA','MC','AQ','MRY') and p.date >= '2021-01-01' group by 1, 2, 3)
  select m.y, m.m, m.b, m.net, m.days, s.stf from m left join s using (y, m, b);

  insert into public.oty_month_branch (y, m, b, net, days, stf, cut, refreshed_at)
  select y, m, b, net, days, stf, v_cut, now() from _otym
  on conflict (y, m, b) do update set net = excluded.net, days = excluded.days, stf = excluded.stf,
    cut = excluded.cut, refreshed_at = excluded.refreshed_at;
  delete from public.oty_month_branch o where not exists (select 1 from _otym t where t.y = o.y and t.m = o.m and t.b = o.b);
end;
$function$;

CREATE OR REPLACE FUNCTION public.over_the_years()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
        join public.financial_totals f on f.date between s.start_date and s.end_date and f.branch in ('SAA','KCA','MC','AQ','MRY')
        group by f.branch, s.year, s.season, s.sort) r)
  ) into out;
  return out;
end;
$function$;
