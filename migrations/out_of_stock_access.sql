-- Out of Stock access: coordinators and up (Kate, 23 Nov 2026: "salon coordinators and ate Belle pataas, kasama level 5, kasama level 4").
--
-- STATUS: APPLIED on 23 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_access), on Kate's word ("push").
-- Checked after: anon and authenticated cannot run spend_plan_core; oos_plan, oos_access and oos_on_order refuse anon; spend_plan is unchanged.
--
-- LEVELS in the database are the OLD numbers: 1 staff, 2 coordinators and leadership, 3 executives, 4 accounts, 5 Kate. Out of Stock opens
-- from old Level 2 up, so kb_level() >= 2. (People see the new numbers: 3 Leadership, 4 Executives and Marketing, 5 Accounts and Admin, 6 Kate.)
--
-- Why not just give coordinators spend_access(): that gate also opens the Weekly Product Plan, with its price lists, list file paths and edit log.
-- Out of Stock needs only the products, Priority, Type, Min, Max, cost, shelf count, brand and supplier, so it gets its own gate and its own
-- function that returns only those.
--
-- 1. oos_access()    who may open Out of Stock: old Level 2 and up, or anyone spend_access() already lets in (a spend_viewers row).
-- 2. spend_plan_core() a copy of spend_plan() WITHOUT its gate, built from spend_plan's live definition so the rules stay identical (Priority,
--                    Min, Max, shelf, supplier). Nobody can run it: it is revoked from every role and only oos_plan() calls it.
--                    spend_plan() itself is NOT touched. If spend_plan() is ever changed, run this migration's step 2 again to refresh the copy.
-- 3. oos_plan()      gated by oos_access(); returns only the rows the page needs, in the same positions as spend_plan's rows (the fields it does
--                    not need are null: units per month, flag, the price before, the list price, match status, price tag) plus stock_asof.
--                    No edit log, no price lists, no file paths.
-- 4. oos_on_order()  the same on-order function as before, now behind oos_access().
--
-- Read only. It changes no data and no table.

create or replace function public.oos_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('view',
    coalesce(public.kb_level(), 0) >= 2 or coalesce((public.spend_access() ->> 'view')::boolean, false))
$$;
revoke all on function public.oos_access() from public, anon;
grant execute on function public.oos_access() to authenticated;

-- step 2: the gate-less copy of spend_plan, generated from its live definition
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.spend_plan(date,date,bigint)'::regprocedure);
  d := replace(d, 'FUNCTION public.spend_plan(', 'FUNCTION public.spend_plan_core(');
  d := replace(d, 'if not coalesce((a->>''view'')::boolean, false) then return jsonb_build_object(''denied'', true); end if;', '');
  if position('spend_plan_core' in d) = 0 or position('''denied''' in d) > 0 then
    raise exception 'spend_plan_core: the live spend_plan definition did not have the expected shape, nothing was created';
  end if;
  execute d;
end
$mig$;
revoke all on function public.spend_plan_core(date, date, bigint) from public, anon, authenticated;

create or replace function public.oos_plan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare res jsonb;
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  res := public.spend_plan_core(null, null, null);
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_array(r -> 0, r -> 1, r -> 2, r -> 3, r -> 4, null, null, r -> 7, r -> 8, r -> 9, r -> 10, null, null, r -> 13, null, null, r -> 16, r -> 17))
                      from jsonb_array_elements(res -> 'rows') r), '[]'::jsonb),
    'stock_asof', res -> 'stock_asof');
end $$;
revoke all on function public.oos_plan() from public, anon;
grant execute on function public.oos_plan() to authenticated;

create or replace function public.oos_on_order()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Dubai')::date;
  res   jsonb;
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;

  select jsonb_build_object(
    'days', 60,
    'loaded', max(l.loaded_at),
    'rows', coalesce(jsonb_agg(jsonb_build_array(l.branch, nullif(left(l.barcode, 12), ''), l.product, l.count, l.order_no, to_char(l.order_date, 'YYYY-MM-DD'))
                               order by l.branch, l.product, l.order_date, l.order_no), '[]'::jsonb)
  ) into res
  from public.stock_order_lines l
  where l.branch in ('KCA', 'SAA', 'MC', 'AQ')
    and l.status = 'not_arrived'
    and l.arrived_date is null
    and l.order_date >= today - 60
    and coalesce(l.count, 0) > 0;

  return coalesce(res, jsonb_build_object('days', 60, 'loaded', null, 'rows', '[]'::jsonb));
end $$;
revoke all on function public.oos_on_order() from public, anon;
grant execute on function public.oos_on_order() to authenticated;
