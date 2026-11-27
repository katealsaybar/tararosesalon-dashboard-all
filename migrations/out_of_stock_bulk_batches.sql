-- Out of Stock: Order all suppliers keeps its place under a batch reference (Kate, 27 Nov 2026: "dapat siguro may unique reference number, tapos yun na lang ang gagamitin to see where they left off",
-- "everytime na eexit nawawala eh"). Mockup: docs/mockups/out-of-stock.html in the cowork repo.
--
-- One OPEN batch per order day (the Monday the order goes out, see oos_order_day()), shared by everyone who may edit the Weekly Product Plan. It holds:
--   ref        BO-26-0001, a number nobody types: it names the bulk order so the page can say "Continue BO-26-0001".
--   ticks      which suppliers are ticked in the Order all suppliers window: { "DBD": true, "EIDEAL": false }.
--   lock       the quantity each product started at when the numbers were locked: { row_key: qty }. A quantity nobody typed used to be recalculated from the shelf counts on every
--              refresh (about every 30 minutes), so it moved by itself. With a batch open it stays at the locked figure until someone presses Refresh numbers.
--   locked_at  when the numbers were locked.
-- Whether a supplier is Confirmed or Sent is NOT kept here: it is read from the supplier orders (oos_orders_get), which already are the record.
--
-- 1. oos_bulk_batches   no policy, no grant: only the two functions below touch it.
-- 2. oos_bulk_get()     behind oos_access() view: { day, batch: { ref, ticks, lock, locked_at, updated_at, updated_by, created_by } or null }
-- 3. oos_bulk_save()    whoever may edit the Weekly Product Plan (spend_access edit): creates the day's open batch when there is none, saves the ticks and, when a lock is given, the lock;
--                       p_new closes the open batch and starts another; p_done closes it (every supplier sent).
--
-- LEVELS in the database are the OLD numbers (see out_of_stock_access.sql). Nothing else is changed. APPLIED 27 Nov 2026 (Kate said yes), 0 batches at the time.

create sequence if not exists public.oos_bulk_seq;

create table if not exists public.oos_bulk_batches (
  id         bigint generated always as identity primary key,
  ref        text not null unique,
  order_day  date not null,
  state      text not null default 'open' check (state in ('open', 'done')),
  ticks      jsonb not null default '{}'::jsonb,
  lock       jsonb not null default '{}'::jsonb,
  locked_at  timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.oos_bulk_batches enable row level security;
revoke all on public.oos_bulk_batches from public, anon, authenticated;
create index if not exists oos_bulk_batches_day_idx on public.oos_bulk_batches (order_day, state);

create or replace function public.oos_bulk_json(b public.oos_bulk_batches)
returns jsonb language sql immutable set search_path = '' as $$
  select case when b.id is null then null else jsonb_build_object('ref', b.ref, 'ticks', b.ticks, 'lock', b.lock, 'locked_at', b.locked_at,
    'updated_at', b.updated_at, 'updated_by', b.updated_by, 'created_by', b.created_by) end
$$;

create or replace function public.oos_bulk_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare dy date := public.oos_order_day(); b public.oos_bulk_batches;
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  select * into b from public.oos_bulk_batches where order_day = dy and state = 'open' order by id desc limit 1;
  return jsonb_build_object('day', dy, 'batch', public.oos_bulk_json(b));
end $$;
revoke all on function public.oos_bulk_get() from public, anon;
grant execute on function public.oos_bulk_get() to authenticated;

create or replace function public.oos_bulk_save(p_ticks jsonb default null, p_lock jsonb default null, p_new boolean default false, p_done boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dy date := public.oos_order_day(); who text := coalesce(auth.jwt() ->> 'email', 'unknown'); b public.oos_bulk_batches;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if p_ticks is not null and jsonb_typeof(p_ticks) <> 'object' then raise exception 'ticks must be an object'; end if;
  if p_lock is not null and (jsonb_typeof(p_lock) <> 'object' or length(p_lock::text) > 400000) then raise exception 'lock must be an object'; end if;
  if p_new then
    update public.oos_bulk_batches set state = 'done', updated_by = who, updated_at = now() where order_day = dy and state = 'open';
  end if;
  select * into b from public.oos_bulk_batches where order_day = dy and state = 'open' order by id desc limit 1;
  if b.id is null then
    insert into public.oos_bulk_batches (ref, order_day, ticks, lock, created_by, updated_by)
    values ('BO-' || to_char(now() at time zone 'Asia/Dubai', 'YY') || '-' || lpad(nextval('public.oos_bulk_seq')::text, 4, '0'), dy, coalesce(p_ticks, '{}'::jsonb), coalesce(p_lock, '{}'::jsonb), who, who)
    returning * into b;
  else
    update public.oos_bulk_batches set ticks = coalesce(p_ticks, ticks), lock = coalesce(p_lock, lock), locked_at = case when p_lock is not null then now() else locked_at end,
      state = case when p_done then 'done' else state end, updated_by = who, updated_at = now()
    where id = b.id returning * into b;
  end if;
  return jsonb_build_object('ok', true, 'day', dy, 'batch', public.oos_bulk_json(b));
end $$;
revoke all on function public.oos_bulk_save(jsonb, jsonb, boolean, boolean) from public, anon;
grant execute on function public.oos_bulk_save(jsonb, jsonb, boolean, boolean) to authenticated;
