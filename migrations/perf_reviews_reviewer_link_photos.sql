-- Kate, 7 Oct 2026: each review in a stylist's page (Staff Benchmarks and her /me/ link)
-- now carries who wrote it, its own Google link and any photos the client attached.
-- Before, review_list held only date, stars, comment, how and branch, so the page could
-- show no reviewer name and "Read on Google" could only open the branch's Maps search.
-- id = google_reviews.review_id and url = the Business Profile link, which performance.js
-- turns into the review's public Google link (same rule as add ons/google-reviews/app.js).
-- Already run live.
create or replace function perf_reviews(s perf_staff, d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  with br as (
    select s.branch b
    union select distinct branch from phorest_staff_daily
      where employee_name = s.phorest_name and not is_total and date between d1 and d2
  ), named as (
    select g.review_id, g.review_date, g.stars, g.comment, g.branch, g.reviewer, g.url, g.photos, 'named' how
    from google_reviews g
    where g.review_date between d1 and d2
      and (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) in (select b from br)
      and perf_review_names(s.ledger_names, g.comment, g.reviewer, (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA' when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) = s.branch)
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
$$;
