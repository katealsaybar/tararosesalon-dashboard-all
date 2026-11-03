-- Kate, 3 Nov 2026: Over the Years, every figure opens the rows behind it (drill.js). Two new reads, nothing existing is changed.
--
--   over_the_years_days(p_from, p_to, p_codes)   a row per branch and day: net takings (financial_totals.sales_net), clients through
--                        the door (the same rule oty_refresh() uses for oty_year_branch.vis, line for line) and clients per staff
--                        (phorest_staff_daily.visits on the staff rows). Added up over a year, or over 1 Jan to the same day, the days
--                        equal the year table's figures (checked on 2025: AQ, KCA, MC and SAA tie on all three). The page builds By month
--                        and By day from it, and a season's or a month's own days (season_br and oty_month_branch are sums of these days).
--                        Security invoker, so a branch-scoped login only reads its own branch; one year at a time (400 days at most).
--   over_the_years_ig_posts(p_month)   the Instagram posts behind a month's counts on the page (our posts and reels and stories from
--                        metricool_posts, collab posts, client tags). Those tables have row-level security and no policies, so this is
--                        security definer, Level 3 and above, as over_the_years_ig().

create or replace function public.over_the_years_days(p_from date, p_to date, p_codes text[])
returns jsonb language plpgsql stable security invoker set search_path to 'public' set work_mem to '128MB'
as $function$
declare out jsonb;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  if p_to - p_from > 400 then raise exception 'Ask for one year at a time'; end if;
  with
  m as (select f.date d, f.branch b, sum(f.sales_net) net from public.financial_totals f
        where f.branch = any(p_codes) and f.date between p_from and p_to group by 1, 2),
  l as (select l.branch b, l.date d, l.sale_id, l.item, l.employee_name, l.payment_raw, l.day_spend_ok, lower(trim(l.client_name)) cn
        from public.sales_transaction_lines l
        where l.branch = any(p_codes) and l.date between p_from and p_to and coalesce(trim(l.client_name), '') <> ''
          and l.client_name !~* '^\s*walk[\s-]*in\M' and l.client_name !~* '\mstaff\M'),
  kk as materialized (select ik, public.stl_item_kind(ik) kind from (select distinct coalesce(item, '') ik from l) d),
  vl as (select l.b, l.d, l.cn, (kk.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') is_real,
                (bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.b, l.d, l.sale_id) and l.day_spend_ok) sale_paid
         from l join kk on kk.ik = coalesce(l.item, '')),
  vd as (select b, d, cn from vl group by b, d, cn having bool_or(is_real and sale_paid)),
  v as (select b, d, count(*)::int vis from vd group by 1, 2),
  s as (select p.branch b, p.date d, sum(p.visits)::int stf from public.phorest_staff_daily p
        where not p.is_total and p.branch = any(p_codes) and p.date between p_from and p_to group by 1, 2),
  k as (select d, b from m union select d, b from v union select d, b from s)
  select coalesce(jsonb_agg(jsonb_build_object('d', k.d, 'b', k.b, 'net', m.net, 'vis', v.vis, 'stf', s.stf) order by k.d, k.b), '[]') into out
  from k left join m using (d, b) left join v using (d, b) left join s using (d, b);
  return out;
end;
$function$;
grant execute on function public.over_the_years_days(date, date, text[]) to authenticated;

create or replace function public.over_the_years_ig_posts(p_month text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare mm date; out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Instagram is for Level 3 and above';
  end if;
  mm := (p_month || '-01')::date;
  select coalesce(jsonb_agg(r order by r.posted desc), '[]') into out from (
    select 'own' kind, p.posted_at posted, p.kind sub, left(coalesce(p.caption, ''), 160) txt, p.url
      from public.metricool_posts p where p.network = 'instagram' and p.kind in ('post', 'reel') and p.posted_at >= mm and p.posted_at < mm + interval '1 month'
    union all
    select 'collab', c.posted_at, null, c.username, c.permalink
      from public.ig_collab_posts c where c.posted_at >= mm and c.posted_at < mm + interval '1 month'
    union all
    select 'tag', t.posted_at, t.media_type, t.username, t.permalink
      from public.ig_tagged_posts t where t.posted_at >= mm and t.posted_at < mm + interval '1 month'
    union all
    select 'story', p.posted_at, p.kind, left(coalesce(p.caption, ''), 160), p.url
      from public.metricool_posts p where p.network = 'instagram' and p.kind = 'story' and p.posted_at >= mm and p.posted_at < mm + interval '1 month') r;
  return out;
end;
$function$;
grant execute on function public.over_the_years_ig_posts(text) to authenticated;
