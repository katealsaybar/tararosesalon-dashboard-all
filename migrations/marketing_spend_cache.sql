-- Marketing Spend, speed fix (Kate, 23 Oct 2026). Applied live 23 Oct 2026 after marketing_spend_agency.sql.
-- The first version counted new clients and the year-one value from all 458,000 sales lines on every call: 12 to 16 seconds cold,
-- and Supabase cuts a dashboard call off at 8 seconds, so the page showed "didn't load" (it worked at first only because the
-- cache was warm). The two heavy numbers now live in marketing_spend_cache and are rebuilt by marketing_spend_refresh(), which
-- pg_cron runs at 03:45 Dubai (23:45 UTC) after the nightly syncs. The report only reads them, so it takes well under a second.
-- New clients for the current month are therefore as of the last refresh (last night).
create table if not exists marketing_spend_cache (
  key          text primary key,
  value        jsonb not null,
  refreshed_at timestamptz not null default now()
);
alter table marketing_spend_cache enable row level security;   -- no policies: read through marketing_spend_report only

create or replace function public.marketing_spend_refresh()
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  set local statement_timeout = '180s';
  with firsts as (
    select lower(trim(client_name)) c, min(date) first_d
    from sales_transaction_lines
    where client_name is not null and trim(client_name) <> '' and lower(client_name) !~ 'walk|^no client|unknown'
    group by 1
  ), nc as (
    select date_trunc('month', first_d)::date mo, count(*) n from firsts group by 1
  )
  insert into marketing_spend_cache (key, value, refreshed_at)
  select 'new_clients', coalesce(jsonb_object_agg(to_char(mo, 'YYYY-MM-DD'), n), '{}'::jsonb), now() from nc
  on conflict (key) do update set value = excluded.value, refreshed_at = excluded.refreshed_at;

  -- 12-month value of clients whose first visit was Jan to Sep 2025 (their year is complete). Net sales, not profit;
  -- voucher and deposit lines are left out (money moved, not a service).
  with firsts as (
    select lower(trim(client_name)) c, min(date) first_d
    from sales_transaction_lines
    where client_name is not null and trim(client_name) <> '' and lower(client_name) !~ 'walk|^no client|unknown'
    group by 1
  ), cohort as (
    select f.c, f.first_d,
           coalesce(sum(l.net) filter (where l.date < f.first_d + 365), 0) net12,
           count(distinct l.date) filter (where l.date < f.first_d + 365) visits12
    from firsts f
    join sales_transaction_lines l on lower(trim(l.client_name)) = f.c and l.item !~* 'voucher|deposit'
    where f.first_d between date '2025-01-01' and date '2025-09-30'
    group by f.c, f.first_d
  )
  insert into marketing_spend_cache (key, value, refreshed_at)
  select 'ltv', jsonb_build_object('clients', count(*), 'avg_net_12m', round(avg(net12)::numeric), 'median_net_12m',
                round((percentile_cont(0.5) within group (order by net12))::numeric), 'avg_visits_12m', round(avg(visits12)::numeric, 2),
                'pct_returned', round(100.0 * avg((visits12 > 1)::int), 1), 'cohort', '2025-01 to 2025-09'), now() from cohort
  on conflict (key) do update set value = excluded.value, refreshed_at = excluded.refreshed_at;
end;
$function$;
revoke all on function public.marketing_spend_refresh() from public, anon, authenticated;

create or replace function public.marketing_spend_report()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Marketing Spend is for Level 3 and above';
  end if;
  with months as (
    select generate_series(date '2025-01-01', date_trunc('month', current_date)::date, interval '1 month')::date mo
  ), g as (
    select date_trunc('month', date)::date mo, sum(cost) api from google_ads_daily group by 1
  ), gs as (
    select date_trunc('month', period_start)::date mo, billed_aed from google_ads_statements
  ), mbest as (
    select distinct on (date) date, spend, source from meta_ads_daily order by date, (source = 'invoice') desc
  ), mt as (
    select date_trunc('month', date)::date mo, sum(spend) spend,
           count(*) filter (where source = 'invoice') inv_days, count(*) filter (where source = 'metricool') mc_days
    from mbest group by 1
  ), ag as (
    select month mo, sum(amount_aed) agency from agency_fees group by 1
  ), nc as (
    select e.key::date mo, e.value::int n
    from marketing_spend_cache c, jsonb_each_text(c.value) e where c.key = 'new_clients'
  ), rows as (
    select months.mo,
           round(coalesce(gs.billed_aed, g.api, 0)::numeric, 2) google,
           round(coalesce(g.api, 0)::numeric, 2) google_api,
           gs.billed_aed is not null google_is_statement,
           round(coalesce(mt.spend, 0)::numeric, 2) meta,
           coalesce(mt.inv_days, 0) meta_invoice_days, coalesce(mt.mc_days, 0) meta_metricool_days,
           ag.agency,
           coalesce(nc.n, 0) new_clients
    from months left join g using (mo) left join gs using (mo) left join mt using (mo) left join ag using (mo) left join nc using (mo)
  )
  select jsonb_build_object(
    'months', (select coalesce(jsonb_agg(to_jsonb(r) order by r.mo), '[]') from rows r),
    'ltv', (select value from marketing_spend_cache where key = 'ltv'),
    'counted_at', (select refreshed_at from marketing_spend_cache where key = 'new_clients'),
    'meta_first_day', (select min(date) from meta_ads_daily),
    'meta_invoice_last_day', (select max(date) from meta_ads_daily where source = 'invoice'),
    'agency_last_month', (select max(month) from agency_fees),
    'sync', (select to_jsonb(s) from sync_health s where name = 'meta-ads-sync')
  ) into out;
  return out;
end;
$function$;
revoke all on function public.marketing_spend_report() from public, anon;
grant execute on function public.marketing_spend_report() to authenticated;

-- Nightly rebuild, 03:45 Dubai.
select cron.schedule('marketing-spend-refresh', '45 23 * * *', $$ select public.marketing_spend_refresh(); $$);
