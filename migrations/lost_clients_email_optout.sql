-- Client's Last Visit: Email and Opt-out columns (Kate, 22 Oct 2026).
--
-- Email comes from client_contacts (filled by new clients/match_client_emails.sql), so it follows the
-- phone: only the owner login's rows come back, and the page draws the column only when there are some.
--
-- Opt-out is a label per client: STOP, DND or Opted out. It is built from the two places we record it:
--   lost_send_optout  (the site-sending block list: reception lists, Kate's do-not-contact, STOP replies seen
--                      in the inbox, respond.io message/tag matches) always counts;
--   lost_wa_status    (respond-status-sync, opted_out) counts when she has not visited since the reply, the
--                      same visit rule as the Lost Clients lists (lost_lists_core_x).
-- A third source, added 22 Oct 2026: lost_excluded 'Do not contact', the coordinators' marks in the Lost Clients blast lists,
-- always counts as DND and is matched on her name, so it needs no number.
-- The first two are matched on her phone numbers. The helper is SECURITY DEFINER and returns labels only, never
-- numbers, so every Level 2+ login sees the opt-out even though only the owner can read client_contacts.

create or replace function public.lost_optout_map()
returns table(k text, optout text, optout_note text, optout_at date, hard boolean)
language plpgsql stable security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  return query
  with nums as (
    select public.stl_key_fold(c.client_key) as k, btrim(x) as phone
    from client_contacts c
    cross join lateral unnest(string_to_array(coalesce(c.mobile, '') || ' / ' || coalesce(c.landline, ''), ' / ')) as x
    where btrim(x) <> ''
    group by 1, 2
  ), hits as (
    select n.k, o.reason as why, o.added_at::date as at, true as hard, null::text as forced
    from nums n join lost_send_optout o on o.phone = n.phone
    union all
    select n.k, w.opt_phrase || coalesce(' (' || w.opt_source || ')', ''), w.opt_at::date, false, null::text
    from nums n join lost_wa_status w on w.phone = n.phone and w.opted_out
    union all
    -- the coordinators' "Do not contact" marks in the Lost Clients blast lists (lost_excluded), by name, so no number is needed
    select public.stl_key_fold(e.client_key), 'Coordinators marked do not contact (' || coalesce(e.set_by, 'blast list') || ')' || coalesce(': ' || e.note, ''),
           e.set_at::date, true, 'DND'
    from lost_excluded e where e.reason = 'Do not contact'
  ), lab as (
    select h.*, coalesce(h.forced, case
        when lower(h.why) ~ '(^|[^a-z])(stop|unsubscribe)([^a-z]|$)' then 'STOP'
        when lower(h.why) ~ 'do not contact|do not disturb|dont disturb|don''t disturb|dnd|do not call|dont call|do not text|do not message' then 'DND'
        else 'Opted out' end) as label
    from hits h
  )
  select distinct on (l.k) l.k, l.label, l.why, l.at, l.hard
  from lab l
  order by l.k, l.hard desc, (case l.label when 'STOP' then 0 when 'DND' then 1 else 2 end), l.at desc nulls last;
end $function$;
revoke all on function public.lost_optout_map() from public, anon;
grant execute on function public.lost_optout_map() to authenticated;

-- First visit (Kate, 22 Oct 2026): her first visit ever at any branch (Phorest data goes back to 2021), from client_directory,
-- folded to the same key as the list. A small materialized view refreshed hourly at :12 (client_directory refreshes at :07), read
-- through a security definer helper like the opt-out map, so the list is not slowed and the view is not exposed.
create materialized view if not exists public.lost_first_visit as
  select public.stl_key_fold(d.ckey) as k, min(d.first_visit) as first_ever from public.client_directory d group by 1;
create unique index if not exists lost_first_visit_k on public.lost_first_visit (k);
revoke all on public.lost_first_visit from public, anon, authenticated;

create or replace function public.lost_first_visits()
returns table(k text, first_ever date)
language plpgsql stable security definer
set search_path to 'public'
set statement_timeout to '30s'
as $function$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  return query select v.k, v.first_ever from public.lost_first_visit v;
end $function$;
revoke all on function public.lost_first_visits() from public, anon;
grant execute on function public.lost_first_visits() to authenticated;
select cron.schedule('lost-first-visit-hourly', '12 * * * *', 'refresh materialized view concurrently public.lost_first_visit');

-- lost_clients: the same body as before (see lost_clients_booked.sql / lost_clients_fold_doubled_names.sql
-- for its history) plus email, email_status, email_match and optout, optout_note, optout_at.
create or replace function public.lost_clients(p_branch text, p_min_visits integer default 3, p_max_visits integer default null::integer, p_days integer default 90)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'public'
 set statement_timeout to '30s'
 set enable_nestloop to 'off'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with b0 as materialized (
    select s.client_name as cn, s.date, s.net, s.employee_name, coalesce(s.item, '') as raw_item
    from sales_transaction_lines s
    where (s.branch = p_branch or (p_branch is null and s.branch in ('SAA', 'KCA', 'MC', 'AQ')))
      and s.date >= date '2025-01-01' and s.client_name is not null
  ), kinds as materialized (
    select raw_item, public.stl_item_kind(raw_item) as kind from (select distinct raw_item from b0) d
  ), b as materialized (
    select b0.cn, b0.date, b0.net, b0.employee_name
    from b0 join kinds using (raw_item)
    where kinds.kind not in ('non_sale', 'voucher')
  ), nm0 as materialized (
    select cn, name, public.stl_key_fold(name) as k
    from (select cn, regexp_replace(trim(cn), '\s+', ' ', 'g') as name from (select distinct cn from b) q) x
    where name <> '' and cn !~* '^\s*walk[\s-]*in\M'
  ), kk as materialized (
    select k, row_number() over (order by k)::int as kid, (array_agg(name order by length(name), name))[1] as name from nm0 group by k
  ), nm as materialized (
    select nm0.cn, kk.kid from nm0 join kk using (k)
  ), l as materialized (
    select nm.kid, b.date, b.net, b.employee_name from b join nm using (cn)
  ), c as materialized (
    select kid, count(distinct date)::int as visits,
           min(date) as first_visit, max(date) as last_visit, round(sum(coalesce(net, 0)), 2) as spend
    from l group by kid
  ), cf as materialized (
    select c.*, kk.k, kk.name as client_name from c join kk using (kid)
    where c.visits >= p_min_visits and (p_max_visits is null or c.visits <= p_max_visits)
      and c.last_visit < current_date - p_days
  ), st as materialized (
    select x.kid, x.employee_name, x.rn from (
      select l.kid, l.employee_name,
             row_number() over (partition by l.kid order by count(*) desc, max(l.date) desc) as rn
      from l where coalesce(l.employee_name, '') <> ''
      group by l.kid, l.employee_name
    ) x where x.rn = 1
  ), elsewhere as materialized (
    select public.stl_key_fold(s.client_name) as k,
           string_agg(distinct s.branch, ', ' order by s.branch) as now_at, max(s.date) as now_last
    from sales_transaction_lines s
    where p_branch is not null and s.branch <> p_branch and s.branch in ('SAA', 'KCA', 'MC', 'AQ')
      and s.date >= current_date - p_days
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
      and public.stl_item_kind(s.item) not in ('non_sale', 'voucher')
    group by 1
  ), bk as materialized (
    select distinct on (public.stl_key_fold(b2.client_key)) public.stl_key_fold(b2.client_key) as k, b2.date as booked_on, b2.branch as booked_at,
           b2.staff as booked_with, b2.services as booked_for
    from client_bookings b2
    where b2.date >= current_date
    order by public.stl_key_fold(b2.client_key), b2.date, (b2.branch = p_branch) desc
  ), cc as materialized (
    select distinct on (public.stl_key_fold(c2.client_key)) public.stl_key_fold(c2.client_key) as k, c2.mobile, c2.landline, c2.match,
           c2.email, c2.email_status, c2.email_match
    from client_contacts c2
    where p_branch is null or c2.branch = p_branch
    order by public.stl_key_fold(c2.client_key), c2.updated_at desc
  ), oo as materialized (
    select * from public.lost_optout_map()
  ), fv as materialized (
    select * from public.lost_first_visits()
  ), r as (
    select cf.client_name, cf.visits, cf.first_visit, cf.last_visit,
           (current_date - cf.last_visit) as days_since, cf.spend,
           st.employee_name as stylist, cc.mobile, cc.landline, cc.match,
           cc.email, cc.email_status, cc.email_match, least(fv.first_ever, cf.first_visit) as first_ever,
           oo.optout, oo.optout_note, oo.optout_at,
           e.now_at, e.now_last,
           bk.booked_on, bk.booked_at, bk.booked_with, bk.booked_for
    from cf
    left join st on st.kid = cf.kid
    left join cc on cc.k = cf.k
    left join fv on fv.k = cf.k
    left join oo on oo.k = cf.k and (oo.hard or oo.optout_at is null or oo.optout_at >= cf.last_visit)
    left join elsewhere e on e.k = cf.k
    left join bk on bk.k = cf.k
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.spend desc), '[]'::jsonb) into out from r;
  return out;
end;
$function$;
