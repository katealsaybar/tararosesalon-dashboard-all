-- Stripe vs Phorest (Kate, 9 Nov 2026). Belle checked four Stripe accounts by hand against Phorest; this reads both from our own copies.
-- Stripe side: table stripe_charges, filled by the stripe-sync edge function (restricted READ-ONLY keys in Edge Function Secrets
-- STRIPE_KCA, STRIPE_AQ, STRIPE_SAA, STRIPE_MC; nightly cron 'stripe-sync-nightly' 23:55 UTC; backfilled from 1 Aug 2026).
-- Phorest side: sales_transaction_lines, where a payment fragment S(amount) in payment_raw is the Stripe tender; clients by Phorest client id
-- (ckey) and their real email in phorest_client_emails. Applied live 9 Nov 2026 on gvijxenafoowajqktqvd.

create table if not exists public.stripe_charges (
  charge_id text primary key,
  account text not null,                 -- KCA, AQ, SAA, MC (the Stripe account the payment went into)
  created_utc timestamptz not null,
  dubai_date date not null,
  amount numeric not null,
  amount_refunded numeric not null default 0,
  currency text, status text, email text, name text, phone text, description text, statement_descriptor text,
  payment_intent text,
  synced_at timestamptz default now()
);
alter table public.stripe_charges enable row level security;   -- no policies: read only through the functions below
create index if not exists stripe_charges_acct_date on public.stripe_charges (account, dubai_date);

create or replace function public.stripe_nname(x text) returns text language sql immutable as $$
  select string_agg(t, ' ' order by t) from unnest(string_to_array(regexp_replace(lower(coalesce(x,'')), '[^a-z ]', ' ', 'g'), ' ')) t where t <> ''
$$;
create or replace function public.stripe_share_token(a text, b text) returns boolean language sql immutable as $$
  select exists (select 1 from unnest(string_to_array(coalesce(a,''), ' ')) x join unnest(string_to_array(coalesce(b,''), ' ')) y on x = y and length(x) > 2)
$$;

-- One row per succeeded Stripe charge in the window, with a status:
--   matched          a Phorest Stripe payment of the same amount within -1..+60 days, same client by email or full name
--   likely           same amount and part of the name, or the client's Phorest Stripe payment is larger (the deposit is part of it)
--   check            same amount but the name does not match, or the client visited but paid another way
--   wrong_branch     the same amount and the same client found at another salon
--   not_checked_out  no visit by this client since the payment (older than 14 days)
--   waiting          paid in the last 14 days (the appointment may still be ahead)
--   refunded         fully refunded in Stripe
-- A Phorest sale is given to one charge only (best tier, then closest date).
create or replace function public.stripe_match_core(p_from date default date '2026-10-01', p_to date default current_date)
returns table(charge_id text, account text, dubai_date date, created_utc timestamptz, amount numeric, amount_refunded numeric,
  client_name text, client_email text, status text, reason text, sale_id text, sale_date date, sale_branch text, sale_client text)
language sql stable security definer set search_path = public as $fn$
with
ph as (
  select l.branch, l.date, l.sale_id, l.ckey, max(l.client_name) cname, sum((m)[1]::numeric) amt
  from sales_transaction_lines l
  cross join lateral regexp_matches(coalesce(l.payment_raw,''), '(?:^|[^A-Z])S\(([0-9.]+)\)', 'g') m
  where l.date >= p_from - 1 and l.branch in ('KCA','AQ','SAA','MC')
  group by 1,2,3,4),
ns as (
  select ph.*, stripe_nname(ph.cname) nname,
    (select lower(e.email) from phorest_client_emails e where e.phorest_id = ph.ckey and e.email_status = 'real' limit 1) email
  from ph),
visits as (
  select l.branch, l.date, stripe_nname(max(l.client_name)) nname
  from sales_transaction_lines l
  where l.date >= p_from - 1 and l.branch in ('KCA','AQ','SAA','MC')
  group by l.branch, l.date, l.sale_id),
sc as (
  select c.*, stripe_nname(c.name) nname, lower(c.email) em2, c.amount - c.amount_refunded expected
  from stripe_charges c
  where c.status = 'succeeded' and c.dubai_date between p_from and p_to),
pairs as (
  select c.charge_id, ns.sale_id, ns.date sdate, ns.branch sbranch, ns.cname,
    case when ns.email is not null and ns.email = c.em2 then 1
         when ns.nname = c.nname then 2
         when stripe_share_token(c.nname, ns.nname) then 3 else 4 end tier,
    abs(ns.date - c.dubai_date) dd, c.created_utc
  from sc c join ns on ns.branch = c.account and c.expected > 0 and abs(ns.amt - c.expected) < 0.01
       and ns.date between c.dubai_date - 1 and c.dubai_date + 60),
best as (
  select distinct on (charge_id) * from pairs order by charge_id, tier, dd, sale_id),
kept as (
  select * from (select b.*, row_number() over (partition by sale_id order by tier, dd, created_utc) rn from best b) z where rn = 1),
other_amt as (
  select c.charge_id, (array_agg(ns.sale_id order by abs(ns.date - c.dubai_date)))[1] sale_id,
         (array_agg(ns.date order by abs(ns.date - c.dubai_date)))[1] sdate,
         (array_agg(ns.branch order by abs(ns.date - c.dubai_date)))[1] sbranch,
         (array_agg(ns.cname order by abs(ns.date - c.dubai_date)))[1] cname
  from sc c join ns on ns.branch <> c.account and c.expected > 0 and abs(ns.amt - c.expected) < 0.01
    and ns.date between c.dubai_date - 1 and c.dubai_date + 60
    and ((ns.email is not null and ns.email = c.em2) or ns.nname = c.nname)
  group by c.charge_id),
bigger as (
  select c.charge_id, (array_agg(ns.sale_id order by abs(ns.date - c.dubai_date)))[1] sale_id,
         (array_agg(ns.date order by abs(ns.date - c.dubai_date)))[1] sdate,
         (array_agg(ns.branch order by abs(ns.date - c.dubai_date)))[1] sbranch,
         (array_agg(ns.cname order by abs(ns.date - c.dubai_date)))[1] cname
  from sc c join ns on ns.branch = c.account and c.expected > 0 and ns.amt > c.expected + 0.01
       and ns.date between c.dubai_date - 1 and c.dubai_date + 60
       and ((ns.email is not null and ns.email = c.em2) or ns.nname = c.nname or stripe_share_token(c.nname, ns.nname))
  group by c.charge_id),
vis as (
  select c.charge_id,
    bool_or(v.branch = c.account) same_branch,
    bool_or(v.branch <> c.account) other_branch
  from sc c join visits v on v.date between c.dubai_date - 1 and c.dubai_date + 60 and (v.nname = c.nname or stripe_share_token(c.nname, v.nname))
  group by 1)
select c.charge_id, c.account, c.dubai_date, c.created_utc, c.amount, c.amount_refunded, c.name, c.email,
  case
    when c.expected <= 0 then 'refunded'
    when k.charge_id is not null and k.tier in (1,2) then 'matched'
    when k.charge_id is not null and k.tier = 3 then 'likely'
    when k.charge_id is not null then 'check'
    when oa.charge_id is not null then 'wrong_branch'
    when bg.charge_id is not null then 'likely'
    when coalesce(v.same_branch,false) then 'check'
    when coalesce(v.other_branch,false) then 'check'
    when c.dubai_date >= current_date - 14 then 'waiting'
    else 'not_checked_out' end,
  case
    when c.expected <= 0 then 'Fully refunded in Stripe'
    when k.charge_id is not null and k.tier = 1 then 'Same amount and the client email matches'
    when k.charge_id is not null and k.tier = 2 then 'Same amount and the full name matches'
    when k.charge_id is not null and k.tier = 3 then 'Same amount and part of the name matches, please confirm'
    when k.charge_id is not null then 'Same amount, but the name does not match'
    when oa.charge_id is not null then 'Same amount and the same client found at another salon'
    when bg.charge_id is not null then 'Probably part of a larger Stripe payment in Phorest, please confirm'
    when coalesce(v.same_branch,false) then 'Client visited this salon but paid another way, was the deposit counted?'
    when coalesce(v.other_branch,false) then 'Client visited another salon only, no Stripe payment of this amount'
    when c.dubai_date >= current_date - 14 then 'Paid in the last 14 days, appointment may still be ahead'
    else 'No visit found for this client since the payment' end,
  coalesce(k.sale_id, bg.sale_id, oa.sale_id), coalesce(k.sdate, bg.sdate, oa.sdate), coalesce(k.sbranch, bg.sbranch, oa.sbranch), coalesce(k.cname, bg.cname, oa.cname)
from sc c
left join kept k on k.charge_id = c.charge_id
left join other_amt oa on oa.charge_id = c.charge_id
left join bigger bg on bg.charge_id = c.charge_id and k.charge_id is null
left join vis v on v.charge_id = c.charge_id
$fn$;
revoke all on function public.stripe_match_core(date, date) from public, anon, authenticated;

-- Who may open it: Level 3 and 5, and anyone given the page 'stripedeposits' in dashboard_users.extra_pages (Belle, Level 2).
create or replace function public.stripe_guard() returns text language plpgsql stable security definer set search_path to 'public' as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.name is null or not (m.level in (3, 5) or 'stripedeposits' = any (coalesce(m.extra_pages, '{}'::text[]))) then
    raise exception 'Not open to your account';
  end if;
  return m.name;
end $$;

-- The matching is heavy (about 24 s), more than the 8 s a signed-in call is allowed, so it is worked out ahead and kept:
-- stripe_match_cache (one row per succeeded Stripe payment since 2 Aug 2026 with its status) and stripe_phorest_only_cache (Phorest Stripe lines since
-- 1 Oct 2026 that no Stripe payment explains and whose client has no Stripe payment at all in the 60 days before). Refreshed by cron
-- 'stripe-match-refresh-hourly' (minute 40) through stripe_match_refresh(); the 'waiting' status (paid in the last 14 days) moves on with each refresh.
create table if not exists public.stripe_match_cache (
  charge_id text primary key, account text not null, dubai_date date not null, created_utc timestamptz not null,
  amount numeric not null, amount_refunded numeric not null default 0, client_name text,
  status text not null, reason text, sale_id text, sale_date date, sale_branch text, sale_client text,
  computed_at timestamptz not null default now());
alter table public.stripe_match_cache enable row level security;
create index if not exists stripe_match_cache_date on public.stripe_match_cache (dubai_date);
create table if not exists public.stripe_phorest_only_cache (
  sale_id text primary key, branch text not null, date date not null, name text, amt numeric not null, computed_at timestamptz not null default now());
alter table public.stripe_phorest_only_cache enable row level security;

create or replace function public.stripe_match_refresh() returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare n1 int; n2 int;
begin
  delete from stripe_match_cache;
  insert into stripe_match_cache (charge_id, account, dubai_date, created_utc, amount, amount_refunded, client_name, status, reason, sale_id, sale_date, sale_branch, sale_client)
    select charge_id, account, dubai_date, created_utc, amount, amount_refunded, client_name, status, reason, sale_id, sale_date, sale_branch, sale_client
    from public.stripe_match_core(date '2026-08-02', current_date);
  get diagnostics n1 = row_count;
  delete from stripe_phorest_only_cache;
  insert into stripe_phorest_only_cache (sale_id, branch, date, name, amt)
    select ph.sale_id, ph.branch, ph.date, ph.cname, ph.amt
    from (select l.branch, l.date, l.sale_id, max(l.client_name) cname, sum((x)[1]::numeric) amt
          from sales_transaction_lines l
          cross join lateral regexp_matches(coalesce(l.payment_raw,''), '(?:^|[^A-Z])S\(([0-9.]+)\)', 'g') x
          where l.date >= date '2026-10-01' and l.branch in ('KCA','AQ','SAA','MC') group by 1,2,3) ph
    where ph.sale_id not in (select sale_id from stripe_match_cache where sale_id is not null)
      and not exists (select 1 from stripe_charges c where c.status = 'succeeded' and c.dubai_date between ph.date - 60 and ph.date + 1
                      and stripe_share_token(stripe_nname(c.name), stripe_nname(ph.cname)));
  get diagnostics n2 = row_count;
  return jsonb_build_object('charges', n1, 'phorest_only', n2, 'at', now());
end $fn$;
revoke all on function public.stripe_match_refresh() from public, anon, authenticated;
-- select cron.schedule('stripe-match-refresh-hourly', '40 * * * *', $$ select public.stripe_match_refresh(); $$);   -- applied live 9 Nov 2026

-- Everything the page draws, for the header's Period, read from the caches (13 ms). Stripe data starts 1 Aug 2026; the page's list starts 1 Oct 2026.
-- charges: every succeeded Stripe payment with its status. phorest_only: Stripe takings lines in Phorest that no Stripe payment explains.
-- salons: Stripe gross against Phorest's daily Stripe takings (financial_totals.pay_stripe) up to the last day Phorest has.
create or replace function public.stripe_vs_phorest_core(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $fn$
declare f date := greatest(coalesce(p_from, date '2026-10-01'), date '2026-10-01'); t date := coalesce(p_to, current_date); dt date; tt date; res jsonb;
begin
  select max(date) into dt from financial_totals where branch in ('KCA','AQ','SAA','MC');
  tt := least(t, dt);
  select jsonb_build_object(
    'ok', true, 'from', f, 'to', t, 'data_to', dt, 'synced_at', (select max(synced_at) from stripe_charges), 'computed_at', (select max(computed_at) from stripe_match_cache),
    'charges', coalesce((select jsonb_agg(jsonb_build_object('id', charge_id, 'acct', account, 'paid', dubai_date, 'at', created_utc, 'amt', amount,
        'ref', amount_refunded, 'name', client_name, 'status', status, 'why', reason, 'sale', sale_id, 'sdate', sale_date, 'sbranch', sale_branch,
        'sclient', sale_client) order by dubai_date desc, created_utc desc) from stripe_match_cache where dubai_date between f and t), '[]'::jsonb),
    'phorest_only', coalesce((select jsonb_agg(jsonb_build_object('sale', sale_id, 'branch', branch, 'date', date, 'name', name, 'amt', amt) order by date desc)
        from stripe_phorest_only_cache where date between f and tt), '[]'::jsonb),
    'salons', coalesce((select jsonb_object_agg(b.branch, jsonb_build_object(
        'stripe', coalesce((select sum(c.amount) from stripe_charges c where c.account = b.branch and c.status = 'succeeded' and c.dubai_date between f and tt), 0),
        'n', coalesce((select count(*) from stripe_charges c where c.account = b.branch and c.status = 'succeeded' and c.dubai_date between f and tt), 0),
        'phorest', coalesce((select sum(ft.pay_stripe) from financial_totals ft where ft.branch = b.branch and ft.date between f and tt), 0)))
        from (values ('KCA'), ('AQ'), ('SAA'), ('MC')) as b(branch)), '{}'::jsonb)
  ) into res;
  return res;
end $fn$;
revoke all on function public.stripe_vs_phorest_core(date, date) from public, anon, authenticated;

create or replace function public.stripe_vs_phorest(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare who text := public.stripe_guard();
begin
  return public.stripe_vs_phorest_core(p_from, p_to);
end $$;
grant execute on function public.stripe_vs_phorest(date, date) to authenticated;
