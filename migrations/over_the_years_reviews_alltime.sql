-- Kate, 11 Nov 2026: Over the Years, Google reviews section. Read-only helper, applied live 11 Nov 2026.
-- The yearly bars come from oty_year_branch (reviews dated 2021 onward only), so the page never showed how many reviews each
-- branch really holds. This returns, per branch code, the all-time count and average (the same rows the Reviews page counts),
-- how many are dated before 2021, how many carry an exact date (date_approx false) and how many fall in the last 12 months.
-- Google only says "a year ago / 2 years ago" for older reviews, and the sync files each of those on Sep of that year, so the
-- years before 2026 are buckets, not calendar years; the page now says so instead of comparing 2026 with 2025 on the same days.
-- Same guard as the other Over the Years feeds: a dashboard login, and a branch login only sees its own branch.
create or replace function public.over_the_years_reviews_alltime()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare out jsonb;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  select jsonb_build_object(
    'asof', (select max(review_date) from public.google_reviews),
    'rows', coalesce(jsonb_agg(jsonb_build_object('b', b, 'n', n, 'st', st, 'pre', pre, 'exact', exact, 'l12', l12) order by b), '[]'::jsonb)
  ) into out
  from (
    select case branch when 'Saadiyat, Abu Dhabi' then 'SAA' when 'Khalifa City A, Abu Dhabi' then 'KCA'
                       when 'Motor City, Dubai' then 'MC' when 'Al Quoz, Dubai' then 'AQ'
                       when 'Marasy, Abu Dhabi' then 'MRY' when 'Fratelli Barbershop, Al Quoz' then 'FRT' end b,
           count(*)::int n, round(avg(stars)::numeric, 2) st,
           (count(*) filter (where review_date < '2021-01-01'))::int pre,
           (count(*) filter (where not coalesce(date_approx, false)))::int exact,
           (count(*) filter (where review_date >= current_date - interval '12 months'))::int l12
    from public.google_reviews group by 1
  ) t
  where b is not null and (public.dashboard_scope() is null or b = public.dashboard_scope());
  return out;
end; $$;
revoke all on function public.over_the_years_reviews_alltime() from public, anon;
grant execute on function public.over_the_years_reviews_alltime() to authenticated;
