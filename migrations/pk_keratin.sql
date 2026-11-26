-- Keratin Packages Performance (Kate, 26 Nov 2026): the twelve archived packages of the Phorest package category 1TREATMENT - KERATIN:
-- FRIZZ FREE, SMOOTH & DEFRIZZ and SUPREME STRAIGHT, each in Short, Medium, Long and Extra Long (AED 885 to 1,600).
-- A package is rung as lines named "<PACKAGE> - <LENGTH> - <service> - Application" (and "- Ironing"), so a sale is a distinct branch + date + sale id
-- and we count sales, not lines. A sale counts only when its Application line is there: 15 sales with only the Ironing step are not counted.
-- A refund line (item ending "(Refund)") is not a sale: it comes off the AED as a row of its own (x = 2). There is one, Marasy, 1 Nov 2021, AED 625.
-- Plain services with the same treatment but no package name (Supreme Straighten Long Hair - Application, ...) are NOT packages and not counted;
-- they come back as plain = [[treatment, branch, date, sales, AED]] so the page can say how many were rung that way (Fratelli, closed, left out).
--
-- Returns {at, clients, sales, aed, packages:[{k, n, pl, cnt, sales, aed, clients, first, last}], plain, rows:[[package, branch, date, sale no, aed, client, discount, x, lines]]}.
--   k = treatment letter (F frizz free, D smooth & defrizz, S supreme straight) + length letter (S short, M medium, L long, X extra long).
--   clients = distinct clients over the counted sales. rows and plain (left out when p_summary is true) = one per sale; "client" is an opaque rank
--   made inside the query (1 = first client to buy), never the Phorest client id and never a name. x: 0 Application only, 1 Application and Ironing, 2 refund.
-- p_summary = true returns only the totals (the Campaigns Directory calls this). Level 2 and above, like Active Deals Performance. Read-only over
-- sales_transaction_lines. Written 26 Nov 2026; applied 26 Nov 2026 (Supabase gvijxenafoowajqktqvd). Numbers equal the mockup exactly:
-- 812 sales, AED 780,268.50 (net of the refund), 475 clients; plain services 341 in 2026 and 214 in 2025.

create or replace function public.pk_keratin(p_summary boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  with pl as (
    select s.branch, s.date, s.sale_id, s.client_id, s.item, s.total::numeric as t, coalesce(s.discount::numeric, 0) as d,
           (case when s.item ~ '^FRIZZ FREE - ' then 'F' when s.item ~ '^SMOOTH & DEFRI?ZZ - ' then 'D' else 'S' end) ||
           (case (regexp_match(s.item, ' - (SHORT|MEDIUM|LONG|EXTRA LONG) - '))[1] when 'SHORT' then 'S' when 'MEDIUM' then 'M' when 'LONG' then 'L' else 'X' end) as k,
           s.item ~* '\(refund\)\s*$' as rf
    from public.sales_transaction_lines s
    where s.item ~ '^(FRIZZ FREE|SMOOTH & DEFRI?ZZ|SUPREME STRAIGHT) - (SHORT|MEDIUM|LONG|EXTRA LONG) - '),
  al as (
    select k, branch, date, sale_id, min(client_id) as cid,
           sum(t) filter (where not rf) as aed, sum(d) filter (where not rf) as disc,
           (case when bool_or(item ~* 'ironing' and not rf) then 1 else 0 end) as x
    from pl group by k, branch, date, sale_id
    having bool_or(item ~* 'application' and not rf)
    union all
    select k, branch, date, sale_id, min(client_id), sum(t) filter (where rf), sum(d) filter (where rf), 2
    from pl group by k, branch, date, sale_id
    having bool_or(rf) and not bool_or(item ~* 'application' and not rf)),
  cn as (
    select cid, row_number() over (order by d1, cid) as n
    from (select cid, min(date) as d1 from al group by cid) q),
  sr as (
    select a.k, a.branch, a.date, a.sale_id, a.aed, a.disc, a.x, a.cid, coalesce(cn.n, 0) as n,
           (select jsonb_agg(jsonb_build_array(l.item, round(l.t, 2)) order by l.item, l.t)
            from pl l where l.k = a.k and l.branch = a.branch and l.date = a.date and l.sale_id = a.sale_id
              and (a.x = 2) = l.rf) as lines
    from al a left join cn on cn.cid is not distinct from a.cid),
  pk as (
    select * from (values
      (1, 'FS', 'FRIZZ FREE - SHORT', 'AED 885'), (2, 'FM', 'FRIZZ FREE - MEDIUM', 'AED 1,095'), (3, 'FL', 'FRIZZ FREE - LONG', 'AED 1,250'), (4, 'FX', 'FRIZZ FREE - EXTRA LONG', 'AED 1,450'),
      (5, 'DS', 'SMOOTH & DEFRIZZ - SHORT', 'AED 885'), (6, 'DM', 'SMOOTH & DEFRIZZ - MEDIUM', 'AED 1,095'), (7, 'DL', 'SMOOTH & DEFRIZZ - LONG', 'AED 1,250'), (8, 'DX', 'SMOOTH & DEFRIZZ - EXTRA LONG', 'AED 1,450'),
      (9, 'SS', 'SUPREME STRAIGHT - SHORT', 'AED 1,085'), (10, 'SM', 'SUPREME STRAIGHT - MEDIUM', 'AED 1,285'), (11, 'SL', 'SUPREME STRAIGHT - LONG', 'AED 1,400'), (12, 'SX', 'SUPREME STRAIGHT - EXTRA LONG', 'AED 1,600')
    ) v(ord, k, n, pl)),
  st as (
    select k, count(*) filter (where x < 2) as sales, sum(aed) as aed, count(distinct cid) filter (where x < 2) as clients,
           min(date) filter (where x < 2) as first, max(date) filter (where x < 2) as last
    from al group by k),
  pn as (
    select case when s.item ~* '^frizz' then 'F' when s.item ~* '^smooth' then 'D' else 'S' end as tr,
           s.branch, s.date, s.sale_id, sum(s.total::numeric) filter (where s.item !~* '\(refund\)\s*$') as aed
    from public.sales_transaction_lines s
    where s.branch <> 'FRT' and s.item ~* '^(frizz[- ]+free|smooth & defrizz|supreme straighten)' and s.item !~ '^(FRIZZ FREE|SMOOTH & DEFRI?ZZ|SUPREME STRAIGHT) - '
    group by 1, 2, 3, 4
    having bool_or(s.item ~* 'application' and s.item !~* '\(refund\)\s*$')),
  pg as (select tr, branch, date, count(*) as n, sum(aed) as aed from pn group by 1, 2, 3)
  select jsonb_build_object('at', now(),
    'clients', (select count(distinct cid) from al where x < 2),
    'sales', (select count(*) from al where x < 2),
    'aed', (select round(coalesce(sum(aed), 0), 2) from al),
    'packages', (select jsonb_agg(jsonb_build_object('k', pk.k, 'n', pk.n, 'pl', pk.pl, 'cnt', true, 'sales', coalesce(st.sales, 0),
                   'aed', round(coalesce(st.aed, 0), 2), 'clients', coalesce(st.clients, 0), 'first', st.first, 'last', st.last) order by pk.ord)
                 from pk left join st on st.k = pk.k))
    || case when p_summary then '{}'::jsonb
            else jsonb_build_object(
              'plain', coalesce((select jsonb_agg(jsonb_build_array(tr, branch, date, n, round(aed, 2)) order by date, branch, tr) from pg), '[]'::jsonb),
              'rows', coalesce((select jsonb_agg(jsonb_build_array(k, branch, date, sale_id, round(aed, 2), n, round(coalesce(disc, 0), 2), x, coalesce(lines, '[]'::jsonb))
                   order by date, branch, sale_id, k) from sr), '[]'::jsonb)) end
  into out;
  return out;
end $$;

revoke all on function public.pk_keratin(boolean) from public, anon;
grant execute on function public.pk_keratin(boolean) to authenticated;
