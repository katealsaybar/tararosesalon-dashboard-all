-- Glow Club Performance (Kate, 22 Oct 2026): how the Glow Club membership has done, for the Campaigns group in the sidebar.
-- Glow Club is a monthly membership Phorest sells as a sales line named "Glow club - SILVER (1250 AED)" (also "Glow Club membership - ..."),
-- three tiers: Silver 1,250, Gold 1,750, Platinum 2,800 (AED, VAT included, the till's total). A purchase is a line with a price;
-- every line that follows the price with " - <service>" at AED 0 is the member using a perk, so a use is counted, not priced.
-- A refund line ("... (Refund)") takes its amount off the month it happened. The first purchase a client ever made is a new member,
-- every later one is a renewal (a client who lets it lapse and comes back counts as a renewal too).
--
-- Numbers only, no client names (Level 3 and above, like the other money pages). Read-only over sales_transaction_lines.
-- Applied live 22 Oct 2026.

create or replace function public.glow_club_performance() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  with l as (
    select s.date, s.branch, lower(btrim(s.client_name)) as ck, s.item, s.total::numeric as total,
           (regexp_match(upper(s.item), '(SILVER|GOLD|PLATINUM)'))[1] as tier,
           case when s.item ~* '\(refund\)\s*$' then 'refund'
                when s.total > 0 and s.item !~* 'AED\s*\)\s*-' then 'buy'
                when s.item ~* 'AED\s*\)\s*-' then 'use' end as kind
    from public.sales_transaction_lines s
    where s.item ilike 'Glow club%'),
  buy as (select *, row_number() over (partition by ck order by date, item) as nth from l where kind = 'buy'),
  ref as (select * from l where kind = 'refund'),
  usel as (select *, btrim(regexp_replace(item, '^.*AED\s*\)\s*-\s*', '')) as service from l where kind = 'use'),
  ev as (select date, kind, total, null::bigint as nth from l where kind <> 'buy'
         union all select date, kind, total, nth from buy),
  mon as (
    select to_char(date, 'YYYY-MM') as k,
           count(*) filter (where kind = 'buy' and nth = 1) as new_m, count(*) filter (where kind = 'buy' and nth > 1) as renew,
           count(*) filter (where kind = 'buy') as sold,
           coalesce(sum(total) filter (where kind in ('buy', 'refund')), 0) as aed,
           count(*) filter (where kind = 'use') as uses
    from ev group by 1),
  tier as (
    select t as k, count(*) filter (where kind = 'buy') as sold, count(distinct ck) filter (where kind = 'buy') as members,
           coalesce(sum(total) filter (where kind in ('buy', 'refund')), 0) as aed, count(*) filter (where kind = 'use') as uses
    from (select tier as t, kind, ck, total from l where tier is not null) q group by 1),
  br as (
    select branch as k, count(*) filter (where kind = 'buy') as sold, count(distinct ck) filter (where kind = 'buy') as members,
           coalesce(sum(total) filter (where kind in ('buy', 'refund')), 0) as aed, count(*) filter (where kind = 'use') as uses
    from l group by 1),
  per as (select ck, count(*) as n, max(date) as last_buy from buy group by ck),
  act as (select distinct ck from l where kind in ('buy', 'use') and date >= current_date - 60),
  svc as (select service as k, count(*) as uses from usel group by 1 order by 2 desc limit 12)
  select jsonb_build_object(
    'at', now(),
    'first', (select min(date) from l), 'last_sale', (select max(date) from buy), 'last_use', (select max(date) from usel),
    'totals', jsonb_build_object(
      'sold', (select count(*) from buy), 'aed', (select coalesce(sum(total), 0) from l where kind in ('buy', 'refund')),
      'refunds', (select count(*) from ref), 'refund_aed', (select coalesce(-sum(total), 0) from ref),
      'members', (select count(*) from per), 'repeat', (select count(*) from per where n > 1),
      'renewals', (select count(*) from buy where nth > 1), 'uses', (select count(*) from usel),
      'active_60', (select count(*) from act),
      'bought_in_60', (select count(*) from per where last_buy >= current_date - 60)),
    'times', (select coalesce(jsonb_agg(jsonb_build_object('k', case when n >= 4 then '4+' else n::text end, 'members', c) order by case when n >= 4 then 4 else n end), '[]'::jsonb)
              from (select least(n, 4) as n, count(*) as c from per group by 1) q),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'new', new_m, 'renewals', renew, 'sold', sold, 'aed', aed, 'uses', uses) order by k), '[]'::jsonb) from mon),
    'by_tier', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'sold', sold, 'members', members, 'aed', aed, 'uses', uses)
                order by case k when 'SILVER' then 1 when 'GOLD' then 2 else 3 end), '[]'::jsonb) from tier),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'sold', sold, 'members', members, 'aed', aed, 'uses', uses) order by aed desc), '[]'::jsonb) from br),
    'services', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'uses', uses) order by uses desc), '[]'::jsonb) from svc))
  into out;
  return out;
end $$;

revoke all on function public.glow_club_performance() from public, anon;
grant execute on function public.glow_club_performance() to authenticated;
