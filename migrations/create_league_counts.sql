-- Podium Race leagues (Kate, 8 Oct 2026): 2026 LEAGUES.xlsx ranks stylists on Instagram
-- posts/Reels and Google reviews as well as the ledger stats. Those two counts live
-- per person in perf_core ('social_feed', 'google_reviews'), so this hands the whole
-- active roster's two figures back in one call for a date window. Same numbers as the
-- Staff Benchmarks page, so the two cannot disagree. Same key check as perf_weeks:
-- leader or viewer. Names only, no tokens or emails.
create or replace function public.league_counts(p_admin uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'names',          to_jsonb(s.ledger_names),
      'name',           s.display_name,
      'dept',           s.dept,
      'branch',         s.branch,
      'google_reviews', (c.j ->> 'google_reviews')::int,
      'social_feed',    (c.j ->> 'social_feed')::int
    )), '[]'::jsonb)
    from perf_staff s
    cross join lateral (select perf_core(s, p_from, p_to) j) c
    where s.active
  );
end $$;
grant execute on function public.league_counts(uuid, date, date) to anon, authenticated;
