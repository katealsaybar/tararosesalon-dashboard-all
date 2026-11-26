-- Out of Stock: the amount to order can be edited (Kate, 26 Nov 2026: "pwede rin dapat mag edit ng amount to order para yun yung lalabas na oorderin").
--
-- The page works out a Minimum and a Maximum order for every product. The person placing the order can now type the amount that is really going to be
-- ordered; that amount is what the order list, the totals, the supplier table and the downloads show as "Order". It is kept here so everyone sees the same
-- numbers and it survives a reload.
--
-- An edit belongs to one ORDER DAY: the Monday the order goes out (today if it is a Monday, else the next Monday, Dubai time). On the Tuesday after the order the
-- page starts again from the calculated amounts, so last week's typed amounts never leak into the next order.
--
-- 1. oos_order_edits         one row per order day and product (row_key = the plan row key the page already uses). No policy, no grant: only the two functions below touch it.
-- 2. oos_order_edits_get()   behind oos_access() (everyone who can open the page): { day, edits: { row_key: qty }, who: { row_key: editor }, at: { row_key: time } }
-- 3. oos_order_edit_set()    whoever may edit the Weekly Product Plan (spend_access edit: old Level 4 and up, or a spend editor): sets the amount for a product; a null amount puts the calculated amount back.
--
-- LEVELS in the database are the OLD numbers (see out_of_stock_access.sql). Nothing else is changed.

create table if not exists public.oos_order_edits (
  order_day date not null,
  row_key   text not null,
  qty       numeric not null check (qty >= 0 and qty <= 100000),
  edited_by text,
  edited_at timestamptz not null default now(),
  primary key (order_day, row_key)
);
alter table public.oos_order_edits enable row level security;
revoke all on public.oos_order_edits from public, anon, authenticated;

create or replace function public.oos_order_day()
returns date language sql stable set search_path = '' as $$
  select d + ((8 - extract(isodow from d)::int) % 7)
  from (select (now() at time zone 'Asia/Dubai')::date as d) x
$$;
revoke all on function public.oos_order_day() from public, anon;
grant execute on function public.oos_order_day() to authenticated;

create or replace function public.oos_order_edits_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare dy date := public.oos_order_day();
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('day', dy,
    'edits', coalesce((select jsonb_object_agg(e.row_key, e.qty) from public.oos_order_edits e where e.order_day = dy), '{}'::jsonb),
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
  if not (coalesce((public.spend_access() ->> 'edit')::boolean, false)) then
    return jsonb_build_object('denied', true);
  end if;
  if p_key is null or length(p_key) = 0 or length(p_key) > 400 then raise exception 'row key missing'; end if;
  if p_qty is null then
    delete from public.oos_order_edits where order_day = dy and row_key = p_key;
  else
    if p_qty < 0 or p_qty > 100000 then raise exception 'amount out of range'; end if;
    insert into public.oos_order_edits (order_day, row_key, qty, edited_by, edited_at) values (dy, p_key, round(p_qty, 2), who, now())
    on conflict (order_day, row_key) do update set qty = excluded.qty, edited_by = excluded.edited_by, edited_at = excluded.edited_at;
  end if;
  return jsonb_build_object('ok', true, 'day', dy);
end $$;
revoke all on function public.oos_order_edit_set(text, numeric) from public, anon;
grant execute on function public.oos_order_edit_set(text, numeric) to authenticated;
