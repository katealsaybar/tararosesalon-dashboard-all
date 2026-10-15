-- Kate, 15 Oct 2026: the to-do list split into categories, ranked High / Mid / Low, and opened by level.
-- Builds on todo_items.sql.
--
--   staff        Staff stats, one item per KPI per branch (rebooking, request, average bill, column fill,
--                retail %, treatments %, colour %, conversion, retention) against the stylist level's
--                minimum in perf_benchmarks, last 28 days. Daily (todo_refresh_staff, 22:30 Dubai):
--                perf_core for 48 stylists takes about 20 seconds, too slow for the hourly run.
--   social       Instagram: no post for 3+ days, reach down on the last 4 weeks, followers falling.
--   ads          Google Ads: data stopped, cost per conversion up, a campaign spending with no conversions.
--   reviews      Google reviews with no reply (3 stars or fewer is High).
--   seo          Search clicks, impressions, site sessions and average position, this week against last.
--   lost         Lost Clients: review sheet not signed off, failed sends, high-value clients near the lost line.
--   campaign     Wellness Voucher deadline (31 Oct). The voucher sales themselves live in the voucher pack's
--                own database, so there is nothing to measure here yet.
--   supply       Orders not arrived after 3 weeks; products out or under a week of cover from real shelf counts
--                (stock_levels, todo_supply_low.sql, 15 Oct 2026). The fast-movers-overdue guess is retired.
--   suggestions  Team Home suggestions still marked new.
--   branch       A branch behind the month's open-day pace against its services target.
--   data         Missing daily reports and syncs that stopped. Level 5.
--
-- Priority is todo_items.severity: 1 High, 2 Mid, 3 Low. Who sees a category is todo_categories.min_level
-- (Level 5 sees all); a login with a branch scope in dashboard_users only sees that branch's items.
-- Change a category's level here, not in the page. kb_sections 'todo' opens the page from Level 2.

alter table public.todo_items add column if not exists category text;
alter table public.todo_items add column if not exists sub text;
update public.todo_items set category = case rule when 'ledger' then 'data' when 'sync' then 'data'
  when 'pace' then 'branch' when 'review' then 'reviews' else 'data' end where category is null;
delete from public.todo_items where rule = 'rebook';   -- replaced by the KPI items
alter table public.todo_items alter column category set not null;
alter table public.todo_items drop constraint if exists todo_items_severity_check;
alter table public.todo_items add constraint todo_items_severity_check check (severity in (1, 2, 3));

create table if not exists public.todo_categories (
  key       text primary key,
  title     text not null,
  min_level smallint not null,
  sort      int not null
);
alter table public.todo_categories enable row level security;
revoke all on public.todo_categories from anon, authenticated;
grant select on public.todo_categories to authenticated;
drop policy if exists todo_categories_read on public.todo_categories;
create policy todo_categories_read on public.todo_categories for select to authenticated
  using ((select public.kb_can_read('todo')) and min_level <= (select public.kb_level()));
insert into public.todo_categories (key, title, min_level, sort) values
  ('staff',       'Staff stats',          3, 10),
  ('social',      'Social media',         3, 20),
  ('ads',         'Google Ads',           3, 30),
  ('reviews',     'Google reviews',       2, 40),
  ('seo',         'SEO',                  3, 50),
  ('lost',        'Lost clients',         2, 60),
  ('campaign',    'Campaigns',            3, 70),
  ('supply',      'Product supply',       2, 80),
  ('suggestions', 'Staff suggestions',    3, 90),
  ('branch',      'Branch targets',       2, 100),
  ('data',        'Reports and syncs',    5, 110)
on conflict (key) do update set title = excluded.title, min_level = excluded.min_level, sort = excluded.sort;

update public.kb_sections set min_level = 2 where key = 'todo';

create or replace function public.todo_can_see(p_cat text, p_branch text) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((
    with me as (select public.kb_me_email() em)
    select case
      when public.kb_level_for(me.em) is null then false
      when public.kb_level_for(me.em) = 5 then true
      else exists (select 1 from public.todo_categories c
                    where c.key = p_cat and c.min_level <= public.kb_level_for(me.em))
           and coalesce((select nullif(d.scope, '') from public.dashboard_users d where d.email = me.em), p_branch) is not distinct from p_branch
    end from me), false)
$$;
revoke all on function public.todo_can_see(text, text) from public, anon;
grant execute on function public.todo_can_see(text, text) to authenticated;

drop policy if exists todo_items_read on public.todo_items;
create policy todo_items_read on public.todo_items for select to authenticated
  using ((select public.kb_can_read('todo')) and public.todo_can_see(category, branch));
drop policy if exists todo_items_change on public.todo_items;
create policy todo_items_change on public.todo_items for update to authenticated
  using ((select public.kb_can_read('todo')) and public.todo_can_see(category, branch))
  with check ((select public.kb_can_read('todo')) and public.todo_can_see(category, branch));

create or replace function public.todo_branch_name(c text) returns text
language sql immutable set search_path to '' as $$
  select case c when 'SAA' then 'Saadiyat' when 'KCA' then 'Khalifa City A' when 'MC' then 'Motor City'
                when 'AQ' then 'Al Quoz' when 'BAH' then 'Bahrain' else coalesce(c, 'all branches') end
$$;
create or replace function public.todo_kpi_label(k text) returns text
language sql immutable set search_path to '' as $$
  select case k when 'rebooking_pct' then 'Rebooking' when 'request_pct' then 'Request'
    when 'avg_bill' then 'Average bill' when 'column_fill_pct' then 'Column fill'
    when 'retail_pct' then 'Retail %' when 'treatments_pct' then 'Treatments %'
    when 'colour_pct' then 'Colour %' when 'conversion_pct' then 'Conversion'
    when 'retention_pct' then 'Retention' else k end
$$;
create or replace function public.todo_kpi_fmt(k text, v numeric) returns text
language sql immutable set search_path to '' as $$
  select case when k = 'avg_bill' then 'AED ' || round(v) else regexp_replace(round(v, 1)::text, '\.0$', '') || '%' end
$$;

-- Writes whatever the caller left in the temp table cand, and closes items of the named rules that
-- are no longer in it. An item ticked Done stays ticked while the same key is still true.
create or replace function public.todo_apply(p_rules text[]) returns void
language plpgsql security definer set search_path to 'public' as $$
declare today date := (now() at time zone 'Asia/Dubai')::date;
begin
  insert into todo_items as t (key, rule, category, sub, branch, title, detail, link, severity, status, first_seen, last_seen)
  select key, rule, category, sub, branch, title, detail, link, severity, 'open', today, now() from cand
  on conflict (key) do update set
    rule = excluded.rule, category = excluded.category, sub = excluded.sub, branch = excluded.branch,
    title = excluded.title, detail = excluded.detail, link = excluded.link, severity = excluded.severity,
    last_seen = now(),
    first_seen = case when t.status = 'closed' then today else t.first_seen end,
    status = case when t.status = 'closed' then 'open'
                  when t.status = 'snoozed' and t.snoozed_until <= today then 'open'
                  else t.status end,
    snoozed_until = case when t.status = 'closed' or (t.status = 'snoozed' and t.snoozed_until <= today)
                         then null else t.snoozed_until end,
    closed_at = case when t.status = 'closed' then null else t.closed_at end,
    done_at = case when t.status = 'closed' then null else t.done_at end,
    done_by = case when t.status = 'closed' then null else t.done_by end;
  update todo_items set status = 'closed', closed_at = now(), snoozed_until = null
   where rule = any(p_rules) and status <> 'closed' and key not in (select key from cand);
end $$;
revoke all on function public.todo_apply(text[]) from public, anon, authenticated;

-- The hourly run: everything that reads quickly.
create or replace function public.todo_refresh() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  today date := (now() at time zone 'Asia/Dubai')::date;
  mstart date := date_trunc('month', (now() at time zone 'Asia/Dubai'))::date;
  wk text := to_char((now() at time zone 'Asia/Dubai')::date, 'IYYY-"W"IW');
  n integer;
begin
  create temp table cand (key text primary key, rule text, category text, sub text, branch text, title text,
                          detail text, link text, severity smallint) on commit drop;
  create temp table br (code text, name text, ord int) on commit drop;
  insert into br values ('SAA', 'Saadiyat', 1), ('KCA', 'Khalifa City A', 2), ('MC', 'Motor City', 3), ('AQ', 'Al Quoz', 4);

  -- data: a branch day with no Financial Totals row and no closed_days row
  insert into cand
  select 'ledger:' || d.dt, 'ledger', 'data', null, null,
         'Reports missing for ' || to_char(d.dt, 'Dy DD Mon'),
         'No Financial Totals for ' || string_agg(b.name, ', ' order by b.ord) || '. Run /daily-reports for that date.',
         '/?view=ledgerFinancials', 1
  from (select today - i dt from generate_series(1, 14) i) d
  cross join br b
  where not exists (select 1 from financial_totals f where f.branch = b.code and f.date = d.dt)
    and not exists (select 1 from closed_days c where c.branch = b.code and c.date = d.dt)
  group by d.dt;

  -- data: a sync that stopped or is failing
  insert into cand
  select 'sync:' || h.name, 'sync', 'data', null, null,
         h.name || case when h.last_error is not null then ' is failing' else ' has stopped syncing' end,
         'Last good run ' || coalesce(to_char(h.last_ok_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI'), 'never')
           || coalesce('. ' || left(h.last_error, 140), ''),
         null, 1
  from sync_health h
  where h.name not in ('todo-refresh', 'todo-refresh-staff')
    and (h.last_ok_at is null or h.last_ok_at < now() - interval '36 hours' or h.last_error is not null)
    and not (h.name = 'lost-send-worker' and not coalesce((select enabled from lost_send_config limit 1), false));

  -- branch: behind the month's open-day pace
  create temp table closing_dow (branch text, dow int) on commit drop;
  insert into closing_dow
  select f.branch, extract(dow from f.date)::int
  from financial_totals f
  where f.date >= today - 56 and f.date < today and f.branch in (select code from br)
  group by 1, 2
  having count(*) filter (where coalesce(f.sales_net, 0) = 0) >= 6;

  insert into cand
  select 'pace:' || b.code || ':' || to_char(mstart, 'YYYY-MM'), 'pace', 'branch', null, b.code,
         b.name || ' is behind target pace',
         'Services AED ' || to_char(round(p.svc), 'FM999,999,999') || ' of AED ' || to_char(round(t.actual_target), 'FM999,999,999')
           || ' (' || round(100 * p.svc / t.actual_target) || '%). The month is ' || round(100 * p.exp)
           || '% through its open days.',
         '/?view=ledgerActuals',
         case when p.exp - p.svc / t.actual_target >= 0.10 then 1 else 2 end
  from br b
  join branch_targets t on t.branch = b.code and t.month = mstart and coalesce(t.actual_target, 0) > 0
  cross join lateral (
    select coalesce((select sum(f.services_net) from financial_totals f
                      where f.branch = b.code and f.date >= mstart and f.date < today), 0) svc,
           (select count(*)::numeric from generate_series(mstart::timestamp, (today - 1)::timestamp, interval '1 day') g(d)
             where extract(dow from g.d)::int not in (select dow from closing_dow where branch = b.code)
               and not exists (select 1 from closed_days c where c.branch = b.code and c.date = g.d::date))
           / nullif((select count(*) from generate_series(mstart::timestamp, (mstart + interval '1 month - 1 day')::timestamp, interval '1 day') g(d)
                      where extract(dow from g.d)::int not in (select dow from closing_dow where branch = b.code)), 0) exp,
           (select count(*) from generate_series(mstart::timestamp, (today - 1)::timestamp, interval '1 day') g(d)
             where extract(dow from g.d)::int not in (select dow from closing_dow where branch = b.code)
               and not exists (select 1 from closed_days c where c.branch = b.code and c.date = g.d::date)) open_days
  ) p
  where p.open_days >= 3 and p.svc / t.actual_target < p.exp - 0.05;

  -- reviews: no reply (Fratelli is closed). 3 stars or fewer is High, a recent 4 or 5 is Low.
  insert into cand
  select 'review:' || r.review_id, 'review', 'reviews', null,
         case when r.branch like 'Al Quoz%' then 'AQ' when r.branch like 'Khalifa%' then 'KCA'
              when r.branch like 'Motor%' then 'MC' when r.branch like 'Saadiyat%' then 'SAA'
              when r.branch like '%Bahrain%' then 'BAH' end,
         r.stars || '-star review waiting for a reply, ' || split_part(r.branch, ',', 1),
         coalesce(nullif(left(r.reviewer, 40), ''), 'A client') || ', '
           || to_char(coalesce(r.review_date, r.created_at::date), 'DD Mon')
           || coalesce(': ' || nullif(left(regexp_replace(r.comment, '\s+', ' ', 'g'), 140), ''), ''),
         '/?view=reviews', case when r.stars <= 3 then 1 else 3 end
  from google_reviews r
  where not coalesce(r.replied, false) and r.branch not ilike '%Fratelli%'
    and ((r.stars <= 3 and coalesce(r.review_date, r.created_at::date) >= today - 60)
      or (r.stars >= 4 and coalesce(r.review_date, r.created_at::date) >= today - 14));

  -- social: Instagram, the brands that have an instagram account in Metricool
  insert into cand
  select 'ig_post:' || b.brand_id, 'ig_post', 'social', null, nullif(b.branch, ''),
         'No Instagram post for ' || (today - lp.d) || ' days, ' || b.label,
         'Last post ' || to_char(lp.d, 'DD Mon') || '.', '/?view=social',
         case when today - lp.d >= 7 then 1 else 2 end
  from metricool_brands b
  cross join lateral (select (max(m.posted_at) at time zone 'Asia/Dubai')::date d from metricool_posts m
                       where m.brand_id = b.brand_id and m.network = 'instagram') lp
  where (b.networks::jsonb) ? 'instagram' and lp.d is not null and today - lp.d >= 3;

  insert into cand
  select 'ig_reach:' || b.brand_id || ':' || wk, 'ig_reach', 'social', null, nullif(b.branch, ''),
         'Instagram reach is down ' || round(100 * (1 - x.r7 / x.base)) || '%, ' || b.label,
         'Last 7 days ' || to_char(round(x.r7), 'FM999,999,999') || ', against a usual week of '
           || to_char(round(x.base), 'FM999,999,999') || ' over the 4 weeks before.',
         '/?view=social', case when x.r7 < 0.65 * x.base then 1 else 2 end
  from metricool_brands b
  cross join lateral (
    select sum(d.value) filter (where d.date > mx.m - 7) r7,
           sum(d.value) filter (where d.date <= mx.m - 7 and d.date > mx.m - 35) / 4 base
    from metricool_daily d
    cross join lateral (select max(date) m from metricool_daily
                         where brand_id = b.brand_id and network = 'instagram' and metric = 'reach') mx
    where d.brand_id = b.brand_id and d.network = 'instagram' and d.metric = 'reach'
  ) x
  where (b.networks::jsonb) ? 'instagram' and x.base > 0 and x.r7 < 0.8 * x.base;

  insert into cand
  select 'ig_followers:' || b.brand_id || ':' || wk, 'ig_followers', 'social', null, nullif(b.branch, ''),
         'Instagram is losing followers, ' || b.label,
         'Down ' || (x.f0 - x.f1)::int || ' in the last 4 weeks (' || to_char(x.f0, 'FM999,999') || ' to '
           || to_char(x.f1, 'FM999,999') || ').',
         '/?view=social', 3
  from metricool_brands b
  cross join lateral (
    select (array_agg(d.value order by d.date))[1] f0, (array_agg(d.value order by d.date desc))[1] f1
    from metricool_daily d
    where d.brand_id = b.brand_id and d.network = 'instagram' and d.metric = 'followers' and d.date >= today - 28
  ) x
  where (b.networks::jsonb) ? 'instagram' and x.f1 < x.f0;

  -- ads: Google Ads
  insert into cand
  select 'ads_stale', 'ads_stale', 'ads', null, null,
         'Google Ads data stops at ' || to_char(m.d, 'DD Mon'),
         'Nothing newer has come in for ' || (today - m.d) || ' days. Campaigns may be paused, or the sync is not reading them.',
         '/?view=googleads', 1
  from (select max(date) d from google_ads_daily) m
  where m.d < today - 2;

  insert into cand
  select 'ads_cpa:' || wk, 'ads_cpa', 'ads', null, null,
         'Google Ads cost per conversion is up ' || round(100 * (w.c7 / w.v7) / (w.c28 / w.v28) - 100) || '%',
         'Last 7 days AED ' || round(w.c7 / w.v7, 1) || ' a conversion, against AED ' || round(w.c28 / w.v28, 1)
           || ' over the 4 weeks before.',
         '/?view=googleads', case when (w.c7 / w.v7) > 1.6 * (w.c28 / w.v28) then 1 else 2 end
  from (select sum(cost) filter (where date > m.d - 7) c7, sum(conversions) filter (where date > m.d - 7) v7,
               sum(cost) filter (where date <= m.d - 7 and date > m.d - 35) c28,
               sum(conversions) filter (where date <= m.d - 7 and date > m.d - 35) v28
          from google_ads_daily, (select max(date) d from google_ads_daily) m) w
  where w.v7 > 0 and w.v28 > 0 and (w.c7 / w.v7) > 1.3 * (w.c28 / w.v28);

  insert into cand
  select 'ads_zero:' || z.campaign_id || ':' || wk, 'ads_zero', 'ads', null, null,
         z.campaign_name || ' spent AED ' || round(z.c) || ' with no conversions',
         'Last 7 days of data, up to ' || to_char(z.mx, 'DD Mon') || '.',
         '/?view=googleads', case when z.c >= 300 then 1 else 2 end
  from (select campaign_id, max(campaign_name) campaign_name, sum(cost) c, sum(conversions) cv, max(date) mx
          from google_ads_daily
         where date > (select max(date) from google_ads_daily) - 7
         group by campaign_id) z
  where z.c >= 100 and z.cv = 0;

  -- seo: this week against last, up to the newest day each source has
  insert into cand
  select 'seo_clicks:' || wk, 'seo_clicks', 'seo', null, null,
         'Search clicks are down ' || round(100 * (1 - g.c7 / g.c14)) || '%',
         'Last 7 days ' || g.c7::int || ' clicks, against ' || g.c14::int || ' the week before (up to ' || to_char(g.mx, 'DD Mon') || ').',
         '/?view=website', case when g.c7 < 0.65 * g.c14 then 1 else 2 end
  from (select sum(clicks) filter (where date > m.d - 7) c7,
               sum(clicks) filter (where date <= m.d - 7 and date > m.d - 14) c14, m.d mx
          from gsc_daily, (select max(date) d from gsc_daily) m group by m.d) g
  where g.c14 >= 50 and g.c7 < 0.8 * g.c14;

  insert into cand
  select 'seo_impr:' || wk, 'seo_impr', 'seo', null, null,
         'Search impressions are down ' || round(100 * (1 - g.i7 / g.i14)) || '%',
         'Last 7 days ' || to_char(g.i7, 'FM999,999') || ', against ' || to_char(g.i14, 'FM999,999') || ' the week before.',
         '/?view=website', case when g.i7 < 0.6 * g.i14 then 1 else 2 end
  from (select sum(impressions) filter (where date > m.d - 7) i7,
               sum(impressions) filter (where date <= m.d - 7 and date > m.d - 14) i14
          from gsc_daily, (select max(date) d from gsc_daily) m) g
  where g.i14 >= 500 and g.i7 < 0.75 * g.i14;

  insert into cand
  select 'seo_sessions:' || wk, 'seo_sessions', 'seo', null, null,
         'Website sessions are down ' || round(100 * (1 - g.s7 / g.s14)) || '%',
         'Last 7 days ' || to_char(g.s7, 'FM999,999') || ', against ' || to_char(g.s14, 'FM999,999') || ' the week before.',
         '/?view=website', case when g.s7 < 0.65 * g.s14 then 1 else 2 end
  from (select sum(sessions) filter (where date > m.d - 7) s7,
               sum(sessions) filter (where date <= m.d - 7 and date > m.d - 14) s14
          from ga4_daily, (select max(date) d from ga4_daily) m) g
  where g.s14 >= 200 and g.s7 < 0.8 * g.s14;

  insert into cand
  select 'seo_position:' || wk, 'seo_position', 'seo', null, null,
         'Average Google position slipped to ' || round(g.p7, 1),
         'Was ' || round(g.p14, 1) || ' the week before. A bigger number is further down the results.',
         '/?view=website', 3
  from (select avg(position) filter (where date > m.d - 7) p7,
               avg(position) filter (where date <= m.d - 7 and date > m.d - 14) p14
          from gsc_daily, (select max(date) d from gsc_daily) m) g
  where g.p7 > g.p14 + 1.0;

  -- lost clients
  insert into cand
  select 'lost_sign:' || b.code || ':' || c.campaign_from, 'lost_sign', 'lost', null, b.code,
         'Lost Clients sheet not signed off, ' || b.name,
         'The review sheet for the ' || to_char(c.campaign_from, 'DD Mon') || ' campaign has no sign-off yet.',
         '/?view=lostlists', case when today - c.campaign_from >= 5 then 1 else 2 end
  from br b cross join (select campaign_from from lost_lists_config limit 1) c
  where c.campaign_from is not null and c.campaign_from <= today
    and not exists (select 1 from lost_review r where r.branch = b.code and r.signed_at >= c.campaign_from);

  insert into cand
  select 'lost_failed:' || coalesce(j.branch, 'ALL') || ':' || wk, 'lost_failed', 'lost', null, j.branch,
         j.n || ' Lost Clients messages failed to send' || coalesce(', ' || public.todo_branch_name(j.branch), ''),
         'In the last 14 days. Open Lost Clients to see why and retry.',
         '/?view=lostlists', 1
  from (select branch, count(*) n from lost_send_jobs
         where status = 'failed' and coalesce(is_test, false) = false and requested_at >= now() - interval '14 days'
         group by branch) j;

  insert into cand
  select 'lastvisit:' || v.b || ':' || wk, 'lastvisit', 'lost', null, v.b,
         v.n || ' high-value clients are 4 to 6 months since their last visit, ' || public.todo_branch_name(v.b),
         'Spent AED 5,000 or more over 4+ visits. The lost list takes them at 183 days, so these can still be won back.',
         '/?view=lostclients', case when v.n >= 150 then 1 else 2 end
  from (select d.last_branch b, count(*) n from client_directory d
         where d.total >= 5000 and d.visits >= 4 and d.last_visit between today - 183 and today - 120
           and d.last_branch in (select code from br)
           and not exists (select 1 from lost_excluded e where e.client_key = d.ckey)
         group by d.last_branch) v;

  -- campaign: the Wellness Voucher deadline, 31 Oct 2026 (CAMPAIGN_TARGET_DATE in the voucher pack)
  insert into cand
  select 'wv_deadline', 'wv_deadline', 'campaign', null, null,
         'Wellness Voucher campaign ends in ' || ('2026-10-31'::date - today) || ' days',
         'Check the units against the 45 target (15 Dip Your Toes, 20 Season of You, 10 All-In VIP) on the performance page.',
         '/?view=wvperf', case when '2026-10-31'::date - today <= 7 then 1 else 2 end
  where '2026-10-31'::date - today between 0 and 14;

  -- supply: from order history only (there is no stock-on-hand table yet)
  insert into cand
  select 'supply_late:' || s.branch || ':' || wk, 'supply_late', 'supply', null, s.branch,
         s.n || case when s.n = 1 then ' order has' else ' orders have' end || ' not arrived after 3 weeks, ' || public.todo_branch_name(s.branch),
         'Oldest: ' || s.top3, '/?view=products', 2
  from (select o.branch, count(*) n,
               (select string_agg(x.product || ' (' || (today - x.order_date) || ' days)', ', ' order by x.order_date)
                  from (select product, order_date from stock_order_lines
                         where branch = o.branch and status = 'not_arrived'
                           and order_date between today - 120 and today - 21
                         order by order_date limit 3) x) top3
          from stock_order_lines o
         where o.status = 'not_arrived' and o.order_date between today - 120 and today - 21
           and o.branch in (select code from br)
         group by o.branch) s;

  create temp table fm (branch text, product text, med numeric, last_o date, s numeric) on commit drop;
  insert into fm
  with o as (select branch, product, order_date, spend from stock_order_lines
              where order_date >= today - 365 and branch in (select code from br) and coalesce("count", 0) > 0),
       d as (select branch, product, order_date,
                    order_date - lag(order_date) over (partition by branch, product order by order_date) gap
               from (select distinct branch, product, order_date from o) x),
       st as (select branch, product, percentile_cont(0.5) within group (order by gap) med, max(order_date) last_o
                from d where gap is not null group by 1, 2 having count(*) >= 3),
       sp as (select branch, product, sum(spend) s from o group by 1, 2)
  select st.branch, st.product, st.med, st.last_o, sp.s
    from st join sp using (branch, product)
   where st.med <= 30 and today - st.last_o > 2 * st.med + 14 and today - st.last_o <= 120;

  insert into cand
  select 'supply_reorder:' || r.branch || ':' || wk, 'supply_reorder', 'supply', null, r.branch,
         r.n || ' fast-moving products are overdue for an order, ' || public.todo_branch_name(r.branch),
         'Biggest spend first: ' || r.top3 || '. From order history, not shelf counts.',
         '/?view=products', case when r.n >= 5 then 2 else 3 end
  from (select f.branch, count(*) n,
               (select string_agg(y.product || ' (usually every ' || round(y.med) || ' days, last ' || (today - y.last_o) || ' days ago)', '; ' order by y.s desc nulls last)
                  from (select f2.product, f2.med, f2.last_o, f2.s from fm f2 where f2.branch = f.branch
                         order by f2.s desc nulls last limit 3) y) top3
          from fm f group by f.branch) r;

  -- suggestions: Team Home suggestions still marked new
  insert into cand
  select 'suggest:' || coalesce(s.region, 'UAE'), 'suggest', 'suggestions', null, s.region,
         s.n || case when s.n = 1 then ' suggestion is' else ' suggestions are' end || ' waiting to be read'
           || coalesce(' (' || public.todo_branch_name(s.region) || ')', ''),
         'Oldest came in ' || to_char(s.oldest at time zone 'Asia/Dubai', 'DD Mon') || '. Topics: ' || s.topics || '.',
         '/hub/suggestions',
         case when today - (s.oldest at time zone 'Asia/Dubai')::date >= 7 then 1
              when today - (s.oldest at time zone 'Asia/Dubai')::date >= 3 then 2 else 3 end
  from (select region, count(*) n, min(created_at) oldest, string_agg(distinct topic, ', ') topics
          from kb_suggestions where status = 'new' group by region) s;

  perform public.todo_apply(array['ledger', 'sync', 'pace', 'review', 'ig_post', 'ig_reach', 'ig_followers',
    'ads_stale', 'ads_cpa', 'ads_zero', 'seo_clicks', 'seo_impr', 'seo_sessions', 'seo_position',
    'lost_sign', 'lost_failed', 'lastvisit', 'wv_deadline', 'supply_late', 'supply_reorder', 'suggest']);

  insert into sync_health (name, last_run_at, last_ok_at, last_error)
  values ('todo-refresh', now(), now(), null)
  on conflict (name) do update set last_run_at = now(), last_ok_at = now(), last_error = null;

  select count(*) into n from todo_items where status = 'open';
  return n;
end $$;
revoke all on function public.todo_refresh() from public, anon, authenticated;

-- The daily run: staff stats, one item per KPI per branch.
create or replace function public.todo_refresh_staff() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  today date := (now() at time zone 'Asia/Dubai')::date;
  wk text := to_char((now() at time zone 'Asia/Dubai')::date, 'IYYY-"W"IW');
  n integer;
begin
  perform set_config('statement_timeout', '170s', true);
  create temp table cand (key text primary key, rule text, category text, sub text, branch text, title text,
                          detail text, link text, severity smallint) on commit drop;
  create temp table kv (who text, branch text, level text, kpi text, val numeric, minimum numeric, target numeric) on commit drop;

  insert into kv
  select s.display_name, s.branch, s.level::text, k.kpi, k.val, bm.minimum, bm.target
  from perf_staff s
  cross join lateral (select perf_core(s, today - 28, today - 1) c, perf_clients(s, today - 28, today - 1) pc) x
  cross join lateral (values
    ('rebooking_pct',   (x.c->>'rebooking_pct')::numeric),
    ('request_pct',     (x.c->>'request_pct')::numeric),
    ('avg_bill',        (x.c->>'avg_bill')::numeric),
    ('column_fill_pct', (x.c->>'column_fill_pct')::numeric),
    ('retail_pct',      (x.c->>'retail_pct')::numeric),
    ('treatments_pct',  (x.c->>'treatments_pct')::numeric),
    ('colour_pct',      (x.c->>'colour_pct')::numeric),
    ('conversion_pct',  case when (x.pc->>'conversion_n')::int >= 5 then (x.pc->>'conversion_pct')::numeric end),
    ('retention_pct',   case when (x.pc->>'retention_n')::int >= 10 then (x.pc->>'retention_pct')::numeric end)
  ) k(kpi, val)
  join perf_benchmarks bm on bm.kpi = k.kpi and bm.level::text = s.level::text
  where s.active and s.branch in ('SAA', 'KCA', 'MC', 'AQ') and (x.c->>'clients')::numeric >= 20 and k.val is not null;

  insert into cand
  select 'kpi:' || g.branch || ':' || g.kpi || ':' || wk, 'kpi', 'staff', public.todo_kpi_label(g.kpi), g.branch,
         public.todo_kpi_label(g.kpi) || ': ' || g.n_under || ' of ' || g.n_all || ' stylists under the minimum, ' || public.todo_branch_name(g.branch),
         'Last 28 days. Furthest under: ' || (
           select string_agg(w.who || ' ' || public.todo_kpi_fmt(g.kpi, w.val) || ' (min ' || public.todo_kpi_fmt(g.kpi, w.minimum) || ')', ', ' order by w.ratio)
             from (select who, val, minimum, val / nullif(minimum, 0) ratio from kv
                    where branch = g.branch and kpi = g.kpi and val < minimum
                    order by val / nullif(minimum, 0) limit 3) w),
         '/?view=stafflevels',
         case when g.n_under >= 3 and g.n_under::numeric / g.n_all >= 0.6 then 1
              when g.n_under >= 2 or g.n_under::numeric / g.n_all >= 0.3 then 2 else 3 end
  from (select branch, kpi, count(*) n_all, count(*) filter (where val < minimum) n_under,
               min(val / nullif(minimum, 0)) filter (where val < minimum) worst
          from kv group by branch, kpi) g
  where g.n_under > 0;

  perform public.todo_apply(array['kpi']);

  insert into sync_health (name, last_run_at, last_ok_at, last_error)
  values ('todo-refresh-staff', now(), now(), null)
  on conflict (name) do update set last_run_at = now(), last_ok_at = now(), last_error = null;

  select count(*) into n from todo_items where status = 'open' and rule = 'kpi';
  return n;
end $$;
revoke all on function public.todo_refresh_staff() from public, anon, authenticated;

select cron.schedule('todo-refresh-staff-daily', '30 18 * * *', $$ select public.todo_refresh_staff(); $$);
