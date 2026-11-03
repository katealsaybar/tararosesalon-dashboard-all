-- Retention page (Kate, 3 Nov 2026): clients who came in during the Period, and how many came back in the 2 months after.
-- Same client rules as clients through the door (door_clients) and handled per staff (drill_staff_clients), kept by client id (ckey):
-- one client once a day, a paid sale, real services or retail, the day's spend above AED 0; no walk-ins, no staff bookings
-- (client name carries Staff), no BUSINESS TRS lines. Counted per branch: a client who moves salon is not back at the first one.
-- New = her first counted visit anywhere (door_first_visits) falls in the Period; known = she had one before it.
-- Internal helpers (no grants): retention_base, retention_staff_base. Callable: retention_report, drill_retention_clients (Level 3 and up).

create or replace function public.retention_base(p_from date, p_to date, p_ret_to date, p_branches text[])
returns table(branch text, ck text, client text, v_in int, last_in date, first_ever date, v_back int, first_back date)
language sql stable security definer set search_path to 'public' as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_ret_to) d
  ), ln as (
    select l.branch, l.date, l.ckey as cn, l.client_name, l.net,
           (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_ret_to
      and l.branch = any(p_branches)
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
  ), cd as (
    select branch, date, cn, min(client_name) as client
    from ln group by branch, date, cn
    having bool_or(is_real and sale_paid) and coalesce(sum(net) filter (where is_real), 0) > 0
  ), agg as (
    select branch, cn, min(client) as client,
           (count(*) filter (where date <= p_to))::int as v_in,
           max(date) filter (where date <= p_to) as last_in,
           (count(*) filter (where date > p_to))::int as v_back,
           min(date) filter (where date > p_to) as first_back
    from cd group by branch, cn
  )
  select a.branch, a.cn, a.client, a.v_in, a.last_in, f.first_date, a.v_back, a.first_back
  from agg a left join door_first_visits f on f.cn = a.cn
  where a.v_in > 0
$$;

create or replace function public.retention_staff_base(p_from date, p_to date, p_ret_to date, p_branches text[])
returns table(branch text, emp text, ck text, v int, v_same int)
language sql stable security definer set search_path to 'public' as $$
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from sales_transaction_lines where date between p_from and p_ret_to) d
  ), ln as (
    select l.branch, l.date, trim(l.employee_name) as emp, l.ckey as cn, l.net,
           (k.kind not in ('non_sale', 'voucher')) as is_real,
           (bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) and l.day_spend_ok) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_ret_to
      and l.branch = any(p_branches)
      and coalesce(trim(l.client_name), '') <> ''
      and l.client_name !~* '^\s*walk[\s-]*in\M'
      and l.client_name !~* '\mstaff\M'
      and coalesce(l.employee_name, '') !~* '^\s*business\M'
      and coalesce(trim(l.employee_name), '') <> ''
  ), sd as (
    select branch, date, emp, cn from ln group by branch, date, emp, cn
    having bool_or(is_real and sale_paid) and coalesce(sum(net) filter (where is_real), 0) > 0
  )
  select branch, emp, cn, (count(*) filter (where date <= p_to))::int, (count(*) filter (where date > p_to))::int
  from sd group by branch, emp, cn
  having count(*) filter (where date <= p_to) > 0
$$;

revoke all on function public.retention_base(date, date, date, text[]) from public, anon, authenticated;
revoke all on function public.retention_staff_base(date, date, date, text[]) from public, anon, authenticated;

-- The numbers: one row per branch and one per stylist. The return window is the 2 months after the Period, up to today;
-- under 30 days of it and there is nothing to measure yet ('ok' false).
create or replace function public.retention_report(p_from date, p_to date, p_branch text default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  br text[] := coalesce(string_to_array(nullif(p_branch, ''), ','), array['AQ', 'KCA', 'MC', 'SAA']);
  ret_to date; full_to date; out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this page'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  br := array(select b from unnest(br) b where b in ('AQ', 'KCA', 'MC', 'SAA'));
  if p_from < date '2021-08-01' then p_from := date '2021-08-01'; end if;
  full_to := (p_to + interval '2 months')::date;
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
      count(*) filter (where coalesce(b.v_back, 0) > 0) any_c
    from public.retention_staff_base(p_from, p_to, ret_to, br) sb
    left join b on b.branch = sb.branch and b.ck = sb.ck
    group by sb.branch, sb.emp
  )
  select jsonb_build_object(
    'ok', true, 'from', p_from, 'to', p_to, 'ret_from', p_to + 1, 'ret_to', ret_to, 'full_to', full_to, 'partial', full_to > current_date,
    'branches', coalesce((select jsonb_agg(to_jsonb(bb) order by branch) from bb), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('b', branch, 'e', emp, 'clients', clients, 'visits', visits, 'c1', c1, 'c2', c2, 'c3', c3, 'same', same_c, 'any', any_c) order by branch, emp) from s), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- The clients behind any number on the page. p_seg: all | new | known | once | repeat. p_ret: all | back | notback.
-- With p_emp (and p_eb, her branch) it is one stylist's clients: p_bucket 1, 2 or 3 (3 and up) narrows by how often they came to her,
-- p_same true counts only a return to the same stylist. p_ret then reads back or notback on that basis.
create or replace function public.drill_retention_clients(p_from date, p_to date, p_branch text default null, p_seg text default 'all', p_ret text default 'all',
  p_emp text default null, p_eb text default null, p_same boolean default false, p_bucket int default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  br text[] := coalesce(string_to_array(nullif(p_branch, ''), ','), array['AQ', 'KCA', 'MC', 'SAA']);
  ret_to date; out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  br := array(select b from unnest(br) b where b in ('AQ', 'KCA', 'MC', 'SAA'));
  if p_from < date '2021-08-01' then p_from := date '2021-08-01'; end if;
  ret_to := least((p_to + interval '2 months')::date, current_date);

  with b as materialized (select * from public.retention_base(p_from, p_to, ret_to, br)),
  sb as materialized (select * from public.retention_staff_base(p_from, p_to, ret_to, br)),
  who as (select branch, ck, string_agg(emp, ', ' order by emp) as st from sb group by branch, ck),
  one as (
    select b.*, sb.v as sv, sb.v_same
    from b join sb on sb.branch = b.branch and sb.ck = b.ck
    where p_emp is not null and sb.emp = p_emp and sb.branch = p_eb
  ), pick as (
    select b.branch, b.ck, b.client, b.v_in as v, b.last_in, b.first_back,
           case when p_emp is null then b.v_back > 0 when p_same then b.v_same > 0 else b.v_back > 0 end as is_back
    from (select o.branch, o.ck, o.client, coalesce(o.sv, 0) as v_in, o.last_in, o.first_back, o.v_back, o.v_same, o.first_ever from one o
          union all
          select x.branch, x.ck, x.client, x.v_in, x.last_in, x.first_back, x.v_back, x.v_back, x.first_ever from b x where p_emp is null) b
    where (p_emp is null and (
              p_seg = 'all' or (p_seg = 'new' and (b.first_ever >= p_from or b.first_ever is null)) or (p_seg = 'known' and b.first_ever < p_from)
              or (p_seg = 'once' and b.v_in = 1) or (p_seg = 'repeat' and b.v_in >= 2)))
       or (p_emp is not null and (p_bucket is null or (p_bucket < 3 and b.v_in = p_bucket) or (p_bucket >= 3 and b.v_in >= 3)))
  ), fin as (
    select p.*, w.st from pick p left join who w on w.branch = p.branch and w.ck = p.ck
    where p_ret = 'all' or (p_ret = 'back' and p.is_back) or (p_ret = 'notback' and not p.is_back)
  ), shown as (select * from fin order by (case when is_back then 1 else 0 end), last_in desc, client limit 5000)
  select jsonb_build_object(
    'total', (select count(*) from fin),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('k', ck, 'c', client, 'b', branch, 'st', st, 'v', v, 'last', last_in, 'back', first_back,
              'days', current_date - last_in, 'is', is_back) order by (case when is_back then 1 else 0 end), last_in desc, client) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;

grant execute on function public.retention_report(date, date, text) to authenticated;
grant execute on function public.drill_retention_clients(date, date, text, text, text, text, text, boolean, int) to authenticated;
