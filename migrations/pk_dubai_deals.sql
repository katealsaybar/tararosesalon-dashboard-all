-- Dubai Daily Deals Performance (Kate, 26 Nov 2026): the seven offers on the August 2026 Dubai Daily Deals slides (a partner app, Dubai only: Al Quoz and
-- Motor City). Tone Reset (from AED 130), Blowdry Bundles (from AED 240), Keratin Smoothening Treatment (from AED 620), Colour Packages (from AED 380),
-- Treatment and Blowdry Sessions (from AED 150), Mix and Match (AED 300), New clients 3 visit offer (25% off, then a free toner, then a free treatment).
-- WHAT IS COUNTED: only Tone Reset leaves its own name at the till ("Tone reset (short) - Classic Toner -F/S" and "... - Extra Long Blowdry", AED 130 in all).
-- The other six leave no name (an app voucher is rung as a discount, and a sale carries only the amount taken off, not the discount's name), so they show
-- no sale. Searched at Al Quoz and Motor City by component and by price; nothing matched, so there is NO price test on this page. A sale is a distinct
-- branch + date + sale id and we count sales, not lines; a refund line comes off the sale; a sale counts only when its lines add up to more than AED 0.
-- Dubai only: Al Quoz (AQ) and Motor City (MC). Saadiyat and Khalifa City A (Abu Dhabi) are not part of this app.
-- OVERLAP (Kate, 26 Nov 2026, "yes ganyan"): the seven packages of Phorest's DUBAI DEALS category are KEPT BY OTHER PAGES: Peaceful Pause, Polish & Pamper,
-- Gentle Escape, Recharge Ritual, Mindful Moments and Makeover Maintenance by Pamper Packages 2025, Brunette Package by Active Deals Performance. They are
-- returned apart as "others" (k, n, pl, page, sales, aed over Al Quoz and Motor City, all time) ONLY so this page can show a note "also counted on ...". They are
-- never in "packages", "clients", the headline or the Directory total.
--
-- Returns {at, clients, packages:[{k, n, pl, c, ct, cnt, sales, aed, clients, first, last}], others:[{k, n, pl, page, sales, aed}], rows:[[package, branch,
--   date, sale no, aed, client, lines]]}.
--   clients = distinct clients over the counted sales. rows (left out when p_summary is true) = one per sale; "client" is an opaque rank made inside the
--   query (1 = first client to buy), never the Phorest client id and never a name. lines = [[till line name, AED], ...].
-- p_summary = true returns only the totals (the Campaigns Directory calls this). Level 2 and above, like Active Deals Performance. Read-only over
-- sales_transaction_lines. Written 26 Nov 2026; applied 26 Nov 2026 (Supabase gvijxenafoowajqktqvd). Numbers equal the mockup exactly: 1 sale, AED 130,
-- 1 client (Tone Reset, Al Quoz, 18 Aug 2026). Others: Brunette 5 / AED 2,995, Polish & Pamper 4 / AED 1,239.75, Peaceful Pause 1 / AED 1,000, rest none.

create or replace function public.pk_dubai_deals(p_summary boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  with nm as (
    select s.branch, s.date, s.sale_id, s.client_id, s.item, s.total::numeric as total, 'TR'::text as o
    from public.sales_transaction_lines s
    where s.branch in ('AQ', 'MC') and s.item ~* '^tone reset'),
  al as (
    select o, branch, date, sale_id, min(client_id) as cid, sum(total) as aed from nm
    group by 1, 2, 3, 4 having sum(total) > 0),
  cn as (
    select cid, row_number() over (order by d1, cid) as n
    from (select cid, min(date) as d1 from al group by cid) x),
  sr as (
    select a.o, a.branch, a.date, a.sale_id, a.aed, a.cid, coalesce(cn.n, 0) as n,
           (select jsonb_agg(jsonb_build_array(l.item, round(l.total, 2)) order by l.item, l.total)
            from (select s2.item, s2.total::numeric as total from public.sales_transaction_lines s2
                  where s2.branch = a.branch and s2.date = a.date and s2.sale_id = a.sale_id
                    and (s2.item ~* '^tone reset' or s2.total::numeric = 0)) l) as lines
    from al a left join cn on cn.cid is not distinct from a.cid),
  pk as (
    select * from (values
      (1, 'TR',  'Tone Reset',                      'from AED 130',                  'ok', 'Exact'),
      (2, 'BB',  'Blowdry Bundles',                 'from AED 240',                  'na', 'Not found'),
      (3, 'KS',  'Keratin Smoothening Treatment',   'from AED 620',                  'na', 'Not found'),
      (4, 'CP',  'Colour Packages',                 'from AED 380',                  'na', 'Not found'),
      (5, 'TB',  'Treatment and Blowdry Sessions',  'from AED 150',                  'na', 'Not found'),
      (6, 'MM',  'Mix and Match',                   'AED 300',                       'na', 'Not found'),
      (7, 'NC',  'New clients 3 visit offer',       '25% off, then free toner, then free treatment', 'na', 'Not found')) v(ord, k, n, pl, c, ct)),
  st as (
    select o, count(*) as sales, sum(aed) as aed, count(distinct cid) as clients, min(date) as first, max(date) as last
    from al group by o),
  ot as (
    select case when s.item ~* '^peaceful pause' then 'PA'
                when s.item ~* '^mindful moment' then 'MIND'
                when s.item ~* '^brunette package' then 'BR'
                when s.item ~* '^gentle escape' then 'GE'
                when s.item ~* '^recharge ritual' then 'RR'
                when s.item ~* '^polish\s*(&|and)\s*pamper' then 'PP'
                else 'MK' end as k, s.branch, s.date, s.sale_id, s.total::numeric as total
    from public.sales_transaction_lines s
    where s.branch in ('AQ', 'MC')
      and s.item ~* '^(peaceful pause|mindful moment|brunette package|gentle escape|recharge ritual|polish\s*(&|and)\s*pamper|makeover maintenance|maintenance makeover)'),
  ots as (
    select k, count(*) as sales, sum(aed) as aed from (
      select k, branch, date, sale_id, sum(total) as aed from ot group by 1, 2, 3, 4 having sum(total) > 0) z group by k),
  ov as (
    select * from (values
      (1, 'PA',   'Peaceful Pause',       'AED 1,000', 'Pamper Packages 2025'),
      (2, 'MIND', 'Mindful Moments',      'AED 750',   'Pamper Packages 2025'),
      (3, 'BR',   'Brunette Package',     'AED 599',   'Active Deals Performance'),
      (4, 'GE',   'Gentle Escape',        'AED 420',   'Pamper Packages 2025'),
      (5, 'RR',   'Recharge Ritual',      'AED 450',   'Pamper Packages 2025'),
      (6, 'PP',   'Polish & Pamper',      'AED 350',   'Pamper Packages 2025'),
      (7, 'MK',   'Makeover Maintenance', 'AED 580',   'Pamper Packages 2025')) v(ord, k, n, pl, page))
  select jsonb_build_object('at', now(),
    'clients', (select count(distinct cid) from al),
    'packages', (select jsonb_agg(jsonb_build_object('k', pk.k, 'n', pk.n, 'pl', pk.pl, 'c', pk.c, 'ct', pk.ct, 'cnt', true, 'sales', coalesce(st.sales, 0),
                   'aed', round(coalesce(st.aed, 0), 2), 'clients', coalesce(st.clients, 0), 'first', st.first, 'last', st.last) order by pk.ord)
                 from pk left join st on st.o = pk.k),
    'others', (select jsonb_agg(jsonb_build_object('k', ov.k, 'n', ov.n, 'pl', ov.pl, 'page', ov.page, 'sales', coalesce(ots.sales, 0),
                   'aed', round(coalesce(ots.aed, 0), 2)) order by ov.ord)
                 from ov left join ots on ots.k = ov.k))
    || case when p_summary then '{}'::jsonb
            else jsonb_build_object('rows', coalesce((select jsonb_agg(jsonb_build_array(o, branch, date, sale_id, round(aed, 2), n, coalesce(lines, '[]'::jsonb))
                   order by date, branch, sale_id) from sr), '[]'::jsonb)) end
  into out;
  return out;
end $$;

revoke all on function public.pk_dubai_deals(boolean) from public, anon;
grant execute on function public.pk_dubai_deals(boolean) to authenticated;
