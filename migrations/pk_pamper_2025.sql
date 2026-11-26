-- Pamper Packages Performance 2025 (Kate, 26 Nov 2026): the ten packages of the two "pamper" slides, launched on a Facebook post of 24 Apr 2025.
-- Slide 1: The maintenance makeover (AED 580), Revive and rejuvenate (AED 1,500), A woman's retreat (AED 799), Time-saver treat (AED 620),
-- Boss babe blowdry 10 package (from AED 800). Slide 2: Recharge ritual (AED 450), Polish and pamper (AED 350), Gentle escape (AED 420),
-- Peaceful pause (AED 1,000), The mindful moment (AED 750).
-- A package is rung as ONE sale made of component lines named "<package> (AED n) - <component>", so a sale is a distinct branch + date + sale id and we
-- count sales, not lines. Four of the ten have lines at the till (Polish & Pamper, Recharge Ritual, Gentle Escape, Peaceful Pause); the other six have
-- NO sale line, most likely because nobody bought them (staff key a package on the till only at checkout). Searched by component and price, none matched,
-- so there is NO price test on this page. A refund line comes off the sale; a sale counts only when its package lines add up to more than AED 0.
-- No sale of these four is dated outside 31 Mar 2025 to 20 Nov 2026; the first sales are before the 24 Apr 2025 post, so the page counts from the first sale.
--
-- Returns {at, clients, packages:[{k, n, pl, c, ct, cnt, sales, aed, clients, first, last}], rows:[[package, branch, date, sale no, aed, client, lines]]}.
--   clients = distinct clients over the counted sales. rows (left out when p_summary is true) = one per sale; "client" is an opaque rank made inside the
--   query (1 = first client to buy), never the Phorest client id and never a name. lines = [[till line name, AED], ...].
-- p_summary = true returns only the totals (the Campaigns Directory calls this). Level 2 and above, like Active Deals Performance. Read-only over
-- sales_transaction_lines. Written 26 Nov 2026; applied 26 Nov 2026 (Supabase gvijxenafoowajqktqvd). Numbers equal the mockup exactly:
-- 52 sales, AED 18,381, 16 clients (PP 47 / AED 15,746.13, RR 2 / 868.42, GE 2 / 766.95, PA 1 / 1,000.00).

create or replace function public.pk_pamper_2025(p_summary boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  with nm as (
    select s.branch, s.date, s.sale_id, s.client_id, s.item, s.total::numeric as total,
           case when s.item ~* '^polish\s*(&|and)\s*pamper' then 'PP'
                when s.item ~* '^recharge ritual' then 'RR'
                when s.item ~* '^gentle escape' then 'GE'
                else 'PA' end as o
    from public.sales_transaction_lines s
    where s.item ~* '^(polish\s*(&|and)\s*pamper|recharge ritual|gentle escape|peaceful pause)'),
  al as (
    select o, branch, date, sale_id, min(client_id) as cid, sum(total) as aed from nm
    group by 1, 2, 3, 4 having sum(total) > 0),
  cn as (
    select cid, row_number() over (order by d1, cid) as n
    from (select cid, min(date) as d1 from al group by cid) x),
  sr as (
    select a.o, a.branch, a.date, a.sale_id, a.aed, a.cid, coalesce(cn.n, 0) as n,
           (select jsonb_agg(jsonb_build_array(l.item, round(l.total, 2)) order by l.item, l.total)
            from nm l where l.o = a.o and l.branch = a.branch and l.date = a.date and l.sale_id = a.sale_id) as lines
    from al a left join cn on cn.cid is not distinct from a.cid),
  pk as (
    select * from (values
      (1, 'MM',   'The maintenance makeover',      'AED 580',      'na', 'No sale'),
      (2, 'REV',  'Revive and rejuvenate',         'AED 1,500',    'na', 'No sale'),
      (3, 'WR',   'A woman''s retreat',            'AED 799',      'na', 'No sale'),
      (4, 'TS',   'Time-saver treat',              'AED 620',      'na', 'No sale'),
      (5, 'BB',   'Boss babe blowdry 10 package',  'from AED 800', 'na', 'No sale'),
      (6, 'RR',   'Recharge ritual',               'AED 450',      'ok', 'Exact'),
      (7, 'PP',   'Polish and pamper',             'AED 350',      'ok', 'Exact'),
      (8, 'GE',   'Gentle escape',                 'AED 420',      'ok', 'Exact'),
      (9, 'PA',   'Peaceful pause',                'AED 1,000',    'ok', 'Exact'),
      (10,'MIND', 'The mindful moment',            'AED 750',      'na', 'No sale')) v(ord, k, n, pl, c, ct)),
  st as (
    select o, count(*) as sales, sum(aed) as aed, count(distinct cid) as clients, min(date) as first, max(date) as last
    from al group by o)
  select jsonb_build_object('at', now(),
    'clients', (select count(distinct cid) from al),
    'packages', (select jsonb_agg(jsonb_build_object('k', pk.k, 'n', pk.n, 'pl', pk.pl, 'c', pk.c, 'ct', pk.ct, 'cnt', true, 'sales', coalesce(st.sales, 0),
                   'aed', round(coalesce(st.aed, 0), 2), 'clients', coalesce(st.clients, 0), 'first', st.first, 'last', st.last) order by pk.ord)
                 from pk left join st on st.o = pk.k))
    || case when p_summary then '{}'::jsonb
            else jsonb_build_object('rows', coalesce((select jsonb_agg(jsonb_build_array(o, branch, date, sale_id, round(aed, 2), n, coalesce(lines, '[]'::jsonb))
                   order by date, branch, sale_id) from sr), '[]'::jsonb)) end
  into out;
  return out;
end $$;

revoke all on function public.pk_pamper_2025(boolean) from public, anon;
grant execute on function public.pk_pamper_2025(boolean) to authenticated;
