-- Kate, 5 Oct 2026: My Numbers gets a Ledger | Phorest switch. Stylists
-- read their client counts and rebooking in Phorest and found the page's figures
-- "completely different": sales are Phorest's, but clients, requests, new clients and
-- rebooking come from the hand-typed branch ledger. perf_core now also returns
-- Phorest's own counts under 'phorest' (visits, RQs, new clients from Staff Daily), and
-- perf_dashboard's days carry 'phorest_clients', so the page can show either.
-- Rebooking is not in any Phorest report we pull yet, so there is none on the Phorest side.
-- Everything else in both functions is unchanged from the live definitions.

create or replace function perf_core(s perf_staff, d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select coalesce(sum(services_ex_vat),0) svc, coalesce(sum(products_ex_vat),0) retail,
           coalesce(sum(visits),0) visits, coalesce(sum(rqs),0) rqs, coalesce(sum(new_clients),0) pnew,
           max(date) last_date
    from phorest_staff_daily
    where employee_name = s.phorest_name and not is_total and date between d1 and d2
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
                         'avg_bill_retail', case when p.visits > 0 then round((p.svc + p.retail) / p.visits, 0) end),
    'column_fill_pct', case when u.ah > 0 then round(100 * u.uh / u.ah, 1) end,
    'booked_hours',    round(coalesce(u.uh,0), 1),
    'available_hours', round(coalesce(u.ah,0), 1),
    'google_reviews',  (select count(*) from google_reviews g
                        where g.review_date between d1 and d2
                          and (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                                    when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end)
                              in (select s.branch union select distinct branch from phorest_staff_daily
                                  where employee_name = s.phorest_name and not is_total and date between d1 and d2)
                          and perf_review_names(s.ledger_names, g.comment, g.reviewer, (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA' when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) = s.branch)),
    -- Kate, 28 Sep 2026: her own posts tagging @tararosesalon, plus the salon's posts
    -- she is a collaborator on (each collaborator counts it once, Kate's call), Dubai
    -- dates, a post counted once even if it is both. null while no handle is on file.
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
  from p, l, u
$$;

create or replace function perf_dashboard(p_token uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare
  s perf_staff;
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  m2 date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month - 1 day')::date;
  lvl_order int;
  weeks jsonb;
  days jsonb;
begin
  select * into s from perf_staff where token = p_token and active;
  if not found then return null; end if;

  select level_order into lvl_order from perf_benchmarks where level = s.level limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('week_start', w, 'numbers', perf_core(s, greatest(w, m1), least(w + 6, m2))) order by w), '[]')
    into weeks
  from generate_series(date_trunc('week', m1::timestamp), m2::timestamp, interval '7 day') g(g0), lateral (select g0::date w) x;

  select coalesce(jsonb_agg(jsonb_build_object('date', d, 'total_revenue', round(coalesce(p.svc,0), 2), 'clients', coalesce(l.clients,0),
                                               'phorest_clients', coalesce(p.visits,0)) order by d), '[]')
    into days
  from (select g0::date d from generate_series(m1::timestamp, m2::timestamp, interval '1 day') g(g0)) x
  left join (select date, sum(services_ex_vat) svc, sum(visits) visits from phorest_staff_daily
             where employee_name = s.phorest_name and not is_total and date between m1 and m2 group by date) p on p.date = x.d
  left join (select date, sum(total) clients from branch_staff_daily
             where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between m1 and m2 group by date) l on l.date = x.d;

  return jsonb_build_object(
    'staff', jsonb_build_object('name', s.display_name, 'branch', s.branch, 'dept', s.dept, 'level', s.level, 'keys', s.ledger_names),
    'month', m1,
    'numbers', perf_core(s, m1, m2) || perf_clients(s, m1, m2) || perf_reviews(s, m1, m2) || perf_socials(s, m1, m2) || perf_reputation(s, m2) || perf_leave(s, m1, m2),
    'weeks', weeks,
    'days', days,
    'history', (select jsonb_agg(jsonb_build_object('month', mm, 'numbers', perf_core(s, mm, (mm + interval '1 month - 1 day')::date)) order by mm)
                from (select (m1 - (k || ' month')::interval)::date mm from generate_series(1, 3) k) h),
    'benchmarks', (select jsonb_object_agg(kpi, jsonb_build_object('min', minimum, 'target', target))
                   from perf_benchmarks where level = s.level),
    'next_level', (select level from perf_benchmarks where level_order = lvl_order + 1 limit 1),
    'next_benchmarks', (select jsonb_object_agg(kpi, jsonb_build_object('min', minimum, 'target', target))
                        from perf_benchmarks where level_order = lvl_order + 1),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'author', author, 'note', note, 'at', created_at) order by created_at), '[]')
              from perf_notes where staff_id = s.id and month = m1),
    'data_through', jsonb_build_object(
      'revenue', (select max(date) from phorest_staff_daily),
      'clients', (select max(date) from branch_staff_daily where total > 0),
      'column_fill', (select max(date_to) from staff_utilisation),
      'client_history', (select max(date) from sales_transaction_lines),
      'reviews', (select max(review_date) from google_reviews))
  );
end $function$;
