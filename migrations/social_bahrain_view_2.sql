-- Social, the Bahrain view, part 2 (Kate, 23 Nov 2026).
-- social_bahrain_view.sql made every Metricool function read the main brand only and gave social_report a brand. The Social page also needs:
--   1. each post to say how it went out (metricool_posts.source: manual or metricool), as the Content Calendar already reads it, so Social
--      no longer needs a second call for it;
--   2. content_calendar_stories and content_calendar_story_stats to take the same p_branch ('BAH' = Bahrain's own accounts, anything else the
--      main brand, as before), so the Bahrain view never shows the UAE account's stories.
-- Each function is rewritten from its live definition; a pattern not found exactly once stops the whole migration. Run again, it changes nothing.

create or replace function pg_temp.mig_rep(def text, old text, new text, expect int default 1) returns text language plpgsql as $f$
declare n int;
begin
  n := (length(def) - length(replace(def, old, ''))) / length(old);
  if n <> expect then raise exception 'pattern "%" found % times, expected %', left(old, 70), n, expect; end if;
  return replace(def, old, new);
end $f$;

do $mig$
declare
  def text;
  mainf text := 'p.brand_id in (select x.brand_id from public.metricool_brands x where x.branch is null) and ';
  brf   text := 'p.brand_id in (select x.brand_id from public.metricool_brands x where case when upper(coalesce(p_branch, '''')) = ''BAH'' then x.branch = ''BAH'' else x.branch is null end) and ';
begin
  -- 1. every post carries its source
  def := pg_get_functiondef('public.social_report(date, date, text)'::regprocedure);
  if def not like '%''source'', p.source%' then
    execute pg_temp.mig_rep(def, $p$'caption', left(p.caption, 300), 'url', p.url,$p$, $p$'caption', left(p.caption, 300), 'source', p.source, 'url', p.url,$p$);
  end if;

  -- 2. the story functions take a brand
  if to_regprocedure('public.content_calendar_stories(date, date)') is not null then
    def := pg_get_functiondef('public.content_calendar_stories(date, date)'::regprocedure);
    def := pg_temp.mig_rep(def, 'public.content_calendar_stories(p_from date, p_to date)', 'public.content_calendar_stories(p_from date, p_to date, p_branch text DEFAULT NULL::text)');
    def := pg_temp.mig_rep(def, mainf, brf);
    execute def;
    drop function public.content_calendar_stories(date, date);
  end if;
  if to_regprocedure('public.content_calendar_story_stats(date, date)') is not null then
    def := pg_get_functiondef('public.content_calendar_story_stats(date, date)'::regprocedure);
    def := pg_temp.mig_rep(def, 'public.content_calendar_story_stats(p_from date, p_to date)', 'public.content_calendar_story_stats(p_from date, p_to date, p_branch text DEFAULT NULL::text)');
    def := pg_temp.mig_rep(def, mainf, brf);
    execute def;
    drop function public.content_calendar_story_stats(date, date);
  end if;
end
$mig$;

-- the story numbers keep the grants they had: signed in people only, and the level check inside content_calendar_story_stats
revoke all on function public.content_calendar_story_stats(date, date, text) from public, anon;
grant execute on function public.content_calendar_story_stats(date, date, text) to authenticated, service_role;
-- content_calendar_stories had no level check and open grants; it keeps them (the calendar frame reads it), see the note in the reply
grant execute on function public.content_calendar_stories(date, date, text) to authenticated, service_role;
