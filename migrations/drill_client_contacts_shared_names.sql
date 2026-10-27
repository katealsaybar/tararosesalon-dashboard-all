-- Kate, 27 Oct 2026: a common name ("Amna Al Zaabi") matched about 17 Phorest profiles and the Phone column listed all their numbers. Most of them are other people.
-- Contact details are now shown only when they are certain, otherwise withheld and the list says how many clients share the name:
--   one Phorest profile carries the name                             -> her phone and email
--   several do, and the branch narrows it to one                      -> that one (done before, in drill_client_card.sql)
--   several still, but the New Clients report matched her to her own branch (client_contacts, match = 'own branch', one row per branch and name) -> that row
--   anything else                                                     -> nothing, a = true and n says how many profiles share the name
-- On 1-26 Oct: 1,639 of 1,920 client and branch pairs have one profile, 60 more are settled by the branch, 25 more by an own-branch match, and the rest are withheld.
-- The client window uses the same rule with the branch she visited most. Level 5 only, read only, replaces the functions of the same name.

create or replace function public.drill_client_contacts(p_items jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public
set statement_timeout to '20s'
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 5 then raise exception 'Level 5 only'; end if;

  with it as (
    select t.ord, lower(regexp_replace(trim(t.x ->> 0), '\s+', ' ', 'g')) as nk, nullif(t.x ->> 1, '') as br
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(x, ord)
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
  )
  select coalesce(jsonb_agg(jsonb_build_object('i', a.ord - 1, 'n', a.n, 'a', (a.n > 1 and o.ord is null),
                                               'm', case when a.n = 1 then a.m when o.ord is not null then o.m end,
                                               'e', case when a.n = 1 then a.e when o.ord is not null then o.e end) order by a.ord), '[]'::jsonb) into out
  from agg a left join own o on o.ord = a.ord;
  return out;
end $$;
revoke all on function public.drill_client_contacts(jsonb) from public, anon;
grant execute on function public.drill_client_contacts(jsonb) to authenticated;

create or replace function public.drill_client_history(p_client text, p_branches text[] default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
set statement_timeout to '20s'
as $$
declare out jsonb; nk text := lower(regexp_replace(trim(coalesce(p_client, '')), '\s+', ' ', 'g')); lvl int; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  lvl := public.lost_send_level();
  if lvl < 3 then raise exception 'Level 3 and above'; end if;
  if nk = '' then raise exception 'Which client?'; end if;

  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines where lower(regexp_replace(trim(client_name), '\s+', ' ', 'g')) = nk) d
  ), ln as (
    select l.branch, l.date, trim(l.employee_name) as emp, regexp_replace(coalesce(l.item, ''), '\s*\(Refund\)\s*$', '', 'i') as item, l.net, k.kind,
           (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
    from public.sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where lower(regexp_replace(trim(l.client_name), '\s+', ' ', 'g')) = nk and (p_branches is null or l.branch = any(p_branches))
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
    'since', (select min(since_date) from public.phorest_client_since where name_key = nk),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'e', staff, 's', services, 'p', products, 'n', round(spent, 2), 'l', lines) order by date desc, branch), '[]'::jsonb)
             from (select * from days order by date desc, branch limit 500) x),
    'upcoming', (select coalesce(jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'e', staff, 's', services) order by date, branch), '[]'::jsonb)
                 from public.client_bookings where client_key = nk and date >= today and (p_branches is null or branch = any(p_branches))),
    'pulled', (select max(pulled_on) from public.client_bookings),
    'contact', case when lvl >= 5 then (select case
                  when prof.n = 1 then jsonb_build_object('m', prof.m, 'e', prof.e, 'n', prof.n, 'a', false)
                  when prof.n > 1 and exists (select 1 from own) then (select jsonb_build_object('m', own.m, 'e', own.e, 'n', prof.n, 'a', false) from own limit 1)
                  when prof.n > 1 then jsonb_build_object('n', prof.n, 'a', true)
                  else null end from prof) else null end
  ) into out;
  return out;
end $$;
revoke all on function public.drill_client_history(text, text[]) from public, anon;
grant execute on function public.drill_client_history(text, text[]) to authenticated;
