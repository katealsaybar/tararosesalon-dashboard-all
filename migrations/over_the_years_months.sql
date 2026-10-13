-- Kate, 13 Oct 2026: Over the Years, month by month. Coach Emma wants to see whether the shape of the year (which
-- months are strong, which are weak) repeats across the six years, because the pattern is not the same each year.
-- The page needs takings, open days and clients per staff for every month, branch by branch, so it can add a region
-- up itself (Abu Dhabi, Dubai, all four) and work out each month against its own year's average.
--
--   oty_month_branch        a row per year, month and branch: net takings (net of VAT, financial_totals.sales_net),
--                           open days (days with takings), and clients per staff (phorest_staff_daily.visits on the
--                           staff rows, a client counted once per staff member, the page's default). Follows the
--                           branch scope like oty_year_branch: a branch login reads only its own branch.
--   oty_month_refresh()     rebuilds the table. Security definer, not callable by the app roles; pg_cron runs it
--                           hourly (minute 23, clear of oty-refresh-hourly at 17), same cadence and reason as
--                           oty_refresh(): summing six years of daily rows on every open would be too slow.
--   over_the_years_months() the page's read: { cut, refreshed_at, months: [{y, m, b, net, days, stf}] }.
--
-- The four UAE branches only (SAA, KCA, MC, AQ). Fratelli is left off this section, as it is off the season chart.
-- A month in progress holds the days so far; the page reads it against the same days of last year. Apply after
-- over_the_years_season_branches.sql. Additive: nothing existing is changed.

create table if not exists public.oty_month_branch (
  y int not null, m int not null, b text not null,
  net numeric, days int, stf int,
  cut date not null, refreshed_at timestamptz not null default now(),
  primary key (y, m, b)
);
alter table public.oty_month_branch enable row level security;
drop policy if exists oty_month_branch_read on public.oty_month_branch;
create policy oty_month_branch_read on public.oty_month_branch for select to authenticated
  using ((select public.is_dashboard_user()) and ((select public.dashboard_scope()) is null or b = (select public.dashboard_scope())));

create or replace function public.oty_month_refresh()
returns void language plpgsql security definer set search_path to 'public' set work_mem to '128MB'
as $function$
declare v_cut date;
begin
  select max(date) into v_cut from public.financial_totals where date >= date_trunc('year', current_date)::date;
  v_cut := coalesce(v_cut, current_date - 1);

  create temp table _otym on commit drop as
  with m as (select extract(year from f.date)::int y, extract(month from f.date)::int m, f.branch b,
                    round(sum(f.sales_net)) net, (count(distinct f.date) filter (where f.sales_net > 0))::int days
             from public.financial_totals f
             where f.branch in ('SAA','KCA','MC','AQ') and f.date >= '2021-01-01' group by 1, 2, 3),
  s as (select extract(year from p.date)::int y, extract(month from p.date)::int m, p.branch b, sum(p.visits)::int stf
        from public.phorest_staff_daily p
        where not p.is_total and p.branch in ('SAA','KCA','MC','AQ') and p.date >= '2021-01-01' group by 1, 2, 3)
  select m.y, m.m, m.b, m.net, m.days, s.stf from m left join s using (y, m, b);

  insert into public.oty_month_branch (y, m, b, net, days, stf, cut, refreshed_at)
  select y, m, b, net, days, stf, v_cut, now() from _otym
  on conflict (y, m, b) do update set net = excluded.net, days = excluded.days, stf = excluded.stf,
    cut = excluded.cut, refreshed_at = excluded.refreshed_at;
  delete from public.oty_month_branch o where not exists (select 1 from _otym t where t.y = o.y and t.m = o.m and t.b = o.b);
end;
$function$;
revoke all on function public.oty_month_refresh() from public, anon, authenticated;

create or replace function public.over_the_years_months()
returns jsonb language plpgsql stable security invoker set search_path to 'public'
as $function$
declare out jsonb;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  select jsonb_build_object(
    'cut', (select max(cut) from public.oty_month_branch),
    'refreshed_at', (select max(refreshed_at) from public.oty_month_branch),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('y', y, 'm', m, 'b', b, 'net', net, 'days', days, 'stf', stf) order by y, m, b), '[]')
               from public.oty_month_branch)
  ) into out;
  return out;
end;
$function$;
grant execute on function public.over_the_years_months() to authenticated;

select public.oty_month_refresh();
select cron.schedule('oty-month-refresh-hourly', '23 * * * *', 'select public.oty_month_refresh()');
