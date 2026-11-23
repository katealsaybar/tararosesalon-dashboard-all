-- Social, a Bahrain view (Kate, 23 Nov 2026).
-- Bahrain's own Instagram and Facebook are connected to its Metricool brand, so their posts, stories and numbers will sit in
-- metricool_posts, metricool_daily and metricool_snapshots beside the main brand's. Two changes:
--   1. Every function that read Metricool posts, stories or best-time snapshots without naming a brand now reads the MAIN brand only
--      (metricool_brands.branch is null), so nothing in the UAE views, the Content Calendar or Over the Years changes.
--   2. social_report takes p_branch: 'BAH' is Bahrain's own accounts (no YouTube, no website visits), anything else is the main brand, as before.
-- Each function is rewritten from its own live definition with the filter put in exactly once; a pattern that is not found exactly the
-- expected number of times stops the whole migration. todo_refresh already works brand by brand and is not touched.
-- Run it again and it changes nothing (a function that already carries the filter is skipped).

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
  mb  text := 'p.brand_id in (select x.brand_id from public.metricool_brands x where x.branch is null) and ';
  mbs text := 'brand_id in (select x.brand_id from public.metricool_brands x where x.branch is null) and ';
begin
  -- 1. the main brand only
  def := pg_get_functiondef('public.content_calendar_post_stats(date, date)'::regprocedure);
  if def not like '%x.branch is null%' then
    execute pg_temp.mig_rep(def, $p$where p.kind <> 'story' and p.network in ('instagram', 'facebook', 'tiktok') and p.post_date between$p$,
      'where ' || mb || $p$p.kind <> 'story' and p.network in ('instagram', 'facebook', 'tiktok') and p.post_date between$p$);
  end if;

  def := pg_get_functiondef('public.content_calendar_posts(date, date)'::regprocedure);
  if def not like '%x.branch is null%' then
    def := pg_temp.mig_rep(def, $p$where p.kind <> 'story' and p.network in ('instagram', 'facebook', 'tiktok') and p.post_date between$p$,
      'where ' || mb || $p$p.kind <> 'story' and p.network in ('instagram', 'facebook', 'tiktok') and p.post_date between$p$);
    def := pg_temp.mig_rep(def, $p$from metricool_snapshots where kind = 'besttime' group by network, kind$p$,
      $p$from metricool_snapshots where kind = 'besttime' and $p$ || mbs || $p$true group by network, kind$p$);
    execute def;
  end if;

  def := pg_get_functiondef('public.content_calendar_stories(date, date)'::regprocedure);
  if def not like '%x.branch is null%' then
    execute pg_temp.mig_rep(def, $p$where p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between$p$,
      'where ' || mb || $p$p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between$p$);
  end if;

  def := pg_get_functiondef('public.content_calendar_story_stats(date, date)'::regprocedure);
  if def not like '%x.branch is null%' then
    execute pg_temp.mig_rep(def, $p$where p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between$p$,
      'where ' || mb || $p$p.kind = 'story' and p.network in ('instagram', 'facebook') and p.post_date between$p$);
  end if;

  def := pg_get_functiondef('public.over_the_years_ig()'::regprocedure);
  if def not like '%x.branch is null%' then
    execute pg_temp.mig_rep(def, $p$public.metricool_posts p where p.network = 'instagram'$p$,
      'public.metricool_posts p where ' || mb || $p$p.network = 'instagram'$p$, 2);
  end if;

  def := pg_get_functiondef('public.over_the_years_ig_posts(text)'::regprocedure);
  if def not like '%x.branch is null%' then
    execute pg_temp.mig_rep(def, $p$public.metricool_posts p where p.network = 'instagram'$p$,
      'public.metricool_posts p where ' || mb || $p$p.network = 'instagram'$p$, 2);
  end if;

  -- 2. social_report with a brand: the new three-argument function is made from the old one, then the old one goes
  if to_regprocedure('public.social_report(date, date)') is not null then
    def := pg_get_functiondef('public.social_report(date, date)'::regprocedure);
    def := pg_temp.mig_rep(def, 'public.social_report(p_from date, p_to date)', 'public.social_report(p_from date, p_to date, p_branch text DEFAULT NULL::text)');
    def := pg_temp.mig_rep(def, 'declare out jsonb;',
      $p$declare out jsonb; bah boolean := upper(coalesce(p_branch, '')) = 'BAH';
  bids bigint[] := array(select x.brand_id from public.metricool_brands x where case when upper(coalesce(p_branch, '')) = 'BAH' then x.branch = 'BAH' else x.branch is null end);$p$);
    def := pg_temp.mig_rep(def, $p$where d.network <> 'gmb' and (b.branch is null or d.network = 'youtube') and d.date between p_from and p_to$p$,
      $p$where d.network <> 'gmb' and (case when bah then d.brand_id = any(bids) and d.network <> 'youtube' else (b.branch is null or d.network = 'youtube') end) and d.date between p_from and p_to$p$);
    def := pg_temp.mig_rep(def, $p$where (b.branch is null or d.network = 'youtube') and d.metric in ('followers', 'followers_count', 'pageFollows', 'totalSubscribers')$p$,
      $p$where (case when bah then d.brand_id = any(bids) and d.network not in ('youtube', 'gmb') else (b.branch is null or d.network = 'youtube') end) and d.metric in ('followers', 'followers_count', 'pageFollows', 'totalSubscribers')$p$);
    def := pg_temp.mig_rep(def, $p$from metricool_posts p where p.kind <> 'story' and p.post_date between p_from and p_to)$p$,
      $p$from metricool_posts p where p.brand_id = any(bids) and p.kind <> 'story' and p.post_date between p_from and p_to)$p$);
    def := pg_temp.mig_rep(def, $p$from metricool_posts p where p.kind = 'story' and p.post_date between p_from and p_to group by network$p$,
      $p$from metricool_posts p where p.brand_id = any(bids) and p.kind = 'story' and p.post_date between p_from and p_to group by network$p$);
    def := pg_temp.mig_rep(def, $p$from metricool_posts t where t.network = p.network and t.kind = 'story'$p$,
      $p$from metricool_posts t where t.brand_id = any(bids) and t.network = p.network and t.kind = 'story'$p$);
    def := pg_temp.mig_rep(def, $p$from metricool_snapshots group by network, kind) k$p$,
      $p$from metricool_snapshots where (case when bah then brand_id = any(bids) and network <> 'youtube' else (brand_id = any(bids) or network = 'youtube') end) group by network, kind) k$p$);
    def := pg_temp.mig_rep(def, $p$'web', jsonb_build_object($p$, $p$'web', case when bah then null else jsonb_build_object($p$);
    def := pg_temp.mig_rep(def, $p$group by channel) c)),$p$, $p$group by channel) c)) end,$p$);
    def := pg_temp.mig_rep(def, $p$join metricool_brands b using (brand_id) where b.branch is null)$p$, $p$join metricool_brands b using (brand_id) where d.brand_id = any(bids))$p$);
    execute def;
    drop function public.social_report(date, date);
  end if;
end
$mig$;

revoke all on function public.social_report(date, date, text) from public, anon;
grant execute on function public.social_report(date, date, text) to authenticated, service_role;
