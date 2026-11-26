-- Out of Stock: Confirm order, with our own internal order number (Kate, 26 Nov 2026: "put confirm order button ... we must have our own internal order number").
-- Step 1 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md (in the cowork repo). APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_supplier_orders). Checked in a rolled-back run:
-- confirm gives TRS-PO-26-0001, a second confirm returns the same order, cancel works, a new confirm gets the next number. Tables were left empty.
-- (Before it was applied the page said Confirm order is not switched on: it reads oos_orders_get() and treats an error as "not applied yet".)
--
-- One confirm = one order for one supplier and ONE salon (a window that lists several salons confirms one order per salon). Order number: TRS-PO-<YY>-<0001..>, counted per year
-- across all suppliers. It goes into the subject and body of the email to the supplier (step 3), so the supplier's reply, the out-of-stock list and the invoice can be matched back.
--
-- oos_supplier_orders   one row per confirmed order. The lines are COPIED in (key, brand, name, cost, qty) so the order stays as it was confirmed even when the plan moves on.
--                       No policy, no grant: only the functions below touch it.
-- oos_order_counters    the last number used per year.
-- oos_order_confirm()   write gate = spend_access edit (the same people who may type quantities). Refuses a second open order for the same supplier, salon and order day:
--                       it returns the existing one ({exists:true}) so a double click or two people cannot make two numbers.
-- oos_order_cancel()    a confirmed order that has NOT been sent yet can be cancelled (so the order can be changed and confirmed again). The number is never reused.
-- oos_orders_get()      read gate = oos_access(): the orders of the last 45 days, newest first, without the lines (oos_order_lines_get gives them).
-- oos_order_lines_get() the lines of one order.
-- Status for now: confirmed, cancelled. The later steps add sent, oos_reply, oos_confirmed, on_the_way, invoiced.

create table if not exists public.oos_order_counters (
  yr   int primary key,
  last int not null default 0
);
alter table public.oos_order_counters enable row level security;
revoke all on public.oos_order_counters from public, anon, authenticated;

create table if not exists public.oos_supplier_orders (
  id           bigint generated always as identity primary key,
  order_no     text not null unique,
  supplier     text not null check (length(supplier) between 1 and 40),
  branch       text not null check (branch in ('KCA', 'SAA', 'MC', 'AQ')),
  order_day    date not null,
  status       text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'sent', 'oos_reply', 'oos_confirmed', 'on_the_way', 'invoiced')),
  n_lines      int not null,
  n_units      int not null,
  total_aed    numeric not null,
  lines        jsonb not null,
  extras       text,
  confirmed_by text not null,
  confirmed_at timestamptz not null default now(),
  cancelled_by text,
  cancelled_at timestamptz,
  history      jsonb not null default '[]'::jsonb
);
alter table public.oos_supplier_orders enable row level security;
revoke all on public.oos_supplier_orders from public, anon, authenticated;
-- one live order per supplier, salon and order day
create unique index if not exists oos_supplier_orders_one_open on public.oos_supplier_orders (supplier, branch, order_day) where status <> 'cancelled';

create or replace function public.oos_order_confirm(p_supplier text, p_branch text, p_lines jsonb, p_extras text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  dy date := public.oos_order_day(); who text := coalesce(auth.jwt() ->> 'email', 'unknown');
  yy int := (extract(year from (now() at time zone 'Asia/Dubai')))::int; nxt int; no text; ex record; nl int; nu int; tot numeric; new_id bigint;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if p_supplier is null or length(btrim(p_supplier)) = 0 or length(p_supplier) > 40 then raise exception 'supplier missing'; end if;
  if p_branch not in ('KCA', 'SAA', 'MC', 'AQ') then raise exception 'branch must be KCA, SAA, MC or AQ'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'the order has no lines'; end if;
  if jsonb_array_length(p_lines) > 1500 then raise exception 'too many lines'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where coalesce((l ->> 'q')::numeric, 0) <= 0 or (l ->> 'q')::numeric > 100000 or coalesce(l ->> 'name', '') = '') then
    raise exception 'every line needs a name and a quantity above 0';
  end if;

  select o.order_no, o.confirmed_by, o.confirmed_at into ex from public.oos_supplier_orders o
   where o.supplier = p_supplier and o.branch = p_branch and o.order_day = dy and o.status <> 'cancelled';
  if found then return jsonb_build_object('exists', true, 'order_no', ex.order_no, 'by', ex.confirmed_by, 'at', ex.confirmed_at); end if;

  select count(*), coalesce(sum((l ->> 'q')::numeric), 0), coalesce(sum((l ->> 'q')::numeric * coalesce((l ->> 'c')::numeric, 0)), 0)
    into nl, nu, tot from jsonb_array_elements(p_lines) l;
  insert into public.oos_order_counters (yr, last) values (yy, 1)
    on conflict (yr) do update set last = public.oos_order_counters.last + 1 returning last into nxt;
  no := 'TRS-PO-' || lpad((yy % 100)::text, 2, '0') || '-' || lpad(nxt::text, 4, '0');
  insert into public.oos_supplier_orders (order_no, supplier, branch, order_day, n_lines, n_units, total_aed, lines, extras, confirmed_by, history)
  values (no, p_supplier, p_branch, dy, nl, nu::int, round(tot, 2), p_lines, nullif(btrim(coalesce(p_extras, '')), ''), who,
          jsonb_build_array(jsonb_build_object('status', 'confirmed', 'by', who, 'at', now())))
  returning public.oos_supplier_orders.id into new_id;
  return jsonb_build_object('ok', true, 'id', new_id, 'order_no', no, 'n_lines', nl, 'n_units', nu, 'total_aed', round(tot, 2));
end $$;
revoke all on function public.oos_order_confirm(text, text, jsonb, text) from public, anon;
grant execute on function public.oos_order_confirm(text, text, jsonb, text) to authenticated;

create or replace function public.oos_order_cancel(p_order_no text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare who text := coalesce(auth.jwt() ->> 'email', 'unknown'); st text;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  select status into st from public.oos_supplier_orders where order_no = p_order_no;
  if st is null then raise exception 'no such order'; end if;
  if st <> 'confirmed' then return jsonb_build_object('refused', true, 'status', st); end if;   -- once it has been sent to the supplier it cannot be cancelled here
  update public.oos_supplier_orders
     set status = 'cancelled', cancelled_by = who, cancelled_at = now(),
         history = history || jsonb_build_array(jsonb_build_object('status', 'cancelled', 'by', who, 'at', now()))
   where order_no = p_order_no;
  return jsonb_build_object('ok', true, 'order_no', p_order_no);
end $$;
revoke all on function public.oos_order_cancel(text) from public, anon;
grant execute on function public.oos_order_cancel(text) to authenticated;

create or replace function public.oos_orders_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('day', public.oos_order_day(),
    'can_edit', coalesce((public.spend_access() ->> 'edit')::boolean, false),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('order_no', o.order_no, 'supplier', o.supplier, 'branch', o.branch, 'day', o.order_day, 'status', o.status,
                        'n_lines', o.n_lines, 'n_units', o.n_units, 'total_aed', o.total_aed, 'by', o.confirmed_by, 'at', o.confirmed_at) order by o.confirmed_at desc)
                        from public.oos_supplier_orders o where o.confirmed_at > now() - interval '45 days'), '[]'::jsonb));
end $$;
revoke all on function public.oos_orders_get() from public, anon;
grant execute on function public.oos_orders_get() to authenticated;

create or replace function public.oos_order_lines_get(p_order_no text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o record;
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  select * into o from public.oos_supplier_orders where order_no = p_order_no;
  if not found then return jsonb_build_object('missing', true); end if;
  return jsonb_build_object('order_no', o.order_no, 'supplier', o.supplier, 'branch', o.branch, 'status', o.status, 'extras', o.extras, 'lines', o.lines, 'history', o.history);
end $$;
revoke all on function public.oos_order_lines_get(text) from public, anon;
grant execute on function public.oos_order_lines_get(text) to authenticated;
