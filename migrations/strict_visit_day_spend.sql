-- Kate, 27 Oct 2026: a visit needs real spend. Ate Belle's reports do not count redo (AED 0 to the client) or an
-- AED 0 service (a consultation only, the 8 Step Hair Plan placeholder with a deposit on the sale).
--
--   A client-day counts when (1) a sale has an entry in Payment Type and a line that is not a deposit, balance
--   payment or voucher and not rung to BUSINESS TRS (the rule of door_clients_payment_entry.sql), AND (2) the
--   client's lines for that day, those same real lines, add up to more than AED 0 (refunds count against it).
--
--   sales_transaction_lines.day_spend_ok   true when (2) holds for the line's branch, date and client. Kept by the
--                                          trigger stl_day_spend_ins after every insert (range of the batch) and by
--                                          stl_day_spend_refresh(from, to) for a manual rebuild.
--   Every function, view and materialized view that had the payment-entry window now also needs day_spend_ok:
--   door_clients, door_clients_daily, door_first_visits, door_request_days, oty_refresh, top_clients,
--   top_clients_board, get_top_clients, client_mix_cards, client_mix_detail, service_rankings, lv_lines (and
--   lv_client_all, lv_client_branch), lost_clients*, lost_consults, lost_lists_refresh, lost_client_facts_live,
--   lost_campaign_money, perf_clients, org_pulse_extra and the drill_* lists. drill_door_clients keeps the AED 0 rows,
--   flagged z = true, and returns total (counted) and zero (not counted) so the pop table can list them.
--
-- Effect, 2026: KCA 8,567 to 8,407, SAA 8,948 to 8,887, MC 2,787 to 2,754, AQ 2,148 to 2,131; 17-23 Oct AQ 57,
-- KCA 195 (Ate Christa 206), MC 67, SAA 210. Dropped items: New Client Consultation, 8 Step Hair Plan, redo
-- (toners, pedicures, manicures at AED 0) and refund-only days.
--
-- This file is the record of what was run live in four steps (a backup of all old definitions sits in
-- _defs_backup_27oct, owner only). The function and matview rewrites were done by a DO block that wrapped every
-- "bool_or(nullif(trim(X.payment_raw), '') is not null) over (partition by X.branch, X.date, X.sale_id)" in
-- "(... and X.day_spend_ok)"; to re-apply after restoring an old definition, run that rewrite again.

alter table public.sales_transaction_lines add column if not exists day_spend_ok boolean not null default true;

create or replace function public.stl_day_spend_refresh(p_from date, p_to date)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with k as materialized (
    select ik, public.stl_item_kind(ik) as kind
    from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines where date between p_from and p_to) d
  ), d as (
    select l.branch, l.date, lower(regexp_replace(trim(l.client_name), '\s+', ' ', 'g')) as cn,
           coalesce(sum(case when k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M'
                             then coalesce(l.net, 0) else 0 end), 0) > 0 as ok
    from public.sales_transaction_lines l join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to and nullif(trim(l.client_name), '') is not null
    group by 1, 2, 3
  )
  update public.sales_transaction_lines t set day_spend_ok = d.ok
  from d
  where t.date between p_from and p_to and t.branch = d.branch and t.date = d.date
    and lower(regexp_replace(trim(t.client_name), '\s+', ' ', 'g')) = d.cn
    and t.day_spend_ok is distinct from d.ok;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.stl_day_spend_refresh(date, date) from public, anon, authenticated;

create or replace function public.stl_day_spend_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare lo date; hi date;
begin
  select min(date), max(date) into lo, hi from new_rows;
  if lo is not null then perform public.stl_day_spend_refresh(lo, hi); end if;
  return null;
end $$;
drop trigger if exists stl_day_spend_ins on public.sales_transaction_lines;
create trigger stl_day_spend_ins after insert on public.sales_transaction_lines
  referencing new table as new_rows for each statement execute function public.stl_day_spend_after_insert();

-- first fill, one call per year:
-- select y, public.stl_day_spend_refresh(make_date(y,1,1), make_date(y,12,31)) from generate_series(2021, 2026) y;
