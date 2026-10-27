-- Kate, 27 Oct 2026: the rest of the client-count rules (door_clients_payment_entry.sql, last_visit_count_rules.sql).
--
--   * door_clients and door_clients_daily carry a 60 second setting, but a function setting does NOT lengthen the
--     8 second limit the browser role runs under (tested: a 5 second session limit still cancels the All time
--     call). All time takes about 20 seconds, so the Pulse, Branch Performance and Comparison got a 500 on it
--     (it did before 27 Oct too) and fell back to the handled count. The fix is in dashboard.js: door_clients is
--     asked for one calendar year at a time and the years are added up (a client-day never crosses a year).
--   * org_pulse_extra (Performance, visits per staff): a visit is a client handled by that staff member on a day,
--     on a sale with an entry in Payment Type, not a deposit, balance payment or voucher sale, not a Staff-named
--     client and not a Walk-in. A client who saw two staff counts once for each of them (handled per staff).
--   * lost_client_detail, lost_clients_detail_bulk, lost_clients_visits_bulk (the single-client panel, the first
--     visit and the recent visits on the list): visits, first and last visit use the same visit rule as the list.
--   * lost_consults: a later line only "blocks" a consultation follow-up when it is a paid, non-BUSINESS TRS visit
--     line, and Staff-named clients are left out.
--   * lost_lists_refresh (the Lost Client Blasts list builder): lines for the list are visit lines only. This file
--     only replaces the definition. It does NOT run it, so lost_lists_base and the live campaign are untouched
--     until someone presses Refresh or the nightly job runs.
--
-- Run this file as it is; it replaces the live definitions.

-- ── Clients through the door: longer limit ──────────────────────────────────
create or replace function public.door_clients(p_from date, p_to date)
returns table (branch text, clients bigint, days bigint)
language sql stable security invoker
set search_path = public
set statement_timeout = '60s'
as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  ), ln as (
    select l.branch, l.date, lower(trim(l.client_name)) as cn,
           (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
  ), cd as (
    select branch, date, cn, bool_or(is_real and sale_paid) as counts
    from ln group by branch, date, cn
  )
  select cd.branch,
         count(*) filter (where cd.counts) as clients,
         count(distinct cd.date) as days
  from cd
  group by cd.branch
$$;
grant execute on function public.door_clients(date, date) to authenticated, anon;

create or replace function public.door_clients_daily(p_from date, p_to date)
returns table (branch text, date date, clients bigint)
language sql stable security invoker
set search_path = public
set statement_timeout = '60s'
as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_to) d
  ), ln as (
    select l.branch, l.date, lower(trim(l.client_name)) as cn,
           (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
  ), cd as (
    select branch, date, cn, bool_or(is_real and sale_paid) as counts
    from ln group by branch, date, cn
  )
  select cd.branch, cd.date, count(*) filter (where cd.counts) as clients
  from cd
  group by cd.branch, cd.date
$$;
grant execute on function public.door_clients_daily(date, date) to authenticated, anon;

-- ── Performance: visits per staff ───────────────────────────────────────────
create or replace function public.org_pulse_extra(p_admin uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
declare d90 date := least(p_to, current_date) - 89;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;
  return (
    with st as (select * from perf_staff where active),
    ps as materialized (
      select distinct branch, date, sale_id from sales_transaction_lines
      where date between p_from and p_to and nullif(trim(payment_raw), '') is not null
    ),
    visits as (
      select s.id, count(*) v, count(*) filter (where is_col) c
      from st s
      join lateral (
        select x.client_name, x.date, bool_or(perf_is_colour(x.item)) is_col
        from sales_transaction_lines x
        join ps on ps.branch = x.branch and ps.date = x.date and ps.sale_id = x.sale_id
        where x.employee_name = s.phorest_name and x.date between p_from and p_to
          and x.client_name is not null and x.client_name <> ''
          and x.client_name !~* '\mstaff\M' and x.client_name !~* '^\s*walk[\s-]*in\M'
          and public.stl_item_kind(x.item) not in ('non_sale', 'voucher')
        group by x.client_name, x.date
      ) x on true
      group by s.id
    ),
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
    wd as (
      select s.id, count(*) n
      from st s
      join lateral (
        select date from branch_staff_daily
        where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept
          and date between p_from and p_to and coalesce(total, 0) > 0
        union
        select date from phorest_staff_daily
        where employee_name = s.phorest_name and not is_total
          and date between p_from and p_to and coalesce(visits, 0) > 0
      ) w on true
      where s.ig_handles is not null and w.date in (
        select (t.posted_at at time zone 'Asia/Dubai')::date from ig_tagged_posts t where lower(t.username) = any(s.ig_handles)
        union select (c.posted_at at time zone 'Asia/Dubai')::date from ig_collab_posts c where lower(c.username) = any(s.ig_handles)
        union select (m.mentioned_at at time zone 'Asia/Dubai')::date from ig_story_mentions m where lower(m.username) = any(s.ig_handles))
      group by s.id
    ),
    rv as (
      select case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                  when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end b,
             count(*) filter (where g.review_date between p_from and p_to) n_window,
             count(*) filter (where g.review_date between d90 and least(p_to, current_date)) n90,
             coalesce(sum(g.stars) filter (where g.review_date between d90 and least(p_to, current_date)), 0) stars90
      from google_reviews g
      where g.review_date between least(p_from, d90) and p_to
      group by 1
    )
    select jsonb_build_object(
      'staff', (select coalesce(jsonb_agg(jsonb_build_object(
          'branch', s.branch, 'dept', s.dept,
          'conv_n', coalesce(c.conv_n, 0), 'conv_back', coalesce(c.conv_back, 0),
          'ret_n', coalesce(c.ret_n, 0), 'ret_back', coalesce(c.ret_back, 0),
          'visits', coalesce(v.v, 0), 'colour', coalesce(v.c, 0),
          'social_feed', coalesce(p.n, 0), 'social_workdays', coalesce(w.n, 0))), '[]'::jsonb)
        from st s left join perf_client_cache c on c.staff_id = s.id left join visits v on v.id = s.id
                  left join posts p on p.id = s.id left join wd w on w.id = s.id),
      'reviews', (select coalesce(jsonb_agg(jsonb_build_object('branch', b, 'n_window', n_window, 'n90', n90, 'stars90', stars90)), '[]'::jsonb) from rv where b is not null),
      'cache_asof', (select max(asof) from perf_client_cache)
    )
  );
end $function$;

-- ── Client's Last Visit: the single-client panel and the bulk fills ─────────
create or replace function public.lost_client_detail(p_branch text, p_client text, p_since date DEFAULT '2025-01-01'::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
declare out jsonb; k text := public.stl_client_key(p_client); names text[] := public.stl_names_for_key(public.stl_client_key(p_client)) || public.stl_names_for_key(public.stl_client_key(p_client) || ' ' || public.stl_client_key(p_client));
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with l as (
    select s.date, s.branch, s.item, s.net, s.employee_name, public.stl_item_kind(s.item) kind,
           trim(regexp_replace(lower(coalesce(s.item, '')), '[^a-z0-9]+', ' ', 'g')) as ikey,
           (coalesce(s.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit_line
    from sales_transaction_lines s
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA','KCA','MC','AQ')))
      and s.date >= p_since
      and s.client_name = any(names)
      and s.client_name !~* '\mstaff\M'
  ), svc as (
    select (array_agg(item order by date desc))[1] as item,
           count(distinct date)::int visits, max(date) last_date, round(sum(coalesce(net,0)))::int spend,
           (array_agg(employee_name order by date desc) filter (where coalesce(employee_name,'') <> '' and employee_name !~* '^\s*business\M'))[1] last_by
    from l where kind = 'service' group by ikey
  ), prod as (
    select item, count(*)::int times, round(sum(coalesce(net,0)))::int spend
    from l where kind = 'product' group by item
  ), st as (
    select employee_name, count(distinct date)::int visits
    from l where coalesce(employee_name,'') <> '' and employee_name !~* '^\s*business\M' group by employee_name
  ), vd as (
    select date,
           (select string_agg(distinct x.branch, ', ') from l x where x.date = l.date) as at,
           (select jsonb_agg(e order by e) from (select distinct x.employee_name e from l x
              where x.date = l.date and coalesce(x.employee_name,'') <> '' and x.employee_name !~* '^\s*business\M') q) as by_who,
           (select jsonb_agg(i order by i) from (select distinct x.item i from l x
              where x.date = l.date and x.kind = 'service') q) as services,
           count(*) filter (where kind = 'product')::int as products,
           round(sum(coalesce(net,0)))::int as total
    from l where kind not in ('non_sale', 'voucher') group by date having bool_or(visit_line)
  ), mo as (
    select to_char(date, 'YYYY-MM') as m, round(sum(coalesce(net,0)))::int as spend
    from l where kind not in ('non_sale', 'voucher') group by 1
  ), br as (
    select x.branch, count(distinct x.date)::int as visits
    from (
      select s.branch, s.date, s.item, s.employee_name,
             bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id) as paid
      from sales_transaction_lines s
      where s.branch in ('SAA','KCA','MC','AQ') and s.date >= p_since
        and s.client_name = any(names) and s.client_name !~* '\mstaff\M'
    ) x
    where x.paid and coalesce(x.employee_name, '') !~* '^\s*business\M'
      and public.stl_item_kind(x.item) not in ('non_sale', 'voucher')
    group by x.branch
  )
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(to_jsonb(svc) order by visits desc, spend desc) from svc), '[]'),
    'products', coalesce((select jsonb_agg(to_jsonb(prod) order by spend desc) from (select * from prod order by spend desc limit 6) prod), '[]'),
    'stylists', coalesce((select jsonb_agg(to_jsonb(st) order by visits desc) from st), '[]'),
    'visits',   coalesce((select jsonb_agg(to_jsonb(vd) order by date desc) from vd), '[]'),
    'months',   coalesce((select jsonb_agg(to_jsonb(mo) order by m) from mo), '[]'),
    'branches', coalesce((select jsonb_agg(to_jsonb(br) order by visits desc) from br), '[]'),
    'first_visit', (select min(date) from l where kind not in ('non_sale', 'voucher') and visit_line),
    'last_visit',  (select max(date) from l where kind not in ('non_sale', 'voucher') and visit_line)
  ) into out;
  return out;
end;
$function$;

create or replace function public.lost_clients_detail_bulk(p_branch text, p_clients text[], p_since date DEFAULT '2025-01-01'::date)
 RETURNS TABLE(client_name text, first_visit date, services text, products text, retail_spend integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  return query
  with want as (
    select distinct on (public.stl_client_key(c)) c as name, public.stl_client_key(c) k
    from unnest(p_clients) c
  ), l as (
    select w.name, s.date, s.item, s.net, public.stl_item_kind(s.item) kind,
           (coalesce(s.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit_line
    from sales_transaction_lines s
    join want w on public.stl_client_key(s.client_name) in (w.k, w.k || ' ' || w.k)
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= p_since
      and s.client_name !~* '\mstaff\M'
  ), svc as (
    select name, item, count(distinct date) v,
           row_number() over (partition by name order by count(distinct date) desc, sum(coalesce(net,0)) desc) rn
    from l where kind = 'service' group by name, item
  ), prod as (
    select name, item, count(*) t, sum(coalesce(net,0)) sp,
           row_number() over (partition by name order by sum(coalesce(net,0)) desc) rn
    from l where kind = 'product' group by name, item
  )
  select w.name,
         (select min(l.date) from l where l.name = w.name and l.kind not in ('non_sale', 'voucher') and l.visit_line),
         (select string_agg(svc.item || ' x' || svc.v, '; ' order by svc.rn) from svc where svc.name = w.name and svc.rn <= 8),
         (select string_agg(prod.item || ' x' || prod.t, '; ' order by prod.rn) from prod where prod.name = w.name and prod.rn <= 6),
         (select round(sum(coalesce(l.net,0)))::int from l where l.name = w.name and l.kind = 'product')
  from want w;
end;
$function$;

create or replace function public.lost_clients_visits_bulk(p_clients text[], p_n integer DEFAULT 10)
 RETURNS TABLE(client_name text, visits integer, recent text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  return query
  with want as (
    select distinct on (public.stl_client_key(c)) c as name, public.stl_client_key(c) k
    from unnest(p_clients) c
  ), l as (
    select w.name, s.date, s.branch, s.item, s.net, s.employee_name, public.stl_item_kind(s.item) kind,
           (coalesce(s.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as visit_line
    from sales_transaction_lines s
    join want w on public.stl_client_key(s.client_name) in (w.k, w.k || ' ' || w.k)
    where s.branch in ('SAA', 'KCA', 'MC', 'AQ') and s.date >= date '2025-01-01'
      and s.client_name !~* '\mstaff\M'
  ), vd as (
    select l.name, l.date, string_agg(distinct l.branch, '/') as br,
           string_agg(distinct l.item, ' + ') filter (where l.kind = 'service') as svc,
           string_agg(distinct l.employee_name, ', ') filter (where coalesce(l.employee_name, '') <> '' and l.employee_name !~* '^\s*business\M') as who,
           round(sum(coalesce(l.net, 0)))::int as total
    from l where l.kind not in ('non_sale', 'voucher') group by l.name, l.date having bool_or(l.visit_line)
  ), rk as (
    select vd.*, row_number() over (partition by vd.name order by vd.date desc) as rn from vd
  )
  select w.name,
         (select count(*)::int from vd where vd.name = w.name),
         (select string_agg(to_char(r.date, 'DD Mon YYYY') || ', ' || r.br || ', ' || coalesce(r.svc, 'products only') || ', AED ' || r.total || coalesce(', ' || r.who, ''),
                            ' | ' order by r.date desc)
          from rk r where r.name = w.name and r.rn <= p_n)
  from want w;
end $function$;

create or replace function public.lost_consults()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
declare lvl int; cd int; out jsonb;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 2 then raise exception 'Lost Clients is for Level 2 and above'; end if;
  select consult_days into cd from lost_lists_config where id = 1;
  with c0 as (
    select s.client_name, s.branch, s.date, s.item, s.employee_name
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= current_date - cd and s.date < current_date
      and s.item ilike '%consult%' and nullif(btrim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
      and s.client_name !~* '\mstaff\M'
  ), last_c as (
    select distinct on (client_name) client_name, branch, date as consult_on, item, employee_name
    from c0 order by client_name, date desc
  ), after as (
    select l.client_name, l.date, l.item, public.stl_item_kind(l.item) as kind,
           (coalesce(l.employee_name, '') !~* '^\s*business\M'
            and bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id)) as visit_line
    from sales_transaction_lines l
    where l.date >= current_date - cd and l.client_name in (select client_name from last_c)
  ), blocked as (
    select distinct a.client_name
    from after a join last_c lc on lc.client_name = a.client_name
    where a.kind not in ('non_sale', 'voucher') and a.visit_line
      and ((a.date > lc.consult_on) or (a.date = lc.consult_on and a.item not ilike '%consult%'))
  ), k as (
    select lc.*, public.stl_key_fold(regexp_replace(btrim(lc.client_name), '\s+', ' ', 'g')) as ck
    from last_c lc where lc.client_name not in (select client_name from blocked)
  ), bk as (
    select distinct public.stl_key_fold(b.client_key) as k from client_bookings b where b.date >= current_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', k.ck, 'client_name', k.client_name, 'branch', k.branch,
      'area', case when k.branch in ('MC','AQ') then 'Dubai' else 'Abu Dhabi' end,
      'consult_on', k.consult_on, 'days_since', (current_date - k.consult_on), 'item', k.item, 'by', k.employee_name,
      'mobile', case when lvl >= 3 then (select c2.mobile from client_contacts c2 where public.stl_key_fold(c2.client_key) = k.ck order by c2.updated_at desc limit 1) end,
      'contacted_on', ct.contacted_on, 'contacted_by', ct.contacted_by
    ) order by k.consult_on desc, k.client_name), '[]'::jsonb) into out
  from k left join lost_consult_contacted ct on ct.client_key = k.ck
  where not exists (select 1 from bk where bk.k = k.ck);
  return out;
end $function$;

-- ── Lost Client Blasts: the list builder (definition only, not run here) ────
create or replace function public.lost_lists_refresh()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
declare cfg lost_lists_config; n int;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if auth.uid() is not null and coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 4 then
    raise exception 'Level 4 and above';
  end if;
  select * into cfg from lost_lists_config where id = 1;
  if cfg.finished_at is not null then return 0; end if;   -- campaign finished (lost_campaign_finish): the lists stay as they are
  create temp table _items on commit drop as
    select distinct coalesce(s.item, '') as item from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= cfg.since;
  create temp table _ic on commit drop as
    select i.item, public.stl_item_kind(i.item) as kind, x.category, x.family
    from _items i left join lateral (select category, family from public.item_classes(array[i.item]) limit 1) x on true;
  create temp table _lines on commit drop as
    select public.stl_key_fold(z.client_name) as k, z.client_name, z.branch, z.date, z.employee_name,
           c.kind, c.category, c.family
    from (
      select s.client_name, s.branch, s.date, s.employee_name, s.item,
             bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id) as paid
      from sales_transaction_lines s
      where s.branch in ('SAA','KCA','MC','AQ') and s.date >= cfg.since
        and nullif(trim(s.client_name), '') is not null and s.client_name !~* '^\s*walk[\s-]*in\M'
        and s.client_name !~* '\mstaff\M'
    ) z join _ic c on c.item = coalesce(z.item, '')
    where c.kind not in ('non_sale', 'voucher')
      and z.paid and coalesce(z.employee_name, '') !~* '^\s*business\M';
  create temp table _team on commit drop as
    select k, employee_name, count(*) as n, max(date) as last, row_number() over (partition by k order by count(*) desc, max(date) desc) as rn
    from _lines where coalesce(employee_name, '') <> '' and employee_name !~* '^\s*business\M' group by k, employee_name;
  create index on _team (k);
  create temp table _ph on commit drop as
    select public.stl_key_fold(c.client_key) as k, btrim(x) as phone
    from client_contacts c, unnest(string_to_array(c.mobile, ' / ')) x
    where coalesce(c.mobile, '') <> '' and btrim(x) ~ '^\+\d{9,15}$';
  create index on _ph (k);
  delete from lost_lists_base;
  insert into lost_lists_base (client_key, client_name, area, last_branch, last_visit, visits, last_keratin, last_colour, last_toner,
                               last_other, last_service_any, cats, stylist, also_saw, phones)
  select l.k, (array_agg(l.client_name order by length(l.client_name), l.client_name))[1],
         case when (array_agg(l.branch order by l.date desc))[1] in ('MC','AQ') then 'Dubai' else 'Abu Dhabi' end,
         (array_agg(l.branch order by l.date desc))[1], max(l.date), count(distinct l.date)::int,
         max(l.date) filter (where l.category = 'KERATIN'),
         max(l.date) filter (where l.category in ('BALAYAGE','BLEACHING','COLOURING','HIGHLIGHTS') and l.date between cfg.window_from and cfg.window_to),
         max(l.date) filter (where l.category = 'TONING' and l.date between cfg.window_from and cfg.window_to),
         max(l.date) filter (where l.kind = 'service' and l.family not in ('retail','skip','colour') and l.category <> 'SKIP'
                             and l.date between cfg.window_from and cfg.window_to),
         max(l.date) filter (where l.kind = 'service' and l.family not in ('retail','skip') and l.category <> 'SKIP'),
         string_agg(distinct l.category, ', ') filter (where l.kind = 'service' and l.family not in ('retail','skip')
                             and l.date between cfg.window_from and cfg.window_to),
         (select t.employee_name from _team t where t.k = l.k and t.rn = 1),
         (select string_agg(t.employee_name, ', ' order by t.rn) from _team t where t.k = l.k and t.rn between 2 and 5),
         (select string_agg(distinct p.phone, ' / ') from _ph p where p.k = l.k)
  from _lines l group by l.k
  having max(l.date) < current_date - cfg.lost_days or max(l.date) filter (where l.category = 'KERATIN') >= cfg.window_from;
  get diagnostics n = row_count;
  return n;
end $function$;
