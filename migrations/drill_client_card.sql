-- Clickable figures (Kate, 27 Oct 2026): phone and email columns in the client lists, a client's visit history in its own window, and the BUSINESS TRS retail lines.
--
--   drill_client_contacts(p_items)       p_items = [[client name, branch code or ""], ...]. Returns [{i, m, e, n}]: i the position in p_items, m phone number(s),
--                                        e email(s), n how many Phorest profiles carry that name. LEVEL 5 ONLY, as Client Book is (migrations/client_book.sql: phones,
--                                        emails and notes never reach a lower level). Source: phorest_client_emails (the Phorest client list pulled 21 Oct 2026), matched on
--                                        the name key the lists use. When several profiles share a name and the branch code narrows it to some of them, only those
--                                        count; if it still does not settle, every number is returned joined with " / " and n says how many profiles there are. Only an
--                                        email Phorest marks "real" is returned (no placeholders, no shared addresses).
--   drill_client_history(p_client, p_branches)
--                                        one client's visits and upcoming bookings, for the client window. Level 3 and above like the other lists; contact details come back
--                                        in "contact" only at Level 5. Visits are client-days with a paid sale (the same visit rule as clients through the door): date,
--                                        branch, staff, services, products, spent, newest first, at most 500. Upcoming comes from client_bookings (pulled from Phorest,
--                                        "pulled" says the day). Phorest visit and client notes are NOT in here (complaint-scan material).
--   drill_house_retail_lines(p_from, p_to, p_branches, p_dept)
--                                        the lines behind "Retail rung with no stylist": BUSINESS TRS lines, same rules and same Hair / Beauty / Unsorted words as
--                                        drill_house_retail (migrations/drill_house_retail.sql), optionally for one department. Client names, so Level 3 and above.
-- All three: signed in, not a scoped login, read only, additive.

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
    select ord, count(*) as n, string_agg(distinct nullif(trim(mobile), ''), ' / ') as m, string_agg(distinct email, ' / ') filter (where email_status = 'real') as e
    from sel group by ord
  )
  select coalesce(jsonb_agg(jsonb_build_object('i', a.ord - 1, 'm', a.m, 'e', a.e, 'n', a.n) order by a.ord), '[]'::jsonb) into out from agg a;
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
    'contact', case when lvl >= 5 then (select jsonb_build_object('m', string_agg(distinct nullif(trim(mobile), ''), ' / '), 'e', string_agg(distinct email, ' / ') filter (where email_status = 'real'), 'n', count(*))
                                         from public.phorest_client_emails where name_key = nk) else null end
  ) into out;
  return out;
end $$;
revoke all on function public.drill_client_history(text, text[]) from public, anon;
grant execute on function public.drill_client_history(text, text[]) to authenticated;

create or replace function public.drill_house_retail_lines(p_from date, p_to date, p_branches text[] default null, p_dept text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;

  with ln as (
    select l.branch, l.date, coalesce(nullif(trim(l.client_name), ''), 'No name') as client, regexp_replace(coalesce(l.item, ''), '\s*\(Refund\)\s*$', '', 'i') as item,
           coalesce(l.item, '') ~* '\(Refund\)\s*$' as refund, public.stl_house_dept(l.item) as dept, l.net,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid,
           public.stl_item_kind(l.item) as kind, coalesce(l.item, '') as raw
    from public.sales_transaction_lines l
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and coalesce(l.employee_name, '') ~* '^\s*business\M'
  ), hit as (
    select * from ln
    where sale_paid and kind in ('product', 'service') and raw !~* '(\d\s*\+\s*\d|blow\s?-?dry|session|package)'
      and (p_dept is null or dept = p_dept)
  ), shown as (
    select * from hit order by date desc, branch, client, item limit 2000
  )
  select jsonb_build_object(
    'total', (select coalesce(round(sum(net), 2), 0) from hit),
    'lines', (select count(*) from hit),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'c', client, 'i', item, 'r', refund, 'k', dept, 'n', round(net, 2)) order by date desc, branch, client, item) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $$;
revoke all on function public.drill_house_retail_lines(date, date, text[], text) from public, anon;
grant execute on function public.drill_house_retail_lines(date, date, text[], text) to authenticated;
