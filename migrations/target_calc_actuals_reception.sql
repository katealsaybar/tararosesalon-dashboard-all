-- Kate, 29 Oct 2026: target_calc_actuals(p_month) also returns ret_recv per branch, the retail rung to BUSINESS TRS (the front desk's, no stylist) from phorest_staff_daily
-- products_ex_vat, the same name match as the visits (employee_name ilike '%BUSINESS%'). ret stays the branch total from financial_totals, so the page shows
-- Staff retail actual = ret - ret_recv and Reception retail actual = ret_recv. Checked 1 to 28 Oct: staff + BUSINESS TRS = financial_totals for all four branches (SAA off by 1 from rounding).
-- Applied live 29 Oct 2026. Undo: re-run migrations/target_calc_actuals.sql with the BUSINESS filter on visits (the 27 Oct 2026 live version).
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
    'branches', coalesce(jsonb_object_agg(f.branch, jsonb_build_object('net', f.net, 'svc', f.svc, 'ret', f.ret, 'ret_recv', coalesce(v.ret_recv, 0), 'visits', coalesce(v.visits, 0), 'treat', coalesce(t.treat, 0))), '{}'::jsonb))
  into res
  from (select branch, round(sum(sales_net)) net, round(sum(services_net + courses_net)) svc, round(sum(products_net)) ret
        from public.financial_totals where date between d1 and up and branch in ('SAA','KCA','MC','AQ') group by branch) f
  left join (select branch,
                    sum(visits) filter (where employee_name not ilike '%BUSINESS%') visits,
                    round(sum(products_ex_vat) filter (where employee_name ilike '%BUSINESS%')) ret_recv
             from public.phorest_staff_daily where date between d1 and up and not is_total and branch in ('SAA','KCA','MC','AQ') group by branch) v on v.branch = f.branch
  left join (select branch, round(sum(treatment_aed)) treat from public.branch_staff_daily where date between d1 and up and dept = 'Hair' and branch in ('SAA','KCA','MC','AQ') group by branch) t on t.branch = f.branch;
  return res;
end $$;
