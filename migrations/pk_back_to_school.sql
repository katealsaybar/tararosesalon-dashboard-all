-- Back to School Offer Performance (Kate, 26 Nov 2026): the one archived Phorest package named "Back to School Offer" (category PACKAGES, AED 399).
-- A package is rung as ONE sale made of component lines named "Back to School Offer - <component>" (long blowdry 119, rest and relax (ABC) 80,
-- head, neck and shoulder massage 30 mins 70, pedicure 70, manicure 60), so a sale is a distinct branch + date + sale id and we count sales, not lines.
-- A refund line comes off the sale; a sale counts only when its package lines add up to more than AED 0. It has its own name at the till: Exact.
-- No price test: no sale of AED 399 with these lines was found outside the August 2021 run, so nothing sits beside the total.
--
-- Returns {at, clients, packages:[{k, n, pl, cnt, sales, aed, clients, first, last}], rows:[[package, branch, date, sale no, aed, client, lines, extras]]}.
--   clients = distinct clients over the counted sales. rows (left out when p_summary is true) = one per sale; "client" is an opaque rank made inside the
--   query (1 = first client to buy), never the Phorest client id and never a name. lines = [[till line name, AED], ...] (the package's own lines);
--   extras = [[till line name, AED], ...] (other things rung on the same till sale, not counted in the offer).
-- p_summary = true returns only the totals (the Campaigns Directory calls this). Level 2 and above, like Active Deals Performance. Read-only over
-- sales_transaction_lines. Written 26 Nov 2026; applied 26 Nov 2026 (Supabase gvijxenafoowajqktqvd). Numbers equal the mockup exactly:
-- 9 sales, AED 3,591, 9 clients (KCA 3, SAA 4, MRY 2), 16 to 28 Aug 2021, AED 1,775 also on 5 of the 9 sales.

create or replace function public.pk_back_to_school(p_summary boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  with pl as (
    select s.branch, s.date, s.sale_id, s.client_id, s.item, s.total::numeric as total
    from public.sales_transaction_lines s
    where s.item ~* '^Back to School Offer - '),
  al as (
    select 'BTS'::text as o, branch, date, sale_id, min(client_id) as cid, sum(total) as aed from pl
    group by 2, 3, 4 having sum(total) > 0),
  cn as (
    select cid, row_number() over (order by d1, cid) as n
    from (select cid, min(date) as d1 from al group by cid) x),
  sr as (
    select a.o, a.branch, a.date, a.sale_id, a.aed, coalesce(cn.n, 0) as n,
           (select jsonb_agg(jsonb_build_array(l.item, round(l.total::numeric, 2)) order by l.item, l.total)
            from public.sales_transaction_lines l
            where l.branch = a.branch and l.date = a.date and l.sale_id = a.sale_id and l.item ~* '^Back to School Offer - ') as lines,
           (select jsonb_agg(jsonb_build_array(l.item, round(l.total::numeric, 2)) order by l.item, l.total)
            from public.sales_transaction_lines l
            where l.branch = a.branch and l.date = a.date and l.sale_id = a.sale_id and l.item !~* '^Back to School Offer - ') as extras
    from al a left join cn on cn.cid is not distinct from a.cid),
  st as (
    select count(*) as sales, sum(aed) as aed, count(distinct cid) as clients, min(date) as first, max(date) as last from al)
  select jsonb_build_object('at', now(),
    'clients', (select clients from st),
    'packages', jsonb_build_array(jsonb_build_object('k', 'BTS', 'n', 'Back to School Offer', 'pl', 'AED 399', 'cnt', true,
                   'sales', (select sales from st), 'aed', round(coalesce((select aed from st), 0), 2), 'clients', (select clients from st),
                   'first', (select first from st), 'last', (select last from st))))
    || case when p_summary then '{}'::jsonb
            else jsonb_build_object('rows', coalesce((select jsonb_agg(jsonb_build_array(o, branch, date, sale_id, round(aed, 2), n,
                   coalesce(lines, '[]'::jsonb), coalesce(extras, '[]'::jsonb)) order by date, branch, sale_id) from sr), '[]'::jsonb)) end
  into out;
  return out;
end $$;

revoke all on function public.pk_back_to_school(boolean) from public, anon;
grant execute on function public.pk_back_to_school(boolean) to authenticated;
