-- Out of Stock: the shelf count can be counted and verified (Kate, 26 Nov 2026: ate Tine says the stock shown is not always accurate and "need sya i verify lagi";
-- Kate said yes to a Counted box and a Verified tick).
-- Builds on out_of_stock_order_edits.sql and out_of_stock_order_skips.sql (both APPLIED 26 Nov 2026).
--
-- The page shows Phorest's Stock List as it was read once a day. For one order day (the Monday the order goes out) and one product, a person can now:
--   counted   type the number really on the shelf. The page then works the order out from this number instead of Phorest's. Typing a count also verifies the product.
--   verified  tick that the shelf figure was checked (Phorest's figure was right, or the count was typed). Kept with who and when.
-- Same gates as the order edits: read = oos_access(), write = spend_access edit. Nothing in the Phorest data is changed: the count only lives here.
--
-- oos_stock_counts       one row per order day and product; no policy, no grant: only the functions touch it.
-- oos_order_edits_get()  now also returns counts { row_key: counted } and verified { row_key: { by, at } } (everything it returned before is unchanged).
-- oos_count_set()        sets or clears the counted number (a number also ticks verified; a null clears only the count).
-- oos_verify_set()       ticks or unticks verified.

create table if not exists public.oos_stock_counts (
  order_day date not null,
  row_key   text not null,
  counted   numeric check (counted >= 0 and counted <= 100000),
  verified  boolean not null default false,
  by_who    text,
  at        timestamptz not null default now(),
  primary key (order_day, row_key)
);
alter table public.oos_stock_counts enable row level security;
revoke all on public.oos_stock_counts from public, anon, authenticated;

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
    'counts', coalesce((select jsonb_object_agg(c.row_key, c.counted) from public.oos_stock_counts c where c.order_day = dy and c.counted is not null), '{}'::jsonb),
    'verified', coalesce((select jsonb_object_agg(c.row_key, jsonb_build_object('by', c.by_who, 'at', c.at)) from public.oos_stock_counts c where c.order_day = dy and c.verified), '{}'::jsonb),
    'can_edit', coalesce((public.spend_access() ->> 'edit')::boolean, false));
end $$;
revoke all on function public.oos_order_edits_get() from public, anon;
grant execute on function public.oos_order_edits_get() to authenticated;

create or replace function public.oos_count_set(p_key text, p_counted numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dy date := public.oos_order_day(); who text := coalesce(auth.jwt() ->> 'email', 'unknown');
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if p_key is null or length(p_key) = 0 or length(p_key) > 400 then raise exception 'row key missing'; end if;
  if p_counted is not null and (p_counted < 0 or p_counted > 100000) then raise exception 'count out of range'; end if;
  insert into public.oos_stock_counts (order_day, row_key, counted, verified, by_who, at) values (dy, p_key, round(p_counted, 2), p_counted is not null, who, now())
  on conflict (order_day, row_key) do update set counted = excluded.counted,
    verified = case when excluded.counted is not null then true else public.oos_stock_counts.verified end,
    by_who = case when excluded.counted is not null then excluded.by_who else public.oos_stock_counts.by_who end,
    at = case when excluded.counted is not null then excluded.at else public.oos_stock_counts.at end;
  delete from public.oos_stock_counts where order_day = dy and row_key = p_key and counted is null and not verified;
  return jsonb_build_object('ok', true, 'day', dy);
end $$;
revoke all on function public.oos_count_set(text, numeric) from public, anon;
grant execute on function public.oos_count_set(text, numeric) to authenticated;

create or replace function public.oos_verify_set(p_key text, p_verified boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dy date := public.oos_order_day(); who text := coalesce(auth.jwt() ->> 'email', 'unknown');
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if p_key is null or length(p_key) = 0 or length(p_key) > 400 then raise exception 'row key missing'; end if;
  insert into public.oos_stock_counts (order_day, row_key, counted, verified, by_who, at) values (dy, p_key, null, coalesce(p_verified, false), who, now())
  on conflict (order_day, row_key) do update set verified = excluded.verified, by_who = excluded.by_who, at = excluded.at;
  delete from public.oos_stock_counts where order_day = dy and row_key = p_key and counted is null and not verified;
  return jsonb_build_object('ok', true, 'day', dy);
end $$;
revoke all on function public.oos_verify_set(text, boolean) from public, anon;
grant execute on function public.oos_verify_set(text, boolean) to authenticated;
