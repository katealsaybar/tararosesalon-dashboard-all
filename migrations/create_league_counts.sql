-- Podium Race leagues (Kate, 8 Oct 2026): 2026 LEAGUES.xlsx ranks stylists on Instagram
-- posts/Reels and Google reviews as well as the ledger stats. This hands the whole active
-- roster's two figures back in one call for a date window. Same rules as perf_core's
-- 'social_feed' and 'google_reviews', so the race and Staff Benchmarks cannot disagree
-- (checked identical on three windows, 21 months down to a week), but set-based: perf_core
-- is called once per person and does far more than these two counts, which took 5.6 s for
-- 1 Jan 2025 to 8 Oct 2026; this takes 1.8 s. Same key check as perf_weeks: leader or
-- viewer. Names only, no tokens or emails. Already run live (the first version, which
-- called perf_core per person, was replaced the same day).
create or replace function public.league_counts(p_admin uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;
  return (
    with st as (select * from perf_staff where active),
    -- Posts that tag the salon or list her as collaborator, once each, from her start date.
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
    -- Branches each person worked in the window (Phorest), plus her home branch.
    wb as (select employee_name, branch from phorest_staff_daily where not is_total and date between p_from and p_to group by 1, 2),
    rv0 as (
      select g.comment, g.reviewer,
             case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                  when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end gb
      from google_reviews g where g.review_date between p_from and p_to
    ),
    rv as (
      select s.id, count(*) n
      from st s join rv0 r on (r.gb = s.branch or exists (select 1 from wb where wb.employee_name = s.phorest_name and wb.branch = r.gb))
      where perf_review_names(s.ledger_names, r.comment, r.reviewer, r.gb = s.branch)
      group by s.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'names', to_jsonb(s.ledger_names), 'name', s.display_name, 'dept', s.dept, 'branch', s.branch,
      'google_reviews', coalesce(rv.n, 0), 'social_feed', case when s.ig_handles is not null then coalesce(posts.n, 0) end
    )), '[]'::jsonb)
    from st s left join posts on posts.id = s.id left join rv on rv.id = s.id
  );
end $$;
grant execute on function public.league_counts(uuid, date, date) to anon, authenticated;
