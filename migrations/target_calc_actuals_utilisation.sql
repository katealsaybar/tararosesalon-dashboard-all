-- Kate, 29 Oct 2026: target_calc_actuals(p_month) also returns util_av and util_ut per branch: available and booked hours from staff_utilisation for the month so far,
-- hair and beauty on shift only (roster position_clean: Stylist, Senior Stylist, Junior Stylist, Style Director, Beautician, Creative Director, Consultant; assistants, reception, office left out),
-- rows with available_hours > 0 and not (archived with no booked hours), the same rules as the dashboard utilisation. The Target Calculator card divides them for the Utilisation actual.
-- Applied live 29 Oct 2026. Undo: re-run migrations/target_calc_actuals_reception.sql.
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
    'branches', coalesce(jsonb_object_agg(f.branch, jsonb_build_object('net', f.net, 'svc', f.svc, 'ret', f.ret, 'ret_recv', coalesce(v.ret_recv, 0), 'visits', coalesce(v.visits, 0), 'treat', coalesce(t.treat, 0), 'util_av', coalesce(u.av, 0), 'util_ut', coalesce(u.ut, 0))), '{}'::jsonb))
  into res
  from (select branch, round(sum(sales_net)) net, round(sum(services_net + courses_net)) svc, round(sum(products_net)) ret
        from public.financial_totals where date between d1 and up and branch in ('SAA','KCA','MC','AQ') group by branch) f
  left join (select branch,
                    sum(visits) filter (where employee_name not ilike '%BUSINESS%') visits,
                    round(sum(products_ex_vat) filter (where employee_name ilike '%BUSINESS%')) ret_recv
             from public.phorest_staff_daily where date between d1 and up and not is_total and branch in ('SAA','KCA','MC','AQ') group by branch) v on v.branch = f.branch
  left join (select branch, round(sum(treatment_aed)) treat from public.branch_staff_daily where date between d1 and up and dept = 'Hair' and branch in ('SAA','KCA','MC','AQ') group by branch) t on t.branch = f.branch
  left join (select su.branch, round(sum(su.available_hours)) av, round(sum(su.utilisation_hours)) ut
             from public.staff_utilisation su
             join (select distinct on (branch, lower(staff_name)) branch, lower(staff_name) nm, position_clean from public.phorest_staff_roster order by branch, lower(staff_name), pulled_on desc nulls last) r
               on r.branch = su.branch and r.nm = lower(su.staff_name)
             where su.date_from between d1 and up and su.branch in ('SAA','KCA','MC','AQ') and su.available_hours > 0
               and not (coalesce(su.is_archived, false) and su.utilisation_hours = 0)
               and r.position_clean in ('Stylist','Senior Stylist','Junior Stylist','Style Director','Style Director - DXB','Beautician','Beautician - DXB','Creative Director','Consultant')
             group by su.branch) u on u.branch = f.branch;
  return res;
end $$;
