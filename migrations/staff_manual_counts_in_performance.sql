-- Kate, 9 Oct 2026: a hand tag on a Google review (google_reviews.staff_manual, staff keys)
-- now counts for that stylist on the Staff Performance side too, not only on the Google
-- Reviews page. Before this, the page showed "Ashleigh" on a review that wrote "Ashely" or
-- that a client left at the wrong branch, but My Numbers, Staff Dashboards and the league
-- counts still missed it, because perf_review_names reads the text only.
--
-- A hand tag ADDS to what the text names (it never removes a name), and it skips the branch
-- check: clients review the wrong salon, and staff move between salons.
-- A tagged review is also left out of google_review_client_credit, so the client's last
-- stylist does not get a second credit for it.
-- Applied live the same day. Only reviews with staff_manual set are affected.

create or replace function public.perf_reviews(s perf_staff, d1 date, d2 date)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with br as (
    select s.branch b
    union select distinct branch from phorest_staff_daily
      where employee_name = s.phorest_name and not is_total and date between d1 and d2
  ), named as (
    select g.review_id, g.review_date, g.stars, g.comment, g.branch, g.reviewer, g.url, g.photos, 'named' how
    from google_reviews g
    where g.review_date between d1 and d2
      and (
        ((case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) in (select b from br)
         and perf_review_names(s.ledger_names, g.comment, g.reviewer, (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA' when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) = s.branch))
        or g.staff_manual && s.ledger_names)
  ), client as (
    select g.review_id, g.review_date, g.stars, g.comment, g.branch, g.reviewer, g.url, g.photos, 'client' how
    from google_review_client_credit c join google_reviews g using (review_id)
    where c.phorest_name = s.phorest_name and c.review_date between d1 and d2
      and g.review_id not in (select review_id from named)
  ), r as (select * from named union all select * from client)
  select jsonb_build_object(
    'google_reviews', (select count(*) from r),
    'google_reviews_named', (select count(*) from named),
    'review_stars',   (select round(avg(stars), 1) from r),
    'review_list',    (select coalesce(jsonb_agg(jsonb_build_object('id', review_id, 'date', review_date, 'stars', stars, 'comment', left(coalesce(comment,''), 600), 'how', how, 'branch', branch, 'reviewer', reviewer, 'url', url, 'photos', coalesce(to_jsonb(photos), '[]'::jsonb)) order by review_date desc), '[]') from r)
  )
$function$;

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

create or replace function public.league_counts(p_admin uuid, p_from date, p_to date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;
  return (
    with st as (select * from perf_staff where active),
    posts as (
      select s.id, count(distinct x.media_id) n
      from st s
      join lateral (
        select t.media_id, t.posted_at from ig_tagged_posts t where lower(t.username) = any(s.ig_handles)
        union all
        select c.media_id, c.posted_at from ig_collab_posts c where lower(c.username) = any(s.ig_handles)
      ) x on true
      where s.ig_handles is not null
        and (x.posted_at at time zone 'Asia/Dubai')::date between greatest(p_from, coalesce(s.started_on, p_from)) and p_to
      group by s.id
    ),
    wb as (select employee_name, branch from phorest_staff_daily where not is_total and date between p_from and p_to group by 1, 2),
    rv0 as (
      select g.comment, g.reviewer, g.staff_manual man,
             case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                  when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end gb
      from google_reviews g where g.review_date between p_from and p_to
    ),
    rv as (
      select s.id, count(*) n
      from st s join rv0 r on (r.gb = s.branch or exists (select 1 from wb where wb.employee_name = s.phorest_name and wb.branch = r.gb) or r.man && s.ledger_names)
      where perf_review_names(s.ledger_names, r.comment, r.reviewer, r.gb = s.branch) or r.man && s.ledger_names
      group by s.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'names', to_jsonb(s.ledger_names), 'name', s.display_name, 'dept', s.dept, 'branch', s.branch,
      'google_reviews', coalesce(rv.n, 0), 'social_feed', case when s.ig_handles is not null then coalesce(posts.n, 0) end
    )), '[]'::jsonb)
    from st s left join posts on posts.id = s.id left join rv on rv.id = s.id
  );
end $function$;

create or replace view public.google_review_client_credit as
 WITH visits AS MATERIALIZED (
         SELECT DISTINCT g.review_id,
            g.review_date,
            g.branch,
            g.comment,
            s.employee_name
           FROM google_reviews g
             JOIN sales_transaction_lines s ON lower(TRIM(BOTH FROM s.client_name)) = lower(TRIM(BOTH FROM g.reviewer)) AND s.date >= (g.review_date - 14) AND s.date <= g.review_date
          WHERE NOT COALESCE(g.date_approx, false) AND COALESCE(g.reviewer, ''::text) <> ''::text
        )
 SELECT DISTINCT v.review_id,
    v.review_date,
    v.branch,
    ( SELECT n.staff_key
           FROM staff_name_variants n
          WHERE n.staff_key = ANY (ps.ledger_names)
         LIMIT 1) AS staff_key,
    ps.phorest_name
   FROM visits v
     JOIN perf_staff ps ON ps.phorest_name = v.employee_name
  WHERE NOT review_names_anyone(COALESCE(v.comment, ''::text))
    AND NOT EXISTS (SELECT 1 FROM google_reviews gm WHERE gm.review_id = v.review_id AND cardinality(gm.staff_manual) > 0)
    AND ( SELECT is_dashboard_user() AS is_dashboard_user);
