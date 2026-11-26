-- ADS 499 Packages Performance (Kate, 26 Nov 2026): the three AED 499 Meta-ads beauty packages of the Phorest package category ADS - PACKAGE:
-- Skin (Hydrafacial + blow dry), Hands and Feet (gel mani and pedi, foot massage, head neck and shoulder massage) and Eyes (LVL or brow lamination,
-- gel pedi, blow dry). It replaces the "ADS Hydrafacial + Blow dry (older 499)" row of Active Deals Performance.
-- A package is rung as ONE sale made of component lines named "<package> - <component>", so a sale is a distinct branch + date + sale id and we count
-- sales, not lines. A refund line comes off the sale; a sale counts only when its package lines add up to more than AED 0.
-- SKIN is named at the till: lines "ADS -Hydrafacial + Blow dry - ...". On one sale (Khalifa City A, 20 May 2025) the blow dry part was paid later as an
-- "Outstanding balance payment" of AED 112.45 (the same amount as the blow dry line on the other sales): when a sale has the Hydra line and no blow dry line,
-- that payment on the same sale is added to the package.
-- PRICE TEST (Kate's rule, 25 Nov 2026: a price test is never inside a headline total): HANDS AND FEET has no line at the till, so it is traced by price only:
-- a sale whose lines add up to exactly AED 499.00 and include a foot massage, a neck and shoulder massage and a gel polish. cnt = false, shown beside the total.
-- EYES: no sale found by name or by price (cnt false, zero sales).
--
-- Returns {at, clients, packages:[{k, n, pl, cnt, sales, aed, clients, first, last}], rows:[[package, branch, date, sale no, aed, client, lines]]}.
--   clients = distinct clients over the counted sales. rows (left out when p_summary is true) = one per sale; "client" is an opaque rank made inside the
--   query (1 = first client to buy), never the Phorest client id and never a name. lines = [[till line name, AED], ...].
-- p_summary = true returns only the totals (the Campaigns Directory calls this). Level 2 and above, like Active Deals Performance. Read-only over
-- sales_transaction_lines. Written 26 Nov 2026; applied 26 Nov 2026 (Supabase gvijxenafoowajqktqvd). Numbers equal the mockup exactly: 3 sales, AED 1,497, 3 clients counted, +1 price-test sale (AED 499).

create or replace function public.pk_ads499(p_summary boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  with nm as (
    select s.branch, s.date, s.sale_id, s.client_id, s.item, s.total::numeric as total
    from public.sales_transaction_lines s
    where s.item ~* '^ADS -Hydrafacial \+ Blow dry - '),
  late as (
    select s.branch, s.date, s.sale_id, s.client_id, s.item, s.total::numeric as total
    from public.sales_transaction_lines s
    where s.item ~* '^Outstanding balance payment$' and abs(s.total::numeric - 112.45) < 0.005
      and exists (select 1 from nm where nm.branch = s.branch and nm.date = s.date and nm.sale_id = s.sale_id and nm.item ~* 'Hydra')
      and not exists (select 1 from nm where nm.branch = s.branch and nm.date = s.date and nm.sale_id = s.sale_id and nm.item ~* 'Blowdry|Blow dry' and nm.item !~* '^ADS -Hydrafacial \+ Blow dry - Hydra')),
  sk as (select * from nm union all select * from late),
  ns as (
    select 'skin'::text as o, branch, date, sale_id, min(client_id) as cid, sum(total) as aed from sk
    group by 2, 3, 4 having sum(total) > 0),
  cand as (
    select branch, date, sale_id from public.sales_transaction_lines
    where item !~* '\(refund\)\s*$'
    group by 1, 2, 3
    having bool_or(item ~* 'foot massage') and bool_or(item ~* 'neck') and bool_or(item ~* 'gel')),
  ps as (
    select 'hands'::text as o, s.branch, s.date, s.sale_id, max(s.client_id) as cid, sum(s.total::numeric) as aed
    from public.sales_transaction_lines s
    join cand c on c.branch = s.branch and c.date = s.date and c.sale_id = s.sale_id
    where s.item !~* '\(refund\)\s*$'
    group by 2, 3, 4 having abs(sum(s.total::numeric) - 499) < 0.005),
  al as (select * from ns union all select * from ps),
  cn as (
    select cid, row_number() over (order by d1, cid) as n
    from (select cid, min(date) as d1 from al group by cid) x),
  ln as (
    select a.o, a.branch, a.date, a.sale_id, l.item, l.total::numeric as total
    from al a
    join public.sales_transaction_lines l on l.branch = a.branch and l.date = a.date and l.sale_id = a.sale_id
    where a.o = 'hands'
       or (a.o = 'skin' and (l.item ~* '^ADS -Hydrafacial \+ Blow dry - '
            or exists (select 1 from late x where x.branch = l.branch and x.date = l.date and x.sale_id = l.sale_id and x.item = l.item and x.total = l.total::numeric)))),
  sr as (
    select a.o, a.branch, a.date, a.sale_id, a.aed, a.cid, coalesce(cn.n, 0) as n,
           (select jsonb_agg(jsonb_build_array(l.item, round(l.total, 2)) order by l.item, l.total)
            from ln l where l.o = a.o and l.branch = a.branch and l.date = a.date and l.sale_id = a.sale_id) as lines
    from al a left join cn on cn.cid is not distinct from a.cid),
  pk as (
    select * from (values (1, 'skin', 'Skin: Hydrafacial + blow dry', 'AED 499', true),
                          (2, 'hands', 'Hands and Feet: gel mani and pedi, foot massage, head neck and shoulder massage', 'AED 499', false),
                          (3, 'eyes', 'Eyes: LVL or brow lamination, gel pedi, blow dry', 'AED 499', false)) v(ord, k, n, pl, cnt)),
  st as (
    select o, count(*) as sales, sum(aed) as aed, count(distinct cid) as clients, min(date) as first, max(date) as last
    from al group by o)
  select jsonb_build_object('at', now(),
    'clients', (select count(distinct cid) from al where o = 'skin'),
    'packages', (select jsonb_agg(jsonb_build_object('k', pk.k, 'n', pk.n, 'pl', pk.pl, 'cnt', pk.cnt, 'sales', coalesce(st.sales, 0),
                   'aed', round(coalesce(st.aed, 0), 2), 'clients', coalesce(st.clients, 0), 'first', st.first, 'last', st.last) order by pk.ord)
                 from pk left join st on st.o = pk.k))
    || case when p_summary then '{}'::jsonb
            else jsonb_build_object('rows', coalesce((select jsonb_agg(jsonb_build_array(o, branch, date, sale_id, round(aed, 2), n, coalesce(lines, '[]'::jsonb))
                   order by date, branch, sale_id) from sr), '[]'::jsonb)) end
  into out;
  return out;
end $$;

revoke all on function public.pk_ads499(boolean) from public, anon;
grant execute on function public.pk_ads499(boolean) to authenticated;
