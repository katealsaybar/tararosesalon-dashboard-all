-- Kate, 30 Oct 2026: the Phorest side of a stylist's page counted every visit, including redos, consultations and AED 0
-- services ("make sure it does not count consultations or redoes or anything that costs AED 0"). perf_core now counts
-- PAID visits the way the rest of the dashboard does (org_pulse_extra, door_clients): one per client per day, a sale
-- with a payment entry and day_spend_ok above AED 0, no Staff or walk-in names, deposits and vouchers out.
--   phorest.clients       paid visits (new default; Total clients, Average bill and Request rate follow it)
--   phorest.clients_all   every visit Phorest counted, as before
--   phorest.free_visits   clients_all minus clients: the redos, consultations and AED 0 services
--   phorest.avg_bill_all, avg_bill_retail_all, request_pct_all   the same three figures on every visit
-- A day with no sales lines for her yet (the latest day before the nightly load, or dates before the lines start) keeps
-- Phorest's own visit count for that day, so a window never reads low only because the lines are late.
-- Rebooking stays Phorest's tracker (phorest_staff_rebooking); the branch sheet figures are untouched.
-- Old definition: migrations/perf_core_before_strict_visits_30oct.sql (re-run it to roll back).
create or replace function public.perf_core(s perf_staff, d1 date, d2 date)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with p as (
    select coalesce(sum(services_ex_vat),0) svc, coalesce(sum(products_ex_vat),0) retail,
           coalesce(sum(visits),0) visits, coalesce(sum(rqs),0) rqs, coalesce(sum(new_clients),0) pnew,
           max(date) last_date
    from phorest_staff_daily
    where employee_name = s.phorest_name and not is_total and date between d1 and d2
  ), ld as (
    select distinct date from sales_transaction_lines
    where employee_name = s.phorest_name and date between d1 and d2
  ), sv as (
    select x.date, count(*) n
    from (
      select distinct x.client_name, x.date
      from sales_transaction_lines x
      where x.employee_name = s.phorest_name and x.date between d1 and d2
        and x.client_name is not null and x.client_name <> ''
        and x.client_name !~* '\mstaff\M' and x.client_name !~* '^\s*walk[\s-]*in\M'
        and public.stl_item_kind(x.item) not in ('non_sale', 'voucher')
        and exists (select 1 from sales_transaction_lines y
                     where y.branch = x.branch and y.date = x.date and y.sale_id = x.sale_id
                       and nullif(trim(y.payment_raw), '') is not null and y.day_spend_ok)
    ) x
    group by x.date
  ), pv as (
    select coalesce(sum(case when ld.date is not null then coalesce(sv.n, 0) else d.visits end), 0) paid
    from phorest_staff_daily d
    left join ld on ld.date = d.date
    left join sv on sv.date = d.date
    where d.employee_name = s.phorest_name and not d.is_total and d.date between d1 and d2
  ), r as (
    select count(*) n, coalesce(sum(visits),0) v, coalesce(sum(rebooked),0) reb
    from phorest_staff_rebooking
    where employee_name = s.phorest_name and date between d1 and d2
  ), l as (
    select coalesce(sum(total),0) clients, coalesce(sum(req),0) req, coalesce(sum(salon),0) salon,
           coalesce(sum(new_client),0) newc, coalesce(sum(ncr),0) ncr,
           coalesce(sum(rebooked),0) rebooked, coalesce(sum(treatment_aed),0) treat
    from branch_staff_daily
    where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between d1 and d2
  ), u as (
    select sum(utilisation_hours) uh, sum(available_hours) ah
    from staff_utilisation
    where staff_name = s.phorest_name and not coalesce(is_archived,false)
      and date_from = date_to and date_from between d1 and d2
  )
  select jsonb_build_object(
    'total_revenue',   round(p.svc, 2),
    'hair_services',   round(p.svc - l.treat, 2),
    'treatments',      round(l.treat, 2),
    'treatments_pct',  case when p.svc - l.treat > 0 then round(100 * l.treat / (p.svc - l.treat), 1) end,
    'retail',          round(p.retail, 2),
    'retail_pct',      case when p.svc > 0 then round(100 * p.retail / p.svc, 1) end,
    'avg_bill',        case when l.clients > 0 then round(p.svc / l.clients, 0) end,
    'avg_bill_retail', case when l.clients > 0 then round((p.svc + p.retail) / l.clients, 0) end,
    'clients',         l.clients,
    'req',             l.req,
    'salon',           l.salon,
    'new_clients',     l.newc,
    'ncr',             l.ncr,
    'rebooked',        l.rebooked,
    'rebooking_pct',   case when l.clients > 0 then round(100.0 * l.rebooked / l.clients, 1) end,
    'request_pct',     case when l.clients > 0 then round(100.0 * (l.req + l.ncr) / l.clients, 1) end,
    'phorest',         jsonb_build_object(
                         'clients',         pv.paid,
                         'clients_all',     p.visits,
                         'free_visits',     greatest(p.visits - pv.paid, 0),
                         'req',             p.rqs,
                         'new_clients',     p.pnew,
                         'request_pct',     case when pv.paid > 0 then round(100.0 * p.rqs / pv.paid, 1) end,
                         'request_pct_all', case when p.visits > 0 then round(100.0 * p.rqs / p.visits, 1) end,
                         'avg_bill',        case when pv.paid > 0 then round(p.svc / pv.paid, 0) end,
                         'avg_bill_retail', case when pv.paid > 0 then round((p.svc + p.retail) / pv.paid, 0) end,
                         'avg_bill_all',        case when p.visits > 0 then round(p.svc / p.visits, 0) end,
                         'avg_bill_retail_all', case when p.visits > 0 then round((p.svc + p.retail) / p.visits, 0) end,
                         'rebooked',        case when r.n > 0 then r.reb end,
                         'rebooking_pct',   case when r.v > 0 then round(100.0 * r.reb / r.v, 1) end,
                         'rebook_visits',   case when r.n > 0 then r.v end),
    'column_fill_pct', case when u.ah > 0 then round(100 * u.uh / u.ah, 1) end,
    'booked_hours',    round(coalesce(u.uh,0), 1),
    'available_hours', round(coalesce(u.ah,0), 1),
    'google_reviews',  (select count(*) from google_reviews g
                        where g.review_date between d1 and d2
                          and (
                            ((case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                                    when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end)
                                in (select s.branch union select distinct branch from phorest_staff_daily
                                    where employee_name = s.phorest_name and not is_total and date between d1 and d2)
                             and perf_review_names(s.ledger_names, g.comment, g.reviewer, (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA' when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) = s.branch))
                            or g.staff_manual && s.ledger_names)),
    'social_feed',     case when s.ig_handles is not null then
                         (select count(distinct x.media_id) from (
                            select t.media_id, t.posted_at from ig_tagged_posts t where lower(t.username) = any(s.ig_handles)
                            union all
                            select c.media_id, c.posted_at from ig_collab_posts c where lower(c.username) = any(s.ig_handles)
                          ) x where (x.posted_at at time zone 'Asia/Dubai')::date between greatest(d1, coalesce(perf_start_date(s), d1)) and d2) end,
    'social_workdays', case when s.ig_handles is not null then
                         (select count(*) from (
                            select date from branch_staff_daily
                            where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept
                              and date between d1 and d2 and coalesce(total,0) > 0
                            union
                            select date from phorest_staff_daily
                            where employee_name = s.phorest_name and not is_total
                              and date between d1 and d2 and coalesce(visits,0) > 0
                          ) w
                          where w.date in (
                            select (t.posted_at at time zone 'Asia/Dubai')::date from ig_tagged_posts t where lower(t.username) = any(s.ig_handles)
                            union select (c.posted_at at time zone 'Asia/Dubai')::date from ig_collab_posts c where lower(c.username) = any(s.ig_handles)
                            union select (m.mentioned_at at time zone 'Asia/Dubai')::date from ig_story_mentions m where lower(m.username) = any(s.ig_handles))) end,
    'start_date',      perf_start_date(s),
    'last_date',       p.last_date
  )
  from p, pv, r, l, u
$function$;
