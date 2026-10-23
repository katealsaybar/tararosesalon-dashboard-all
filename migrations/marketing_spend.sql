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

-- The page's one call, marketing_spend_report(), is defined in marketing_spend_cache.sql (run that file last). The first version
-- counted new clients and the year-one value from every sales line on each call, which took 12 to 16 seconds cold and hit
-- Supabase's 8 second limit; it now reads them from marketing_spend_cache, rebuilt nightly by marketing_spend_refresh().
-- Order: marketing_spend.sql, marketing_spend_agency.sql, marketing_spend_cache.sql.
