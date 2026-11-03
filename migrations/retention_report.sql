-- Retention page (Kate, 3 Nov 2026): clients who came in during the Period, and how many came back in the 2 months after.
-- Same client rules as clients through the door (door_clients) and handled per staff (drill_staff_clients), kept by client id (ckey):
-- one client once a day, a paid sale, real services or retail, the day's spend above AED 0; no walk-ins, no staff bookings
-- (client name carries Staff), no BUSINESS TRS lines. Counted per branch: a client who moves salon is not back at the first one.
-- New = her first counted visit anywhere (door_first_visits) falls in the Period; known = she had one before it.
--
-- v3, 3 Nov 2026 (Kate: "make sure this matches any dashboard that also computes retention"). The stylist Retention % on Staff Dashboards, Stylist's
-- Benchmarks, the 1-to-1s, the to-do list and the Pulse all come from perf_clients (perf_client_cache). Its retention is now computed from the SAME day
-- tables as this page (retention_staff_days + door_first_visits, by client id), so the two cannot drift:
--   REGULARS (the KPI cohort): clients with a visit to that stylist in the 180 to 90 days before the data ends, on a day that was not their first ever,
--   and how many of them came back to the SAME stylist in the last 90 days.
--   p_kpi on retention_report / drill_retention_clients asks the page for exactly that window (asof = the latest sales line); rn / rsame / rany on each stylist
--   row are the regulars, and rsame / rn is the KPI. With a Period of your own they are the regulars of that Period.
--   perf_clients' old definition is kept in _defs_backup_3nov (owner only) to roll back.
-- Day tables (matviews, owner only, refreshed hourly at :27 and :28 like door_first_visits): retention_days (branch, date, client id) and
-- retention_staff_days (branch, date, staff, client id): counted client-days since 1 Aug 2021, the four open UAE branches.
-- Internal helpers (no grants): retention_base, retention_staff_base. Callable: retention_report, drill_retention_clients (Level 3 and up).

create materialized view if not exists public.retention_days as
with k as materialized (
  select ik, public.stl_item_kind(ik) as kind from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date >= date '2021-08-01') d
), ln as (
  select l.branch, l.date, l.ckey as cn, l.client_name, l.net,
         (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
         bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
  from sales_transaction_lines l
  join k on k.ik = coalesce(l.item, '')
  where l.date >= date '2021-08-01'
    and l.branch in ('AQ', 'KCA', 'MC', 'SAA')
    and coalesce(trim(l.client_name), '') <> ''
    and l.client_name !~* '^\s*walk[\s-]*in\M'
    and l.client_name !~* '\mstaff\M'
)
select branch, date, cn, min(client_name) as client
from ln group by branch, date, cn
having bool_or(is_real and sale_paid) and coalesce(sum(net) filter (where is_real), 0) > 0;

create materialized view if not exists public.retention_staff_days as
with k as materialized (
  select ik, public.stl_item_kind(ik) as kind from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date >= date '2021-08-01') d
), ln as (
  select l.branch, l.date, trim(l.employee_name) as emp, l.ckey as cn, l.net,
         (k.kind not in ('non_sale', 'voucher')) as is_real,
         (bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) and l.day_spend_ok) as sale_paid
  from sales_transaction_lines l
  join k on k.ik = coalesce(l.item, '')
  where l.date >= date '2021-08-01'
    and l.branch in ('AQ', 'KCA', 'MC', 'SAA')
    and coalesce(trim(l.client_name), '') <> ''
    and l.client_name !~* '^\s*walk[\s-]*in\M'
    and l.client_name !~* '\mstaff\M'
    and coalesce(l.employee_name, '') !~* '^\s*business\M'
    and coalesce(trim(l.employee_name), '') <> ''
)
select branch, date, emp, cn from ln group by branch, date, emp, cn
having bool_or(is_real and sale_paid) and coalesce(sum(net) filter (where is_real), 0) > 0;

create unique index if not exists retention_days_u on public.retention_days (branch, date, cn);
create index if not exists retention_days_date on public.retention_days (date);
create unique index if not exists retention_staff_days_u on public.retention_staff_days (branch, date, emp, cn);
create index if not exists retention_staff_days_date on public.retention_staff_days (date);
revoke all on public.retention_days, public.retention_staff_days from public, anon, authenticated;
select cron.schedule('retention-days-hourly', '27 * * * *', 'refresh materialized view concurrently public.retention_days');
select cron.schedule('retention-staff-days-hourly', '28 * * * *', 'refresh materialized view concurrently public.retention_staff_days');

drop function if exists public.retention_report(date, date, text, int);
drop function if exists public.drill_retention_clients(date, date, text, text, text, text, text, boolean, int, int, boolean);

create or replace function public.retention_base(p_from date, p_to date, p_ret_to date, p_branches text[])
returns table(branch text, ck text, client text, v_in int, last_in date, first_ever date, v_back int, first_back date, v_known int)
language sql stable security definer set search_path to 'public' as $$
  with cf as (
    select d.branch, d.date, d.cn, d.client, f.first_date
    from retention_days d left join door_first_visits f on f.cn = d.cn
    where d.date between p_from and p_ret_to and d.branch = any(p_branches)
  ), agg as (
    select branch, cn, min(client) as client,
           (count(*) filter (where date <= p_to))::int as v_in,
           max(date) filter (where date <= p_to) as last_in,
           (count(*) filter (where date > p_to))::int as v_back,
           min(date) filter (where date > p_to) as first_back,
           min(first_date) as first_ever,
           (count(*) filter (where date <= p_to and first_date is not null and date > first_date))::int as v_known
    from cf group by branch, cn
  )
  select a.branch, a.cn, a.client, a.v_in, a.last_in, a.first_ever, a.v_back, a.first_back, a.v_known
  from agg a
  where a.v_in > 0
$$;

create or replace function public.retention_staff_base(p_from date, p_to date, p_ret_to date, p_branches text[])
returns table(branch text, emp text, ck text, v int, v_same int, v_known int)
language sql stable security definer set search_path to 'public' as $$
  with sf as (
    select d.branch, d.date, d.emp, d.cn, f.first_date
    from retention_staff_days d left join door_first_visits f on f.cn = d.cn
    where d.date between p_from and p_ret_to and d.branch = any(p_branches)
  )
  select branch, emp, cn, (count(*) filter (where date <= p_to))::int, (count(*) filter (where date > p_to))::int,
         (count(*) filter (where date <= p_to and first_date is not null and date > first_date))::int
  from sf group by branch, emp, cn
  having count(*) filter (where date <= p_to) > 0
$$;

revoke all on function public.retention_base(date, date, date, text[]) from public, anon, authenticated;
revoke all on function public.retention_staff_base(date, date, date, text[]) from public, anon, authenticated;

-- The numbers: one row per branch and one per stylist. The return window is the 2 months after the Period (or p_return_days), up to today;
-- under 30 days of it and there is nothing to measure yet ('ok' false). p_kpi: ignore the Period and read the stylist KPI's own window.
create or replace function public.retention_report(p_from date, p_to date, p_branch text default null, p_return_days int default null, p_kpi boolean default false)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  br text[] := coalesce(string_to_array(nullif(p_branch, ''), ','), array['AQ', 'KCA', 'MC', 'SAA']);
  ret_to date; full_to date; asof date; out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this page'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  br := array(select b from unnest(br) b where b in ('AQ', 'KCA', 'MC', 'SAA'));
  if p_kpi then
    asof := least(current_date, (select max(date) from sales_transaction_lines));
    p_to := asof - 90; p_from := asof - 179; p_return_days := 90;
  end if;
  if p_from < date '2021-08-01' then p_from := date '2021-08-01'; end if;
  full_to := case when p_return_days is null then (p_to + interval '2 months')::date else p_to + least(greatest(p_return_days, 30), 366) end;
  ret_to := least(full_to, current_date);
  if p_to >= current_date or ret_to - p_to < 30 or p_to < p_from or array_length(br, 1) is null then
    return jsonb_build_object('ok', false, 'from', p_from, 'to', p_to, 'days', greatest(least(ret_to, current_date) - p_to, 0));
  end if;

  with b as materialized (select * from public.retention_base(p_from, p_to, ret_to, br)),
  bb as (
    select branch,
      count(*) cohort, count(*) filter (where v_back > 0) back,
      count(*) filter (where first_ever >= p_from or first_ever is null) new_c,
      count(*) filter (where (first_ever >= p_from or first_ever is null) and v_back > 0) new_b,
      count(*) filter (where first_ever < p_from) old_c,
      count(*) filter (where first_ever < p_from and v_back > 0) old_b,
      count(*) filter (where v_in = 1) once_c, count(*) filter (where v_in = 1 and v_back > 0) once_b,
      count(*) filter (where v_in >= 2) rep_c, count(*) filter (where v_in >= 2 and v_back > 0) rep_b
    from b group by branch
  ), s as (
    select sb.branch, sb.emp,
      count(*) clients, sum(sb.v) visits,
      count(*) filter (where sb.v = 1) c1, count(*) filter (where sb.v = 2) c2, count(*) filter (where sb.v >= 3) c3,
      count(*) filter (where sb.v_same > 0) same_c,
      count(*) filter (where coalesce(b.v_back, 0) > 0) any_c,
      count(*) filter (where sb.v_known > 0) rn,
      count(*) filter (where sb.v_known > 0 and sb.v_same > 0) rsame,
      count(*) filter (where sb.v_known > 0 and coalesce(b.v_back, 0) > 0) rany
    from public.retention_staff_base(p_from, p_to, ret_to, br) sb
    left join b on b.branch = sb.branch and b.ck = sb.ck
    group by sb.branch, sb.emp
  )
  select jsonb_build_object(
    'ok', true, 'kpi', p_kpi, 'asof', asof, 'from', p_from, 'to', p_to, 'ret_from', p_to + 1, 'ret_to', ret_to, 'full_to', full_to, 'partial', full_to > current_date,
    'return_days', ret_to - p_to,
    'branches', coalesce((select jsonb_agg(to_jsonb(bb) order by branch) from bb), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('b', branch, 'e', emp, 'clients', clients, 'visits', visits, 'c1', c1, 'c2', c2, 'c3', c3, 'same', same_c, 'any', any_c,
                         'rn', rn, 'rsame', rsame, 'rany', rany) order by branch, emp) from s), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- The clients behind any number on the page. p_seg: all | new | known | once | repeat. p_ret: all | back | notback.
-- With p_emp (and p_eb, their branch; no p_eb = every salon they work at) it is one stylist's clients: p_bucket 1, 2 or 3 (3 and up) narrows by how often they came to them,
-- p_same true counts only a return to the same stylist, p_regulars true keeps only the regulars (the stylist KPI's cohort).
-- With p_kpi and no p_emp it is every stylist-and-client pair of the regulars (what the KPI adds up), seen by the stylist, back = back to that stylist.
-- p_ret then reads back or notback on that basis. p_return_days must be the same as the report's.
create or replace function public.drill_retention_clients(p_from date, p_to date, p_branch text default null, p_seg text default 'all', p_ret text default 'all',
  p_emp text default null, p_eb text default null, p_same boolean default false, p_bucket int default null, p_return_days int default null, p_regulars boolean default false,
  p_kpi boolean default false)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  br text[] := coalesce(string_to_array(nullif(p_branch, ''), ','), array['AQ', 'KCA', 'MC', 'SAA']);
  ret_to date; asof date; out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  br := array(select b from unnest(br) b where b in ('AQ', 'KCA', 'MC', 'SAA'));
  if p_kpi then
    asof := least(current_date, (select max(date) from sales_transaction_lines));
    p_to := asof - 90; p_from := asof - 179; p_return_days := 90; p_regulars := true;
  end if;
  if p_from < date '2021-08-01' then p_from := date '2021-08-01'; end if;
  ret_to := least(case when p_return_days is null then (p_to + interval '2 months')::date else p_to + least(greatest(p_return_days, 30), 366) end, current_date);

  with b as materialized (select * from public.retention_base(p_from, p_to, ret_to, br)),
  sb as materialized (select * from public.retention_staff_base(p_from, p_to, ret_to, br)),
  who as (select branch, ck, string_agg(emp, ', ' order by emp) as st from sb group by branch, ck),
  one as (
    select b.*, sb.v as sv, sb.v_same, sb.v_known as sk
    from b join sb on sb.branch = b.branch and sb.ck = b.ck
    where p_emp is not null and sb.emp = p_emp and (p_eb is null or sb.branch = p_eb)
  ), pairs as (
    select b.branch, b.ck, b.client, sb.v as v_in, b.last_in, b.first_back, sb.emp as st, (sb.v_same > 0) as is_back
    from sb join b on b.branch = sb.branch and b.ck = sb.ck
    where p_kpi and p_emp is null and sb.v_known > 0
  ), pick as (
    select b.branch, b.ck, b.client, b.v_in as v, b.last_in, b.first_back,
           case when p_emp is null then b.v_back > 0 when p_same then b.v_same > 0 else b.v_back > 0 end as is_back, null::text as st
    from (select o.branch, o.ck, o.client, coalesce(o.sv, 0) as v_in, o.last_in, o.first_back, o.v_back, o.v_same, o.first_ever, o.sk from one o
          union all
          select x.branch, x.ck, x.client, x.v_in, x.last_in, x.first_back, x.v_back, x.v_back, x.first_ever, 0 from b x where p_emp is null and not p_kpi) b
    where (p_emp is null and (
              p_seg = 'all' or (p_seg = 'new' and (b.first_ever >= p_from or b.first_ever is null)) or (p_seg = 'known' and b.first_ever < p_from)
              or (p_seg = 'once' and b.v_in = 1) or (p_seg = 'repeat' and b.v_in >= 2)))
       or (p_emp is not null and (p_bucket is null or (p_bucket < 3 and b.v_in = p_bucket) or (p_bucket >= 3 and b.v_in >= 3))
           and (not p_regulars or b.sk > 0))
  ), fin as (
    select p.branch, p.ck, p.client, p.v, p.last_in, p.first_back, p.is_back, w.st
    from pick p left join who w on w.branch = p.branch and w.ck = p.ck
    where p_ret = 'all' or (p_ret = 'back' and p.is_back) or (p_ret = 'notback' and not p.is_back)
    union all
    select q.branch, q.ck, q.client, q.v_in, q.last_in, q.first_back, q.is_back, q.st
    from pairs q
    where p_ret = 'all' or (p_ret = 'back' and q.is_back) or (p_ret = 'notback' and not q.is_back)
  ), shown as (select * from fin order by (case when is_back then 1 else 0 end), last_in desc, client limit 5000)
  select jsonb_build_object(
    'total', (select count(*) from fin),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('k', ck, 'c', client, 'b', branch, 'st', st, 'v', v, 'last', last_in, 'back', first_back,
              'days', current_date - last_in, 'is', is_back) order by (case when is_back then 1 else 0 end), last_in desc, client) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;

grant execute on function public.retention_report(date, date, text, int, boolean) to authenticated;
grant execute on function public.drill_retention_clients(date, date, text, text, text, text, text, boolean, int, int, boolean, boolean) to authenticated;

-- perf_clients (Staff Dashboards, Stylist's Benchmarks, the 1-to-1s, the to-do list and the Pulse all read it through perf_client_cache): its retention now reads
-- the same day tables, by client id. Only the earlier / ret blocks change; conversion and colour are untouched. Old definition kept in _defs_backup_3nov.
do $do$
declare d text; i1 int; i2 int; nd text; blk text;
begin
  create table if not exists public._defs_backup_3nov (name text primary key, def text, saved_at timestamptz default now());
  revoke all on public._defs_backup_3nov from public, anon, authenticated;
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'perf_clients';
  if d like '%retention_staff_days%' then return; end if;   -- already done
  insert into public._defs_backup_3nov (name, def) values ('perf_clients', d) on conflict (name) do nothing;
  i1 := strpos(d, E'  ), earlier as (');
  i2 := strpos(d, E'  )\n  select jsonb_build_object(');
  if i1 = 0 or i2 = 0 or i2 < i1 then raise exception 'perf_clients has changed: the earlier / ret blocks were not found'; end if;
  blk := E'  ), earlier as (\n'
      || E'    select distinct rd.cn\n'
      || E'    from retention_staff_days rd join door_first_visits f on f.cn = rd.cn\n'
      || E'    where rd.emp = s.phorest_name\n'
      || E'      and rd.date between (select d from asof) - 179 and (select d from asof) - 90\n'
      || E'      and rd.date > f.first_date\n'
      || E'  ), ret as (\n'
      || E'    select count(*) n,\n'
      || E'           count(*) filter (where exists (\n'
      || E'             select 1 from retention_staff_days r2 where r2.emp = s.phorest_name and r2.cn = e.cn\n'
      || E'               and r2.date > (select d from asof) - 90 and r2.date <= (select d from asof))) back\n'
      || E'    from earlier e\n';
  nd := left(d, i1 - 1) || blk || substr(d, i2);
  execute nd;
end $do$;

-- ── Matching the Pulse to the person (3 Nov 2026, later): guarded patches, each a no-op when already applied ────────────────
-- 1. perf_clients says how many came back (retention_back) and refresh_perf_client_cache stores that count, not one rebuilt from a rounded percentage.
-- 2. retention_report: a 'perf' flag on each stylist row (an active perf_staff row, the people the Pulse adds up), and person-level regulars across salons
--    (rn_e / rsame_e / rany_e: one client counted once per person however many salons, back = any visit to that person in the return window).
--    KPI totals add rn_e / rsame_e over the perf people: 4,928 regulars, 1,988 back on 3 Nov 2026, the Pulse tile exactly.
-- 3. drill_retention_clients in KPI mode lists those same (person, client) pairs for perf people only, so every figure equals its list.
do $do$
declare d text; a text; b text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'perf_clients';
  if d not like '%''retention_back''%' then
    a := '''retention_n'',      ret.n,'; b := '''retention_n'',      ret.n,' || E'\n    ''retention_back'',   ret.back,';
    if position(a in d) = 0 then raise exception 'perf_clients: retention_n line not found'; end if;
    execute replace(d, a, b);
  end if;
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'refresh_perf_client_cache';
  if d not like '%retention_back%' then
    a := 'rn, round(coalesce((j->>''retention_pct'')::numeric, 0) * rn / 100)::int, now())';
    b := 'rn, coalesce((j->>''retention_back'')::int, round(coalesce((j->>''retention_pct'')::numeric, 0) * rn / 100)::int), now())';
    if position(a in d) = 0 then raise exception 'refresh_perf_client_cache: pattern not found'; end if;
    execute replace(d, a, b);
  end if;
end $do$;

do $do$
declare d text; i1 int; i2 int;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'retention_report';
  if d like '%bool_or(sb.v_known > 0) k%' then return; end if;
  -- perf flag
  d := replace(d, E'left join b on b.branch = sb.branch and b.ck = sb.ck\n    group by sb.branch, sb.emp', E'left join b on b.branch = sb.branch and b.ck = sb.ck\n    left join (select distinct phorest_name as pn from perf_staff where active) pn on pn.pn = sb.emp\n    group by sb.branch, sb.emp');
  d := replace(d, E'rany\n    from public.retention_staff_base', E'rany,\n      bool_or(pn.pn is not null) perf\n    from public.retention_staff_base');
  -- person-level regulars across salons
  d := replace(d, E'    group by sb.branch, sb.emp\n  )\n  select jsonb_build_object(', E'    group by sb.branch, sb.emp\n  ), se as (\n    select emp, count(*) filter (where k) rn_e, count(*) filter (where k and sm) rsame_e, count(*) filter (where k and am) rany_e\n    from (\n      select sb.emp, sb.ck, bool_or(sb.v_known > 0) k,\n             bool_or(sb.v_same > 0 or exists (select 1 from retention_staff_days r2 where r2.emp = sb.emp and r2.cn = sb.ck and r2.date > p_to and r2.date <= ret_to)) sm,\n             bool_or(coalesce(b.v_back, 0) > 0) am\n      from public.retention_staff_base(p_from, p_to, ret_to, br) sb\n      left join b on b.branch = sb.branch and b.ck = sb.ck\n      group by sb.emp, sb.ck\n    ) x\n    group by emp\n  )\n  select jsonb_build_object(');
  d := replace(d, '''rany'', rany) order by branch, emp) from s)', '''rany'', rany, ''perf'', perf, ''rn_e'', rn_e, ''rsame_e'', rsame_e, ''rany_e'', rany_e) order by branch, emp) from s join se using (emp))');
  if d not like '%rsame_e%' or d not like '%''perf'', perf%' then raise exception 'retention_report patch did not apply'; end if;
  execute d;
end $do$;

do $do$
declare d text; i1 int; i2 int; blk text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'drill_retention_clients';
  if d like '%perf_staff where active%' then return; end if;
  i1 := strpos(d, E'  ), pairs as (');
  i2 := strpos(d, E'  ), pick as (');
  if i1 = 0 or i2 = 0 or i2 < i1 then raise exception 'pairs block not found'; end if;
  blk := E'  ), pairs as (\n'
      || E'    select (array_agg(sb.branch order by sb.v desc))[1] as branch, sb.ck, min(b.client) as client, sum(sb.v)::int as v_in, max(b.last_in) as last_in, min(b.first_back) as first_back, sb.emp as st,\n'
      || E'           bool_or(sb.v_same > 0 or exists (select 1 from retention_staff_days r2 where r2.emp = sb.emp and r2.cn = sb.ck and r2.date > p_to and r2.date <= ret_to)) as is_back\n'
      || E'    from sb join b on b.branch = sb.branch and b.ck = sb.ck\n'
      || E'    where p_kpi and p_emp is null and sb.emp in (select phorest_name from perf_staff where active)\n'
      || E'    group by sb.emp, sb.ck\n'
      || E'    having bool_or(sb.v_known > 0)\n';
  execute left(d, i1 - 1) || blk || substr(d, i2);
end $do$;
