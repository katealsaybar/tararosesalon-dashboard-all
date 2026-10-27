-- Kate, 27 Oct 2026: actual so far this month, for the tiles on the Target Calculator (/targets/), shown beside each target.
-- target_calc_actuals(p_month) returns, for the four UAE branches, from the 1st of the month to the last day the ledger has:
-- net (sales_net, the total net take), svc (services and courses net, treatments inside), ret (products net) from financial_totals,
-- and visits from phorest_staff_daily (staff rows, not the totals). Level 3 and Level 5 only, same guard as target_calc_data().
-- Returns {none:true} when the month has no ledger rows yet (the page then shows the plain tiles). Applied live 27 Oct 2026.
-- Undo: drop function public.target_calc_actuals(int);
create or replace function public.target_calc_actuals(p_month int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d1 date; d2 date; up date; res jsonb;
begin
  if coalesce(public.kb_level(), 0) not in (3, 5) then return jsonb_build_object('denied', true); end if;
  d1 := make_date(2026, p_month, 1);
  d2 := (d1 + interval '1 month' - interval '1 day')::date;
  select max(date) into up from public.financial_totals where date between d1 and d2 and branch in ('SAA','KCA','MC','AQ');
  if up is null then return jsonb_build_object('none', true); end if;
  select jsonb_build_object('upto', up, 'elapsed', (up - d1 + 1), 'days', (d2 - d1 + 1),
    'branches', coalesce(jsonb_object_agg(f.branch, jsonb_build_object('net', f.net, 'svc', f.svc, 'ret', f.ret, 'visits', coalesce(v.visits, 0))), '{}'::jsonb))
  into res
  from (select branch, round(sum(sales_net)) net, round(sum(services_net + courses_net)) svc, round(sum(products_net)) ret
        from public.financial_totals where date between d1 and up and branch in ('SAA','KCA','MC','AQ') group by branch) f
  left join (select branch, sum(visits) visits from public.phorest_staff_daily where date between d1 and up and not is_total and branch in ('SAA','KCA','MC','AQ') group by branch) v on v.branch = f.branch;
  return res;
end $$;
revoke all on function public.target_calc_actuals(int) from public, anon;
grant execute on function public.target_calc_actuals(int) to authenticated;
