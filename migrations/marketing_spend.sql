-- Marketing Spend (Kate, 23 Oct 2026). Google and Meta ad spend by month beside the new clients the salons got,
-- so the page can say what a new client costs (CAC) and what one is worth (LTV).
--
-- Where the numbers come from:
--   Google Ads  google_ads_daily (the nightly API sync, from 1 Jan 2025) for every month, and for Nov 2025 to Jul 2026 the
--               month's Google statement in google_ads_statements (Drive: AD SPENDING / GOOGLE ADS SPEND), which is what the
--               card was charged, net of Google's invalid-activity credits. The report uses the statement where there is one.
--   Meta Ads    meta_ads_daily, two sources for one ad account (2213880582241991, AED):
--               'invoice'   the Paid payments in Drive (AD SPENDING / META ADS SPEND, Oct 2025 to Jul 2026), each spread over
--                           the dates its campaign lines cover. Failed and Pending payments are not spend: the Paid retry
--                           carries the same lines. Raw rows stay in meta_ads_invoices. Spend before the first invoice
--                           (25 Sep 2025) is not in Drive, so it is not here.
--               'metricool' the meta-ads-sync edge function (Metricool facebookads spend, account level, from 22 Apr 2026).
--                           Metricool matched the invoices within about 1 percent for May to Jul 2026, so it carries the
--                           days after the last invoice. A day with both takes the invoice.
--   New clients a client's first sale line by name in sales_transaction_lines. Names are all there is, so a respelt name
--               counts as new again. The till history starts May 2021, so only months from 2022 can be trusted.
--
-- Not in these numbers: the agency (Leaders in Digital), content, influencers, commissions, staff time, and a second Meta
-- account (169841546060598) that sent one funds receipt in Aug 2026. So this is paid-media CAC, not a full CAC.
create table if not exists meta_ads_invoices (
  transaction_id text primary key,
  invoice_no     text,
  paid_on        date    not null,
  amount_aed     numeric not null,
  status         text    not null,            -- Paid, Failed, Pending (only Paid is spend)
  split          boolean not null default false,
  folder_month   text,
  file_id        text,                        -- Drive file
  period_from    date,
  period_to      date,
  campaigns      jsonb,
  loaded_at      timestamptz not null default now()
);
create table if not exists meta_ads_daily (
  date      date    not null,
  source    text    not null check (source in ('invoice', 'metricool')),
  spend     numeric not null default 0,       -- AED
  synced_at timestamptz not null default now(),
  primary key (date, source)
);
create table if not exists google_ads_statements (
  period_start    date primary key,
  period_end      date    not null,
  billed_aed      numeric not null,           -- the statement's total new activity (net of credits)
  gross_aed       numeric,                    -- before the invalid-activity credits
  adjustments_aed numeric,
  payments_aed    numeric,
  statement_file  text,
  loaded_at       timestamptz not null default now()
);
-- The agency line (agency_fees, Leaders in Digital) is in marketing_spend_agency.sql; the function below already reads it.
alter table meta_ads_invoices    enable row level security;   -- no policies: read through marketing_spend_report only
alter table meta_ads_daily       enable row level security;
alter table google_ads_statements enable row level security;

-- One call for the page. Level 3 and above, like Google Ads.
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
  ), firsts as (
    select lower(trim(client_name)) c, min(date) first_d
    from sales_transaction_lines
    where client_name is not null and trim(client_name) <> '' and lower(client_name) !~ 'walk|^no client|unknown'
    group by 1
  ), nc as (
    select date_trunc('month', first_d)::date mo, count(*) n from firsts group by 1
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
  ), cohort as (
    -- 12-month value of clients whose first visit was Jan to Sep 2025 (their year is complete). Net sales, not profit;
    -- voucher and deposit lines are left out (money moved, not a service).
    select f.c, f.first_d,
           coalesce(sum(l.net) filter (where l.date < f.first_d + 365), 0) net12,
           count(distinct l.date) filter (where l.date < f.first_d + 365) visits12
    from firsts f
    join sales_transaction_lines l on lower(trim(l.client_name)) = f.c and l.item !~* 'voucher|deposit'
    where f.first_d between date '2025-01-01' and date '2025-09-30'
    group by f.c, f.first_d
  )
  select jsonb_build_object(
    'months', (select coalesce(jsonb_agg(to_jsonb(r) order by r.mo), '[]') from rows r),
    'ltv', (select jsonb_build_object('clients', count(*), 'avg_net_12m', round(avg(net12)::numeric), 'median_net_12m',
                    round((percentile_cont(0.5) within group (order by net12))::numeric), 'avg_visits_12m', round(avg(visits12)::numeric, 2),
                    'pct_returned', round(100.0 * avg((visits12 > 1)::int), 1), 'cohort', '2025-01 to 2025-09') from cohort),
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
