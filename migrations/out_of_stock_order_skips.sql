-- Out of Stock: a product can be ticked off the order (Kate, 26 Nov 2026: "pwede rin x or check for products para mawala or i include sa order").
-- Builds on out_of_stock_order_edits.sql (APPLIED 26 Nov 2026, migration out_of_stock_order_edits).
--
-- A row in oos_order_edits now holds two separate things for one order day and product:
--   qty   the amount typed in (null = the calculated maximum order is used)
--   skip  true = taken out of the order: it counts as 0 in the totals, and the typed amount is kept in case it is put back
-- A row with no typed amount and skip = false is deleted, so the table only holds what someone changed.
--
-- oos_order_edits_get()  also returns skips: { row_key: true }
-- oos_order_edit_set()   same call as before; a null amount now clears only the amount
-- oos_order_skip_set()   new: p_skip true takes the product out of the order, false puts it back
-- Same gates as before (read: oos_access(); write: spend_access edit).

alter table public.oos_order_edits alter column qty drop not null;
alter table public.oos_order_edits add column if not exists skip boolean not null default false;

create or replace function public.oos_order_edits_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare dy date := public.oos_order_day();
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('day', dy,
    'edits', coalesce((select jsonb_object_agg(e.row_key, e.qty) from public.oos_order_edits e where e.order_day = dy and e.qty is not null), '{}'::jsonb),
    'skips', coalesce((select jsonb_object_agg(e.row_key, true) from public.oos_order_edits e where e.order_day = dy and e.skip), '{}'::jsonb),
    'who',   coalesce((select jsonb_object_agg(e.row_key, e.edited_by) from public.oos_order_edits e where e.order_day = dy), '{}'::jsonb),
    'at',    coalesce((select jsonb_object_agg(e.row_key, e.edited_at) from public.oos_order_edits e where e.order_day = dy), '{}'::jsonb),
    'can_edit', coalesce((public.spend_access() ->> 'edit')::boolean, false));
end $$;
revoke all on function public.oos_order_edits_get() from public, anon;
grant execute on function public.oos_order_edits_get() to authenticated;

create or replace function public.oos_order_edit_set(p_key text, p_qty numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dy date := public.oos_order_day(); who text := coalesce(auth.jwt() ->> 'email', 'unknown');
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if p_key is null or length(p_key) = 0 or length(p_key) > 400 then raise exception 'row key missing'; end if;
  if p_qty is not null and (p_qty < 0 or p_qty > 100000) then raise exception 'amount out of range'; end if;
  insert into public.oos_order_edits (order_day, row_key, qty, skip, edited_by, edited_at) values (dy, p_key, round(p_qty, 2), false, who, now())
  on conflict (order_day, row_key) do update set qty = excluded.qty, edited_by = excluded.edited_by, edited_at = excluded.edited_at;
  delete from public.oos_order_edits where order_day = dy and row_key = p_key and qty is null and not skip;
  return jsonb_build_object('ok', true, 'day', dy);
end $$;
revoke all on function public.oos_order_edit_set(text, numeric) from public, anon;
grant execute on function public.oos_order_edit_set(text, numeric) to authenticated;

create or replace function public.oos_order_skip_set(p_key text, p_skip boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dy date := public.oos_order_day(); who text := coalesce(auth.jwt() ->> 'email', 'unknown');
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if p_key is null or length(p_key) = 0 or length(p_key) > 400 then raise exception 'row key missing'; end if;
  insert into public.oos_order_edits (order_day, row_key, qty, skip, edited_by, edited_at) values (dy, p_key, null, coalesce(p_skip, false), who, now())
  on conflict (order_day, row_key) do update set skip = excluded.skip, edited_by = excluded.edited_by, edited_at = excluded.edited_at;
  delete from public.oos_order_edits where order_day = dy and row_key = p_key and qty is null and not skip;
  return jsonb_build_object('ok', true, 'day', dy);
end $$;
revoke all on function public.oos_order_skip_set(text, boolean) from public, anon;
grant execute on function public.oos_order_skip_set(text, boolean) to authenticated;
