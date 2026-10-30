-- perf_core as it was live before perf_core_strict_visits.sql (30 Oct 2026). Run this to roll back.
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
                         'clients',         p.visits,
                         'req',             p.rqs,
                         'new_clients',     p.pnew,
                         'request_pct',     case when p.visits > 0 then round(100.0 * p.rqs / p.visits, 1) end,
                         'avg_bill',        case when p.visits > 0 then round(p.svc / p.visits, 0) end,
                         'avg_bill_retail', case when p.visits > 0 then round((p.svc + p.retail) / p.visits, 0) end,
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
  from p, r, l, u
$function$;
