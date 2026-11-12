-- STOCK COST (Kate, 12 Nov 2026): the "Stock Cost 2026" Excel (one tab per UAE salon, stock spend against income, 10% max to spend) as a page
-- that fills itself.
--   Income   Phorest, ex VAT: financial_totals services + courses + products, every day.
--   Stock    Phorest stock orders that ARRIVED, at the Stock List cost, by arrival month (stock_order_lines): Hair Retail, Hair Professional,
--            Beauty Retail, Beauty Professional. Lines with no Stock List price are not counted; the page says how many.
--   Consumables  not in Phorest. Accounts' monthly P&L, the line "Total for Consumables", per salon: stock_cost_consumables (rows, loaded by
--            scripts/spend/load_pnl_consumables.py; the figures are data behind RLS, nothing in this public repo holds a figure).
--   Max to spend  one % per salon (all four start at the Excel's 10%), changed by Kate only, every change kept in an append-only log.
--
-- Access: view = Level 2 and up in the database's numbers (the salon coordinators, leadership, executives, accounts, Kate; shown on screen as
-- Level 3 and up); edit the max = Level 5 (Kate). The tables are closed to the browser; the functions below are the only way in.

create table if not exists public.stock_cost_caps (
  branch     text primary key check (branch in ('SAA','KCA','MC','AQ')),
  cap        numeric(5,2) not null check (cap > 0 and cap < 100),
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into public.stock_cost_caps (branch, cap) values ('SAA', 10), ('KCA', 10), ('MC', 10), ('AQ', 10) on conflict (branch) do nothing;

create table if not exists public.stock_cost_cap_log (
  id           bigserial primary key,
  branch       text not null,
  old_cap      numeric(5,2),
  new_cap      numeric(5,2) not null,
  changed_by   text not null,
  changed_name text,
  changed_at   timestamptz not null default now()
);

create or replace function public.stock_cost_log_lock() returns trigger language plpgsql as $$
begin
  raise exception 'the max to spend log cannot be changed or deleted';
end $$;
drop trigger if exists stock_cost_cap_log_no_change on public.stock_cost_cap_log;
create trigger stock_cost_cap_log_no_change before update or delete on public.stock_cost_cap_log
  for each row execute function public.stock_cost_log_lock();
drop trigger if exists stock_cost_cap_log_no_truncate on public.stock_cost_cap_log;
create trigger stock_cost_cap_log_no_truncate before truncate on public.stock_cost_cap_log
  for each statement execute function public.stock_cost_log_lock();

-- Accounts' P&L, "Total for Consumables", one row per salon per month (the first day of the month).
create table if not exists public.stock_cost_consumables (
  branch    text not null check (branch in ('SAA','KCA','MC','AQ')),
  month     date not null check (month = date_trunc('month', month)::date),
  amount    numeric(12,2) not null,
  source    text not null default 'P&L',
  loaded_at timestamptz not null default now(),
  primary key (branch, month)
);

do $$
declare t text;
begin
  foreach t in array array['stock_cost_caps','stock_cost_cap_log','stock_cost_consumables'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.stock_cost_cap_log_id_seq from public, anon, authenticated;

-- Who is asking: {view, edit}.
create or replace function public.stock_cost_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('view', coalesce(public.kb_level(), 0) >= 2, 'edit', coalesce(public.kb_level(), 0) >= 5)
$$;
revoke all on function public.stock_cost_access() from public, anon;
grant execute on function public.stock_cost_access() to authenticated;

-- The page, one year, one call. branches.<code> = twelve rows (January to December), each
--   [days with income, services + courses, products, hair retail, hair professional, beauty retail, beauty professional, consumables or null, lines with no price]
-- Services and products are net of VAT. A month with no income days has days = 0. Consumables is null where the P&L has not loaded the month.
create or replace function public.stock_cost_report(p_year int default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a  jsonb := public.stock_cost_access();
  y  int   := coalesce(p_year, extract(year from current_date)::int);
  d0 date;
  d1 date;
begin
  if not coalesce((a->>'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if y < 2024 or y > 2100 then raise exception 'bad year'; end if;
  d0 := make_date(y, 1, 1); d1 := make_date(y + 1, 1, 1);
  return jsonb_build_object(
    'access', a,
    'year', y,
    'asof', (select max(date) from public.financial_totals where branch in ('SAA','KCA','MC','AQ')),
    'branches', (
      with bs(b) as (values ('SAA'), ('KCA'), ('MC'), ('AQ')),
      ms(m) as (select generate_series(1, 12)),
      inc as (
        select branch b, extract(month from date)::int m, count(*) d,
               sum(services_net + courses_net) svc, sum(products_net) prod
          from public.financial_totals
         where date >= d0 and date < d1 and branch in ('SAA','KCA','MC','AQ')
         group by 1, 2),
      stk as (
        select branch b, extract(month from arrived_date)::int m,
               sum(spend) filter (where coalesce(dept, 'Hair') = 'Hair'   and type = 'retail')       h_r,
               sum(spend) filter (where coalesce(dept, 'Hair') = 'Hair'   and type = 'professional') h_p,
               sum(spend) filter (where coalesce(dept, 'Hair') = 'Beauty' and type = 'retail')       b_r,
               sum(spend) filter (where coalesce(dept, 'Hair') = 'Beauty' and type = 'professional') b_p,
               count(*) filter (where type = 'unmatched') un
          from public.stock_order_lines
         where status = 'arrived' and arrived_date >= d0 and arrived_date < d1 and branch in ('SAA','KCA','MC','AQ')
         group by 1, 2),
      con as (
        select branch b, extract(month from month)::int m, amount
          from public.stock_cost_consumables where month >= d0 and month < d1),
      g as (
        select bs.b, ms.m,
               jsonb_build_array(coalesce(inc.d, 0), round(coalesce(inc.svc, 0), 2), round(coalesce(inc.prod, 0), 2),
                                 round(coalesce(stk.h_r, 0), 2), round(coalesce(stk.h_p, 0), 2), round(coalesce(stk.b_r, 0), 2), round(coalesce(stk.b_p, 0), 2),
                                 case when con.amount is null then null else round(con.amount, 2) end, coalesce(stk.un, 0)) r
          from bs cross join ms
          left join inc on inc.b = bs.b and inc.m = ms.m
          left join stk on stk.b = bs.b and stk.m = ms.m
          left join con on con.b = bs.b and con.m = ms.m)
      select jsonb_object_agg(b, rows) from (select b, jsonb_agg(r order by m) rows from g group by b) z),
    'caps', (select coalesce(jsonb_object_agg(branch, cap), '{}'::jsonb) from public.stock_cost_caps),
    'cap_log', (select coalesce(jsonb_object_agg(branch, jsonb_build_object('by', changed_name, 'from', old_cap, 'to', new_cap, 'at', changed_at)), '{}'::jsonb)
                  from (select distinct on (branch) * from public.stock_cost_cap_log order by branch, id desc) l)
  );
end $$;
revoke all on function public.stock_cost_report(int) from public, anon;
grant execute on function public.stock_cost_report(int) to authenticated;

-- Change one salon's max to spend (Level 5 only). Logged for good.
create or replace function public.stock_cost_cap_set(p_branch text, p_cap numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a   jsonb := public.stock_cost_access();
  who text  := coalesce(public.kb_me_email(), '?');
  nm  text  := coalesce((select d.name from public.dashboard_users d where lower(d.email) = public.kb_me_email() limit 1), public.kb_me_email(), '?');
  b   text  := upper(coalesce(p_branch, ''));
  old numeric;
begin
  if not coalesce((a->>'edit')::boolean, false) then raise exception 'no edit access'; end if;
  if b not in ('SAA','KCA','MC','AQ') then raise exception 'bad salon'; end if;
  if p_cap is null or p_cap <= 0 or p_cap >= 100 then raise exception 'the max to spend is a percentage between 0 and 100'; end if;
  select cap into old from public.stock_cost_caps where branch = b;
  if old is not distinct from round(p_cap, 2) then return jsonb_build_object('ok', true, 'same', true); end if;
  insert into public.stock_cost_caps (branch, cap, updated_by) values (b, round(p_cap, 2), who)
    on conflict (branch) do update set cap = excluded.cap, updated_by = excluded.updated_by, updated_at = now();
  insert into public.stock_cost_cap_log (branch, old_cap, new_cap, changed_by, changed_name) values (b, old, round(p_cap, 2), who, nm);
  return jsonb_build_object('ok', true, 'by', nm, 'at', now(), 'from', old, 'to', round(p_cap, 2));
end $$;
revoke all on function public.stock_cost_cap_set(text, numeric) from public, anon;
grant execute on function public.stock_cost_cap_set(text, numeric) to authenticated;

-- Accounts' P&L Consumables, loaded by scripts/spend/load_pnl_consumables.py with the Phorest pushers' pass (push_passes), like spend_import().
-- p_rows: [{month:'2026-10-01', branch:'KCA', amount:1234.56}]. A month already loaded is replaced for the salons in the rows.
create or replace function public.stock_cost_cons_import(p_pass uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  insert into stock_cost_consumables (branch, month, amount, source)
    select r->>'branch', (r->>'month')::date, (r->>'amount')::numeric, 'P&L'
      from jsonb_array_elements(p_rows) r
    on conflict (branch, month) do update set amount = excluded.amount, loaded_at = now();
  get diagnostics n = row_count;
  return jsonb_build_object('rows', n);
end $$;
revoke all on function public.stock_cost_cons_import(uuid, jsonb) from public;
grant execute on function public.stock_cost_cons_import(uuid, jsonb) to anon;
