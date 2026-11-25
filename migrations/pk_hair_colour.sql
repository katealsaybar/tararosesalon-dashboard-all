-- Hair Colour Packages Performance (Kate, 26 Nov 2026): the three archived packages of the Phorest package category 1HAIR COLOR:
-- BLEACHED ROOTS (AED 590), GLOBAL BLEACHED (AED 0, each line priced on its own) and Hot Cocoa Kiss - Balayage Package (AED 799).
-- A package is rung as ONE sale made of component lines named "<package> - <component>", so a sale is a distinct branch + date + sale id and we
-- count sales, not lines. Spelling variants count (BLEACHED ROOTAS, GLOBAL BLEACH). A refund line comes off the sale; a sale counts only when its
-- package lines add up to more than AED 0. Plain services with a similar name (Bleached Roots and Toner, 247 sales, ...) are NOT packages and not counted.
-- PRICE TEST (Kate's rule, 25 Nov 2026: a price test is never inside a headline total): Hot Cocoa Kiss has no line at the till, so it is traced by
-- price only: a sale of AED 799 (within AED 0.50) that has a balayage line and an express toner line. cnt = false, shown beside the total.
--
-- Returns {at, clients, packages:[{k, n, pl, cnt, sales, aed, clients, first, last}], rows:[[package, branch, date, sale no, aed, client, lines]]}.
--   clients = distinct clients over the counted sales. rows (left out when p_summary is true) = one per sale; "client" is an opaque rank made inside the
--   query (1 = first client to buy), never the Phorest client id and never a name. lines = [[till line name, AED], ...].
-- p_summary = true returns only the totals (the Campaigns Directory calls this). Level 2 and above, like Active Deals Performance. Read-only over
-- sales_transaction_lines. Written 26 Nov 2026; applied 26 Nov 2026 (Supabase gvijxenafoowajqktqvd). Numbers equal the mockup exactly:
-- 49 sales, AED 33,718, 30 clients counted (BR 35, GB 14), 18 price-test sales.

create or replace function public.pk_hair_colour(p_summary boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  with nm as (
    select s.branch, s.date, s.sale_id, s.client_id, s.item, s.total::numeric as total,
           case when s.item ~* '^BLEACHED ROOT' then 'BR' else 'GB' end as o
    from public.sales_transaction_lines s
    where s.item ~* '^(BLEACHED ROOT(S|AS) - |GLOBAL BLEACH(ED)? - )'),
  ns as (
    select o, branch, date, sale_id, min(client_id) as cid, sum(total) as aed from nm
    group by 1, 2, 3, 4 having sum(total) > 0),
  cand as (
    select branch, date, sale_id from public.sales_transaction_lines
    where item ~* 'balayage|express toner' and item !~* '\(refund\)\s*$'
    group by 1, 2, 3 having bool_or(item ~* 'balayage') and bool_or(item ~* 'express toner')),
  ps as (
    select 'HC'::text as o, s.branch, s.date, s.sale_id, max(s.client_id) as cid, sum(s.total::numeric) as aed
    from public.sales_transaction_lines s
    join cand c on c.branch = s.branch and c.date = s.date and c.sale_id = s.sale_id
    where s.item !~* '\(refund\)\s*$'
    group by 2, 3, 4 having abs(sum(s.total::numeric) - 799) < 0.5),
  al as (select * from ns union all select * from ps),
  cn as (
    select cid, row_number() over (order by d1, cid) as n
    from (select cid, min(date) as d1 from al group by cid) x),
  ln as (
    select a.o, a.branch, a.date, a.sale_id, l.item, l.total::numeric as total
    from al a join public.sales_transaction_lines l on l.branch = a.branch and l.date = a.date and l.sale_id = a.sale_id
    where a.o = 'HC' or l.item ~* '^(BLEACHED ROOT(S|AS) - |GLOBAL BLEACH(ED)? - )'),
  sr as (
    select a.o, a.branch, a.date, a.sale_id, a.aed, a.cid, coalesce(cn.n, 0) as n,
           (select jsonb_agg(jsonb_build_array(l.item, round(l.total, 2)) order by l.item, l.total)
            from ln l where l.o = a.o and l.branch = a.branch and l.date = a.date and l.sale_id = a.sale_id) as lines
    from al a left join cn on cn.cid is not distinct from a.cid),
  pk as (
    select * from (values (1, 'BR', 'BLEACHED ROOTS', 'AED 590', true), (2, 'GB', 'GLOBAL BLEACHED', 'AED 0', true),
                          (3, 'HC', 'Hot Cocoa Kiss - Balayage Package', 'AED 799', false)) v(ord, k, n, pl, cnt)),
  st as (
    select o, count(*) as sales, sum(aed) as aed, count(distinct cid) as clients, min(date) as first, max(date) as last
    from al group by o)
  select jsonb_build_object('at', now(),
    'clients', (select count(distinct cid) from al where o <> 'HC'),
    'packages', (select jsonb_agg(jsonb_build_object('k', pk.k, 'n', pk.n, 'pl', pk.pl, 'cnt', pk.cnt, 'sales', coalesce(st.sales, 0),
                   'aed', round(coalesce(st.aed, 0), 2), 'clients', coalesce(st.clients, 0), 'first', st.first, 'last', st.last) order by pk.ord)
                 from pk left join st on st.o = pk.k))
    || case when p_summary then '{}'::jsonb
            else jsonb_build_object('rows', coalesce((select jsonb_agg(jsonb_build_array(o, branch, date, sale_id, round(aed, 2), n, coalesce(lines, '[]'::jsonb))
                   order by date, branch, sale_id) from sr), '[]'::jsonb)) end
  into out;
  return out;
end $$;

revoke all on function public.pk_hair_colour(boolean) from public, anon;
grant execute on function public.pk_hair_colour(boolean) to authenticated;
