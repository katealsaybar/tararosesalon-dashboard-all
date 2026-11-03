-- Kate, 3 Nov 2026: My Numbers' lists follow the paid-visits rule. On 30 Oct perf_core began counting PAID visits on the Phorest side
-- (migrations/perf_core_strict_visits.sql), so a Phorest client figure opened a list of every visit and did not add up. perf_my_days now also
-- returns, per day, 'pvisits': the visits perf_core counts for that day, worked out the very same way (sales lines when she has any for the
-- day, Phorest's own visit count when she has none yet), so the rows add up to phorest.clients. 'visits' stays every visit Phorest counted
-- (phorest.clients_all). Same token-only, sign-in-lock-only access as before; it returns her own rows and nothing about anyone else.
-- Hours come back to 4 decimals (not 1) so a month of days adds up to perf_core's booked and available hours, and the column fill follows.
-- Read only. Replaces migrations/perf_my_drill.sql's perf_my_days; the grants are unchanged (create or replace keeps them).

create or replace function public.perf_my_days(p_token uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  out jsonb;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 2100 then return '[]'::jsonb; end if;

  with p as (
    select date d, coalesce(sum(services_ex_vat), 0) svc, coalesce(sum(products_ex_vat), 0) retail, coalesce(sum(visits), 0) visits,
           coalesce(sum(rqs), 0) rqs, coalesce(sum(new_clients), 0) pnew
      from phorest_staff_daily
     where employee_name = s.phorest_name and not is_total and date between p_from and p_to group by date
  ), ld as (
    select distinct date from sales_transaction_lines
     where employee_name = s.phorest_name and date between p_from and p_to
  ), sv as (
    select x.date, count(*) n
      from (
        select distinct x.client_name, x.date
          from sales_transaction_lines x
         where x.employee_name = s.phorest_name and x.date between p_from and p_to
           and x.client_name is not null and x.client_name <> ''
           and x.client_name !~* '\mstaff\M' and x.client_name !~* '^\s*walk[\s-]*in\M'
           and public.stl_item_kind(x.item) not in ('non_sale', 'voucher')
           and exists (select 1 from sales_transaction_lines y
                        where y.branch = x.branch and y.date = x.date and y.sale_id = x.sale_id
                          and nullif(trim(y.payment_raw), '') is not null and y.day_spend_ok)
      ) x
     group by x.date
  ), pv as (
    select d.date d, coalesce(sum(case when ld.date is not null then coalesce(sv.n, 0) else d.visits end), 0) paid
      from phorest_staff_daily d
      left join ld on ld.date = d.date
      left join sv on sv.date = d.date
     where d.employee_name = s.phorest_name and not d.is_total and d.date between p_from and p_to
     group by d.date
  ), r as (
    select date d, coalesce(sum(visits), 0) rb_visits, coalesce(sum(rebooked), 0) rb_n
      from phorest_staff_rebooking
     where employee_name = s.phorest_name and date between p_from and p_to group by date
  ), l as (
    select date d, coalesce(sum(total), 0) clients, coalesce(sum(req), 0) req, coalesce(sum(salon), 0) salon,
           coalesce(sum(new_client), 0) newc, coalesce(sum(ncr), 0) ncr, coalesce(sum(rebooked), 0) lreb, coalesce(sum(treatment_aed), 0) treat
      from branch_staff_daily
     where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between p_from and p_to group by date
  ), u as (
    select date_from d, sum(utilisation_hours) uh, sum(available_hours) ah
      from staff_utilisation
     where staff_name = s.phorest_name and not coalesce(is_archived, false) and date_from = date_to and date_from between p_from and p_to group by date_from
  ), days as (
    select d from p union select d from r union select d from l union select d from u
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', x.d, 'svc', round(coalesce(p.svc, 0), 2), 'retail', round(coalesce(p.retail, 0), 2), 'visits', coalesce(p.visits, 0),
           'pvisits', coalesce(pv.paid, 0), 'rqs', coalesce(p.rqs, 0), 'pnew', coalesce(p.pnew, 0),
           'rb_visits', r.rb_visits, 'rb_n', r.rb_n,
           'clients', coalesce(l.clients, 0), 'req', coalesce(l.req, 0), 'salon', coalesce(l.salon, 0), 'newc', coalesce(l.newc, 0),
           'ncr', coalesce(l.ncr, 0), 'lreb', coalesce(l.lreb, 0), 'treat', round(coalesce(l.treat, 0), 2),
           'uh', round(u.uh, 4), 'ah', round(u.ah, 4)) order by x.d), '[]'::jsonb)
    into out
    from days x left join p on p.d = x.d left join pv on pv.d = x.d left join r on r.d = x.d left join l on l.d = x.d left join u on u.d = x.d;
  return out;
end $$;
