-- Kate, 11 Nov 2026: "lagay ka rin retail units" (Retail by day) and "walang treatment names" (Treatments, one day). Both are additive, nothing the page reads today changes.
-- perf_my_days gains two numbers per day, counted from the till lines Phorest sent (sales_transaction_lines, no quantity column, so one line is one unit):
--   ru  retail units: her lines the till marks as products (stl_item_kind = 'product'), the same lines the one-day Retail list shows
--   tu  treatment units: her lines Phorest files under the treatment family (item_classes.family = 'treat': Olaplex, bond repair, scalp, blonde revival and the rest)
-- perf_my_day's till lines gain 'family' and 'stem' (item_classes), so the Treatments list for one day can name the treatments, and they add to the branch sheet's treatment AED
-- when reception typed what the till rang up (6 Oct 2026, Ashleigh Fairgrieve: one Olaplex Treatment line of AED 238.10 against AED 238 on the sheet).
-- The by_id twins call these two, so they need no change. Based on the live definitions of 11 Nov 2026 (perf_my_days there already carries pvisits, newer than perf_my_drill.sql).
create or replace function public.perf_my_days(p_token uuid, p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
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
  ), li as (
    select l.date, l.item, public.stl_item_kind(l.item) kind
      from sales_transaction_lines l
     where l.employee_name = s.phorest_name and l.date between p_from and p_to
  ), ic as (
    select distinct on (c.item) c.item, c.family
      from public.item_classes(array(select distinct item from li)) c
  ), tl as (
    select li.date d, count(*) filter (where li.kind = 'product') ru, count(*) filter (where ic.family = 'treat') tu
      from li left join ic on ic.item = li.item
     group by li.date
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
           'ru', coalesce(tl.ru, 0), 'tu', coalesce(tl.tu, 0),
           'uh', round(u.uh, 4), 'ah', round(u.ah, 4)) order by x.d), '[]'::jsonb)
    into out
    from days x left join p on p.d = x.d left join pv on pv.d = x.d left join r on r.d = x.d left join l on l.d = x.d left join u on u.d = x.d left join tl on tl.d = x.d;
  return out;
end $function$;

create or replace function public.perf_my_day(p_token uuid, p_date date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  s perf_staff;
  out jsonb;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;
  if p_date is null then return '{}'::jsonb; end if;
  select jsonb_build_object(
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('visit', z.visit, 'branch', z.branch, 'item', z.item, 'net', round(z.net, 2), 'kind', z.kind, 'family', z.family, 'stem', z.stem) order by z.visit, z.id)
        from (select x.id, x.branch, x.item, x.net, x.kind, ic.family, ic.stem, dense_rank() over (order by x.branch, x.first_id) visit
                from (select l.id, l.branch, l.item, l.net, public.stl_item_kind(l.item) kind, min(l.id) over (partition by l.branch, l.sale_id) first_id
                        from sales_transaction_lines l
                       where l.employee_name = s.phorest_name and l.date = p_date
                         and public.stl_item_kind(l.item) in ('service', 'product')) x
                left join (select distinct on (c.item) c.item, c.family, c.stem
                             from public.item_classes(array(select distinct l2.item from sales_transaction_lines l2 where l2.employee_name = s.phorest_name and l2.date = p_date)) c) ic
                       on ic.item = x.item) z), '[]'::jsonb),
    'phorest', coalesce((
      select jsonb_agg(jsonb_build_object('branch', d.branch, 'svc', round(d.services_ex_vat, 2), 'retail', round(d.products_ex_vat, 2), 'courses', round(d.courses_ex_vat, 2),
                                          'visits', d.visits, 'rqs', d.rqs, 'new', d.new_clients) order by d.branch)
        from phorest_staff_daily d where d.employee_name = s.phorest_name and not d.is_total and d.date = p_date), '[]'::jsonb),
    'rebook', coalesce((
      select jsonb_agg(jsonb_build_object('branch', r.branch, 'visits', r.visits, 'rebooked', r.rebooked) order by r.branch)
        from phorest_staff_rebooking r where r.employee_name = s.phorest_name and r.date = p_date), '[]'::jsonb),
    'sheet', coalesce((
      select jsonb_agg(jsonb_build_object('branch', b.branch, 'clients', b.total, 'req', b.req, 'salon', b.salon, 'new', b.new_client, 'ncr', b.ncr,
                                          'rebooked', b.rebooked, 'treat', round(b.treatment_aed, 2)) order by b.branch)
        from branch_staff_daily b where upper(trim(b.staff_name)) = any(s.ledger_names) and b.dept = s.dept and b.date = p_date), '[]'::jsonb),
    'util', coalesce((
      select jsonb_agg(jsonb_build_object('branch', u.branch, 'booked', round(u.utilisation_hours, 4), 'available', round(u.available_hours, 4)) order by u.branch)
        from staff_utilisation u where u.staff_name = s.phorest_name and not coalesce(u.is_archived, false) and u.date_from = u.date_to and u.date_from = p_date), '[]'::jsonb)
  ) into out;
  return out;
end $function$;
