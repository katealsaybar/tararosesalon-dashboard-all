-- Active Deals Performance (Kate, 23 Oct 2026): how many times each deal on the active deals brochure
-- (promo.tararosesalon.com/active-deals-brochure) was bought at the till, per branch and day, for the Campaigns group in the sidebar.
-- The deals are not campaigns with their own table: Phorest rings a package up as ONE sale made of component lines named
-- "<offer name> - <component>", so a sale is a distinct branch + date + sale id and we count sales, not lines.
--   Blonding Package 999 / Classic Balayage Package 999 on the slides are Phorest's "Full Blonde Package" / "Full Balayage Package"
--     (same price, same components; name still to confirm with Emma). 2026 only (899 before), and only sales that contain the main
--     line (the foils or the balayage), so a component rung up on its own later (a redemption) is not a sale.
--   599 facial + gelish counts only a sale that has the manicure line, for the same reason (a lone facial line is a redemption).
--   Polish & Pamper 350 and ADS Hydrafacial + Blow dry (the older 499) are older look-alikes, returned so the page can show them apart.
-- AED is the till's total (VAT included) for the offer's own lines; a refund line comes off the day it was given (one partial refund
-- of AED 613 at Saadiyat on 11 Mar 2026). A refunded package still counts as one sale.
-- Not traceable by name, so not here: Refresh Balayage 499, Extension Care (free), Mix and Match (no sales yet), and the 25% off new
-- clients (it leaves no item name, and the same flat 25% runs on hair lines every month).
--
-- Returns {at, rows:[[offer, branch, date, sales, aed], ...]}: one row per offer, branch and day (about 170), numbers only, no client
-- names, so the page can filter by any Branch and Period the masthead offers without asking again. Level 2 and above (Accounts, the
-- coordinators and up), like Wellness Voucher Performance. Read-only over sales_transaction_lines.

create or replace function public.active_deals_performance() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  with fam as (
    select s.branch, s.date, s.sale_id, s.item, s.total::numeric as total,
           (s.item ~* '\(refund\)\s*$') as refund,
           case
             when s.item ilike 'Full Blonde Package - %' and s.date >= date '2026-01-01' then 'Blonding'
             when s.item ilike 'Full Balayage Package - %' and s.date >= date '2026-01-01' then 'Balayage'
             when s.item ilike 'Refresh Blonde package%' then 'RefreshBlonde'
             when s.item ilike 'Brunette Package - 599%' then 'Brunette'
             when s.item ilike 'Signature Sunkissed brunette%' then 'Sunkissed'
             when s.item ilike 'Haircut with Treatment - 300%' then 'P300'
             when s.item ilike 'Haircut with Treatment - 450%' then 'P450'
             when s.item ilike '350 AED Package - Gelish combo%' then 'P350'
             when s.item ilike '599 AED Package -Deep cleansing%' then 'P599'
             when s.item ilike 'ADS -Hydrafacial + Blow dry%' then 'ADS499'
             when s.item ilike 'Polish & Pamper (AED 350)%' then 'Polish350'
           end as offer
    from public.sales_transaction_lines s
    where s.item ilike 'Full Blonde Package - %' or s.item ilike 'Full Balayage Package - %' or s.item ilike 'Refresh Blonde package%'
       or s.item ilike 'Brunette Package - 599%' or s.item ilike 'Signature Sunkissed brunette%' or s.item ilike 'Haircut with Treatment - 300%'
       or s.item ilike 'Haircut with Treatment - 450%' or s.item ilike '350 AED Package - Gelish combo%'
       or s.item ilike '599 AED Package -Deep cleansing%' or s.item ilike 'ADS -Hydrafacial + Blow dry%' or s.item ilike 'Polish & Pamper (AED 350)%'),
  keys as (
    select distinct branch, date, sale_id, offer from fam
    where offer is not null and not refund and (
          (offer = 'Blonding' and item ilike 'Full Blonde Package - FH Foils%')
       or (offer = 'Balayage' and item ilike 'Full Balayage Package - Full Balayage-%')
       or (offer = 'P599' and item ilike '%- Manicure')
       or offer not in ('Blonding', 'Balayage', 'P599'))),
  cnt as (select offer, branch, date, count(*) as n from keys group by 1, 2, 3),
  amt as (
    select f.offer, f.branch, f.date, sum(f.total) as t from fam f
    where f.offer is not null
      and (f.refund or exists (select 1 from keys k where k.branch = f.branch and k.date = f.date and k.sale_id = f.sale_id and k.offer = f.offer))
    group by 1, 2, 3),
  r as (
    select coalesce(c.offer, a.offer) as offer, coalesce(c.branch, a.branch) as branch, coalesce(c.date, a.date) as date,
           coalesce(c.n, 0) as n, round(coalesce(a.t, 0), 2) as t
    from cnt c full join amt a on a.offer = c.offer and a.branch = c.branch and a.date = c.date)
  select jsonb_build_object('at', now(),
    'rows', coalesce(jsonb_agg(jsonb_build_array(offer, branch, date, n, t) order by date, offer, branch), '[]'::jsonb))
  into out from r;
  return out;
end $$;

revoke all on function public.active_deals_performance() from public, anon;
grant execute on function public.active_deals_performance() to authenticated;

-- The item filter is a full scan of sales_transaction_lines (about 460k lines, seconds) without this: a partial index over just the
-- brochure lines, the same way glow_club_performance() got one. The WHERE above repeats this predicate so the planner uses it.
create index if not exists stl_active_deals_idx on public.sales_transaction_lines (date)
  where item ilike 'Full Blonde Package - %' or item ilike 'Full Balayage Package - %' or item ilike 'Refresh Blonde package%'
     or item ilike 'Brunette Package - 599%' or item ilike 'Signature Sunkissed brunette%' or item ilike 'Haircut with Treatment - 300%'
     or item ilike 'Haircut with Treatment - 450%' or item ilike '350 AED Package - Gelish combo%'
     or item ilike '599 AED Package -Deep cleansing%' or item ilike 'ADS -Hydrafacial + Blow dry%' or item ilike 'Polish & Pamper (AED 350)%';
