-- Kate, 27 Oct 2026: "need nga i fix" after Amna Al Zaabi matched 14 Phorest profiles. A visit now knows WHICH Phorest client it belongs to.
-- phorest_visit_clients (phorest_visit_clients_table.sql) holds one row per sale: Phorest's clientId for the sale whose transactionNumber is the sale id on the
-- Sales Transactions PDF (sales_transaction_lines.sale_id). Run that file first.
--
-- visit_client_ids(items): items are [name, branch, from, to] (branch '' or null = any branch, to defaults to from). For each item it finds the distinct Phorest client
-- ids on the sales lines carrying that name key in that window:
--   * UAE: the line's sale id -> phorest_visit_clients (exact; the PDF name is only used to find the lines the list shows)
--   * Bahrain (synthetic sale ids): phorest_visit_clients rows of that branch and day carrying the same name key
-- Returns n = how many distinct clients, cid = her id when n = 1.
--
-- drill_client_contacts: an item may now carry from and to dates. n = 1 and her profile is in phorest_client_emails -> her own phone and email. n >= 2 -> nothing
-- is shown and the list says how many clients share the name that period. n = 0 (no dates, a sale Phorest did not return, a profile created after the last client pull)
-- -> the rules of drill_client_contacts_shared_names.sql, unchanged. Level 5 only.
-- drill_client_history gets p_from and p_to (the visit day, or the period of the list she was opened from). When one client is resolved only her sales are in the
-- window (sales that cannot be placed are kept only when one profile carries the name); otherwise the name is merged as before and ambig says how many clients share it.
-- Level 3 and above. Both read only. drill_client_history keeps the 27 Oct rule that a visit needs real spend (day_spend_ok, strict_visit_day_spend.sql); the first apply of this file
-- replaced a live copy that already had it, restored the same day.

create index if not exists phorest_client_emails_pid_idx on public.phorest_client_emails (phorest_id);

create or replace function public.visit_client_ids(p_items jsonb)
returns table(ord bigint, n integer, cid text)
language sql stable security definer
set search_path = public
set statement_timeout to '20s'
as $$
  with it as (
    select t.ord, public.stl_client_key(t.x ->> 0) as nk, nullif(t.x ->> 1, '') as br,
           nullif(t.x ->> 2, '')::date as f, coalesce(nullif(t.x ->> 3, '')::date, nullif(t.x ->> 2, '')::date) as t
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(x, ord)
  ), p1 as (
    select it.ord, v.phorest_client_id as cid
    from it
    join public.sales_transaction_lines l on public.stl_client_key(l.client_name) = it.nk and (it.br is null or l.branch = it.br) and l.date between it.f and it.t
    join public.phorest_visit_clients v on v.branch = l.branch and v.date = l.date and v.tx = l.sale_id
    where it.f is not null and it.nk <> ''
  ), p2 as (
    select it.ord, v.phorest_client_id as cid
    from it
    join public.phorest_visit_clients v on v.name_key = it.nk and v.branch = 'BAH' and (it.br is null or v.branch = it.br) and v.date between it.f and it.t
    where it.f is not null and it.nk <> ''
  ), u as (
    select ord, cid from p1 union select ord, cid from p2
  )
  select it.ord, count(distinct u.cid)::integer as n, case when count(distinct u.cid) = 1 then min(u.cid) end as cid
  from it left join u on u.ord = it.ord
  group by it.ord
$$;
revoke all on function public.visit_client_ids(jsonb) from public, anon, authenticated;

create or replace function public.drill_client_contacts(p_items jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public
set statement_timeout to '30s'
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 5 then raise exception 'Level 5 only'; end if;

  with it as (
    select t.ord, lower(regexp_replace(trim(t.x ->> 0), '\s+', ' ', 'g')) as nk, nullif(t.x ->> 1, '') as br
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(x, ord)
  ), res as (
    select * from public.visit_client_ids(p_items)
  ), rprof as (
    select r.ord, nullif(trim(e.mobile), '') as m, case when e.email_status = 'real' then e.email end as e
    from res r join public.phorest_client_emails e on e.phorest_id = r.cid where r.n = 1
  ), cand as (
    select it.ord, e.phorest_id, e.mobile, e.email, e.email_status,
           (it.br is not null and (e.branch = it.br or exists (select 1 from public.phorest_client_branches b where b.phorest_id = e.phorest_id and b.branch_code = it.br))) as at_branch
    from it join public.phorest_client_emails e on e.name_key = it.nk
  ), pick as (
    select c.*, bool_or(c.at_branch) over (partition by c.ord) as any_at from cand c
  ), sel as (
    select * from pick where not any_at or at_branch
  ), agg as (
    select ord, count(distinct phorest_id) as n, string_agg(distinct nullif(trim(mobile), ''), ' / ') as m, string_agg(distinct email, ' / ') filter (where email_status = 'real') as e
    from sel group by ord
  ), own as (
    select it.ord, nullif(trim(cc.mobile), '') as m, case when cc.email_status = 'real' then cc.email end as e
    from it join public.client_contacts cc on cc.branch = it.br and cc.client_key = it.nk and cc.match = 'own branch'
  ), fin as (
    select it.ord,
      case when res.n >= 2 then res.n when rprof.ord is not null then 1 else agg.n end as n,
      case when res.n >= 2 then true when rprof.ord is not null then false else (agg.n > 1 and own.ord is null) end as a,
      case when res.n >= 2 then null when rprof.ord is not null then rprof.m when agg.n = 1 then agg.m when own.ord is not null then own.m end as m,
      case when res.n >= 2 then null when rprof.ord is not null then rprof.e when agg.n = 1 then agg.e when own.ord is not null then own.e end as e
    from it
    left join res on res.ord = it.ord
    left join rprof on rprof.ord = it.ord
    left join agg on agg.ord = it.ord
    left join own on own.ord = it.ord
  )
  select coalesce(jsonb_agg(jsonb_build_object('i', f.ord - 1, 'n', f.n, 'a', f.a, 'm', f.m, 'e', f.e) order by f.ord), '[]'::jsonb) into out
  from fin f where f.n is not null;
  return out;
end $$;
revoke all on function public.drill_client_contacts(jsonb) from public, anon;
grant execute on function public.drill_client_contacts(jsonb) to authenticated;

drop function if exists public.drill_client_history(text, text[]);
create or replace function public.drill_client_history(p_client text, p_branches text[] default null, p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
set statement_timeout to '20s'
as $$
declare out jsonb; nk text := lower(regexp_replace(trim(coalesce(p_client, '')), '\s+', ' ', 'g')); lvl int; today date := (now() at time zone 'Asia/Dubai')::date;
        rn int; rcid text; pn int;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  lvl := public.lost_send_level();
  if lvl < 3 then raise exception 'Level 3 and above'; end if;
  if nk = '' then raise exception 'Which client?'; end if;

  -- which Phorest client? only when the visit day (or the period of the list) is known
  select r.n, r.cid into rn, rcid from public.visit_client_ids(jsonb_build_array(jsonb_build_array(p_client, null::text, p_from::text, p_to::text))) r limit 1;
  select count(*) into pn from public.phorest_client_emails where name_key = nk;

  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines where lower(regexp_replace(trim(client_name), '\s+', ' ', 'g')) = nk) d
  ), ln0 as (
    select l.branch, l.date, l.sale_id, trim(l.employee_name) as emp, regexp_replace(coalesce(l.item, ''), '\s*\(Refund\)\s*$', '', 'i') as item, l.net, k.kind, l.employee_name, l.payment_raw, l.day_spend_ok,
           coalesce(v.phorest_client_id, (select case when count(distinct b.phorest_client_id) = 1 then min(b.phorest_client_id) end
                                          from public.phorest_visit_clients b where l.branch = 'BAH' and b.branch = l.branch and b.date = l.date and b.name_key = nk)) as sid
    from public.sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    left join public.phorest_visit_clients v on v.branch = l.branch and v.date = l.date and v.tx = l.sale_id
    where lower(regexp_replace(trim(l.client_name), '\s+', ' ', 'g')) = nk and (p_branches is null or l.branch = any(p_branches))
  ), ln as (
    select branch, date, emp, item, net, kind, day_spend_ok,
           (kind not in ('non_sale', 'voucher') and coalesce(employee_name, '') !~* '^\s*business\M') as is_real,
           (bool_or(nullif(trim(payment_raw), '') is not null) over (partition by branch, date, sale_id) and day_spend_ok) as sale_paid
    from ln0
    where rn is distinct from 1 or sid = rcid or (sid is null and pn <= 1)
  ), cd as (
    select *, bool_or(is_real and sale_paid) over (partition by branch, date) as counts from ln
  ), days as (
    select branch, date, sum(net) filter (where is_real) as spent,
           string_agg(distinct emp, ', ') filter (where is_real and emp <> '') as staff,
           string_agg(distinct item, ', ') filter (where is_real and kind in ('service', 'prepaid')) as services,
           string_agg(distinct item, ', ') filter (where is_real and kind = 'product') as products,
           count(*) filter (where is_real) as lines
    from cd where counts group by branch, date
  ), team as (
    select emp, count(distinct (branch, date)) as d from cd where counts and is_real and emp <> '' group by emp order by d desc, emp limit 3
  ), tb as (
    select branch from days group by branch order by count(*) desc, branch limit 1
  ), prof as (
    select count(distinct e.phorest_id) as n,
           (array_agg(nullif(trim(e.mobile), '')))[1] as m1, string_agg(distinct nullif(trim(e.mobile), ''), ' / ') as m,
           string_agg(distinct e.email, ' / ') filter (where e.email_status = 'real') as e
    from public.phorest_client_emails e where e.name_key = nk
  ), rprof as (
    select nullif(trim(e.mobile), '') as m, case when e.email_status = 'real' then e.email end as e
    from public.phorest_client_emails e where rn = 1 and e.phorest_id = rcid limit 1
  ), own as (
    select nullif(trim(cc.mobile), '') as m, case when cc.email_status = 'real' then cc.email end as e
    from public.client_contacts cc, tb where cc.branch = tb.branch and cc.client_key = nk and cc.match = 'own branch'
  )
  select jsonb_build_object(
    'visits', (select count(*) from days),
    'first', (select min(date) from days),
    'last', (select max(date) from days),
    'spent', (select coalesce(round(sum(spent), 2), 0) from days),
    'team', (select coalesce(jsonb_agg(jsonb_build_object('e', emp, 'd', d) order by d desc, emp), '[]'::jsonb) from team),
    'since', (select min(since_date) from public.phorest_client_since where case when rn = 1 then phorest_id = rcid else name_key = nk end),
    'one', (rn = 1),
    'ambig', case when rn >= 2 then rn end,
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'e', staff, 's', services, 'p', products, 'n', round(spent, 2), 'l', lines) order by date desc, branch), '[]'::jsonb)
             from (select * from days order by date desc, branch limit 500) x),
    'upcoming', (select coalesce(jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'e', staff, 's', services) order by date, branch), '[]'::jsonb)
                 from public.client_bookings where client_key = nk and date >= today and (p_branches is null or branch = any(p_branches))),
    'pulled', (select max(pulled_on) from public.client_bookings),
    'contact', case when lvl >= 5 then (select case
                  when rn = 1 and exists (select 1 from rprof) then (select jsonb_build_object('m', rprof.m, 'e', rprof.e, 'n', 1, 'a', false) from rprof)
                  when rn >= 2 then jsonb_build_object('n', rn, 'a', true)
                  when prof.n = 1 then jsonb_build_object('m', prof.m, 'e', prof.e, 'n', prof.n, 'a', false)
                  when prof.n > 1 and exists (select 1 from own) then (select jsonb_build_object('m', own.m, 'e', own.e, 'n', prof.n, 'a', false) from own limit 1)
                  when prof.n > 1 then jsonb_build_object('n', prof.n, 'a', true)
                  else null end from prof) else null end
  ) into out;
  return out;
end $$;
revoke all on function public.drill_client_history(text, text[], date, date) from public, anon;
grant execute on function public.drill_client_history(text, text[], date, date) to authenticated;
