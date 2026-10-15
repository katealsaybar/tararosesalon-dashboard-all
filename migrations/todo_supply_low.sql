-- Kate, 15 Oct 2026: Product supply now reads real shelf counts (stock_levels, see create_stock_levels.sql)
-- instead of guessing from order history. Replaces the supply block of todo_refresh() from
-- todo_categories.sql; everything else in the function is unchanged.
--   supply_low     NEW. Products that are out or under 7 days of cover, counting what is on order, one item
--                  per branch per ISO week, top 3 by spend. High when 5+ are out or 15+ flagged, Mid when any is out or 4+ flagged.
--   supply_stale   NEW (category data, Level 5). A branch whose newest Stock List snapshot is over 3 days
--                  old; supply_low ignores older counts rather than flag from stale numbers.
--   supply_late    Kept (orders not arrived after 3 weeks).
--   supply_reorder RETIRED. "Fast movers overdue for an order" was a guess from order dates alone; it stays
--                  in the todo_apply list below only so any open item of that rule closes on the next run.

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

  -- supply_late: orders still not arrived after 3 weeks (order history)
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

  -- supply_low: real shelf counts. stock_levels is the Stock List's In stock per product (daily snapshot,
  -- /daily-reports Step 6). A product is flagged when it is a real mover (arrived on 3+ orders in the last
  -- 180 days, the latest within 90 days) and, counting what is already on order, is out or has under 7 days
  -- of cover at its usual rate (units arrived over 180 days / 180). Usage is the order history because the
  -- salon uses professional stock without selling it. Phorest's own Min is not used: on most colour lines
  -- it sits above the normal post-delivery level, so it would flag half the shelf. One item per branch per
  -- ISO week, top 3 by spend. Orders are matched to the list by name + type, then by the 12-digit barcode stem.
  create temp table sup (branch text, product text, in_stock numeric, incoming numeric, cover numeric,
                         spend numeric, is_out boolean, per_week numeric) on commit drop;
  insert into sup
  with ol as (select branch, barcode, type, lower(regexp_replace(product, '\s+', ' ', 'g')) nm, "count" units,
                     order_no, status, arrived_date, spend
                from stock_order_lines
               where branch in (select code from br)
                 and ((status = 'arrived' and arrived_date >= today - 180)
                   or (status = 'not_arrived' and order_date >= today - 60))),
       agg as (select branch, barcode, nm, type,
                      coalesce(sum(units) filter (where status = 'arrived'), 0) units,
                      count(distinct order_no) filter (where status = 'arrived') norders,
                      max(arrived_date) last_arr,
                      coalesce(sum(spend) filter (where status = 'arrived'), 0) spend,
                      coalesce(sum(units) filter (where status = 'not_arrived'), 0) incoming
                 from ol group by 1, 2, 3, 4),
       ub as (select branch, barcode, sum(units) units, sum(norders) norders, max(last_arr) last_arr, sum(spend) spend,
                     sum(incoming) incoming from agg where barcode is not null group by 1, 2),
       un as (select branch, nm, type, sum(units) units, sum(norders) norders, max(last_arr) last_arr, sum(spend) spend,
                     sum(incoming) incoming from agg group by 1, 2, 3),
       sl as (select s.*, lower(regexp_replace(s.product, '\s+', ' ', 'g')) nm from stock_levels s
               where s.branch in (select code from br) and s.as_of >= today - 3
                 and s.as_of = (select max(x.as_of) from stock_levels x where x.branch = s.branch)),
       j as (select sl.branch, sl.product, sl.in_stock,
                    coalesce(un.units, ub.units) units, coalesce(un.norders, ub.norders) norders,
                    coalesce(un.last_arr, ub.last_arr) last_arr, coalesce(un.spend, ub.spend) spend,
                    greatest(coalesce(un.incoming, ub.incoming, 0), coalesce(sl.on_order, 0)) incoming
               from sl left join un on un.branch = sl.branch and un.nm = sl.nm and un.type = sl.type
                       left join ub on ub.branch = sl.branch and sl.barcode is not null
                                   and ub.barcode = left(sl.barcode, 12))
  select branch, product, in_stock, incoming, (in_stock + incoming) / (units / 180), spend, in_stock + incoming <= 0,
         7 * units / 180
    from j
   where norders >= 3 and units > 0 and last_arr >= today - 90
     and (in_stock + incoming <= 0 or (in_stock + incoming) / (units / 180) <= 7);

  insert into cand
  select 'supply_low:' || r.branch || ':' || wk, 'supply_low', 'supply', null, r.branch,
         r.n || case when r.n = 1 then ' product is' else ' products are' end || ' out or under a week of cover, '
           || public.todo_branch_name(r.branch),
         'Biggest spend first: ' || r.top3 || '. Shelf counts from the ' || to_char(r.as_of, 'DD Mon') || ' Stock List.',
         '/?view=products', case when r.n_out >= 5 or r.n >= 15 then 1 when r.n_out >= 1 or r.n >= 4 then 2 else 3 end
  from (select s.branch, count(*) n, count(*) filter (where s.is_out) n_out,
               (select max(x.as_of) from stock_levels x where x.branch = s.branch) as_of,
               (select string_agg(y.product || ' (' || case when y.is_out then 'none left'
                         else round(y.in_stock) || ' left' end || ', about ' || round(y.per_week, 1) || ' a week)', '; ' order by y.spend desc nulls last)
                  from (select s2.product, s2.in_stock, s2.per_week, s2.is_out, s2.spend from sup s2
                         where s2.branch = s.branch order by s2.spend desc nulls last limit 3) y) top3
          from sup s group by s.branch) r;

  -- data: the Stock List snapshot stopped arriving (supply_low only trusts counts under 3 days old)
  insert into cand
  select 'supply_stale:' || b.code || ':' || wk, 'supply_stale', 'data', null, b.code,
         'Stock counts are ' || coalesce((today - m.d)::text || ' days old', 'missing') || ', ' || b.name,
         'Product supply flags are paused for this branch. Run /daily-reports Step 6 (the Stock Lists).',
         null, 2
  from br b
  left join lateral (select max(as_of) d from stock_levels x where x.branch = b.code) m on true
  where m.d is null or m.d < today - 3;

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
    'lost_sign', 'lost_failed', 'lastvisit', 'wv_deadline', 'supply_late', 'supply_reorder', 'supply_low',
    'supply_stale', 'suggest']);

  insert into sync_health (name, last_run_at, last_ok_at, last_error)
  values ('todo-refresh', now(), now(), null)
  on conflict (name) do update set last_run_at = now(), last_ok_at = now(), last_error = null;

  select count(*) into n from todo_items where status = 'open';
  return n;
end $$;
revoke all on function public.todo_refresh() from public, anon, authenticated;
