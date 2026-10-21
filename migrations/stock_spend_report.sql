-- Stock and Supplier Spend (Kate, 21 Oct 2026): what every supplier invoiced, with the products received
-- under it, sorted into the five categories (Hair Retail, Hair Professional, Beauty Retail, Beauty
-- Professional, Consumables), and each branch, category and supplier read against its cap.
--
-- One source for every number: what suppliers invoiced, from Accounts' three Supplier Balance files
-- (spend_invoiced, loaded by scripts/spend/load_supplier_months.py). An invoice has no category, so the page
-- splits a supplier's amount by the products Phorest received under it (stock_order_lines). Income for the
-- percentages is the dashboard's own: phorest_staff_daily, the daily TOTAL line, ex VAT.
--
-- Nothing here answers to the public key. Every table is locked (RLS on, no policies, no grants) and the
-- page reads and writes through the functions below, which check the signed-in person:
--   Level 4 and up (Accounts & Admin, Kate) may open the page and change tags and caps.
--   spend_viewers adds named people below Level 4 (view only, or view and edit).
-- Who is in spend_viewers, the supplier tags and the brand-to-supplier links are data, not code, and are
-- kept out of this public repo (set with plain SQL).

create or replace function public.spend_cats() returns text[] language sql immutable as $$
  select array['Hair Retail','Hair Professional','Beauty Retail','Beauty Professional','Consumables','Not sorted','Outside the 5']
$$;

-- Supplier x branch x month, as Accounts invoiced it. A supplier with no spend still has a row in spend_supplier.
create table if not exists public.spend_invoiced (
  month     date not null,
  supplier  text not null,
  branch    text not null check (branch in ('SAA','KCA','MC','AQ')),
  amount    numeric(12,2) not null check (amount >= 0),
  loaded_at timestamptz not null default now(),
  primary key (month, supplier, branch)
);

-- Every supplier on Accounts' sheets, and the category an invoice from it is filed under when the supplier
-- has no products in Phorest (Euro coffee, H2O water, the accountants). Suppliers with products are split by
-- what they delivered instead.
create table if not exists public.spend_supplier (
  name       text primary key,
  cat        text not null default 'Not sorted' check (cat = any (public.spend_cats())),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Phorest's stock orders carry a brand, never a supplier: this says which supplier a brand is bought from.
create table if not exists public.spend_brand_supplier (
  brand      text primary key,
  supplier   text not null references public.spend_supplier(name) on update cascade on delete cascade,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- A product whose category is not what its department and type say (the default is Hair or Beauty, then
-- Retail or Professional, from stock_order_lines).
create table if not exists public.spend_product_cat (
  brand      text not null,
  product    text not null,
  cat        text not null check (cat = any (public.spend_cats())),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (brand, product)
);

-- kind salon: key = branch code, value = % of net income (10 when none is set).
-- kind cat:   key = category,    value = % of net income.
-- kind sup:   key = supplier,    value = AED a month.
create table if not exists public.spend_caps (
  kind       text not null check (kind in ('salon','cat','sup')),
  key        text not null,
  value      numeric not null check (value >= 0),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);

create table if not exists public.spend_viewers (
  email    text primary key,
  can_edit boolean not null default false
);

do $$
declare t text;
begin
  foreach t in array array['spend_invoiced','spend_supplier','spend_brand_supplier','spend_product_cat','spend_caps','spend_viewers']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Who is asking: {view, edit}.
create or replace function public.spend_access() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when coalesce(public.kb_level(), 0) >= 4 then jsonb_build_object('view', true, 'edit', true)
    else coalesce((select jsonb_build_object('view', true, 'edit', v.can_edit)
                     from public.spend_viewers v where v.email = public.kb_me_email()),
                  jsonb_build_object('view', false, 'edit', false))
  end
$$;
revoke all on function public.spend_access() from public, anon;
grant execute on function public.spend_access() to authenticated;

-- The page, one month, one call. p_month null = the newest finished month Accounts' files have loaded (else the newest).
-- products: [brand, product, type, dept, SAA, KCA, MC, AQ, units] arrived in the month, at the Stock List cost of the
-- day they were priced (as the Products page does); lines with no cost are left out.
create or replace function public.spend_report(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a  jsonb := public.spend_access();
  m0 date;
  m1 date;
begin
  if not coalesce((a->>'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  -- No month asked for: the newest month that is over (a month still running compares lumpy invoices with half a month of income).
  m0 := date_trunc('month', coalesce(p_month,
          (select max(month) from public.spend_invoiced where month < date_trunc('month', current_date)),
          (select max(month) from public.spend_invoiced), current_date))::date;
  m1 := (m0 + interval '1 month')::date;
  return jsonb_build_object(
    'access', a,
    'month', m0,
    'partial', m0 = date_trunc('month', current_date)::date,
    'months', coalesce((select jsonb_agg(m order by m desc) from (select distinct month m from public.spend_invoiced) x), '[]'::jsonb),
    'invoiced_loaded', (select max(loaded_at) from public.spend_invoiced where month = m0),
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('n', name, 'cat', cat) order by name) from public.spend_supplier), '[]'::jsonb),
    'invoiced', coalesce((select jsonb_agg(jsonb_build_object('s', supplier, 'b', branch, 'v', amount)) from public.spend_invoiced where month = m0), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_array(brand, product, type, dept, saa, kca, mc, aq, units))
        from (select coalesce(brand, '') brand, product, type, dept,
                     round(coalesce(sum(spend) filter (where branch = 'SAA'), 0)) saa,
                     round(coalesce(sum(spend) filter (where branch = 'KCA'), 0)) kca,
                     round(coalesce(sum(spend) filter (where branch = 'MC'), 0)) mc,
                     round(coalesce(sum(spend) filter (where branch = 'AQ'), 0)) aq,
                     round(sum(count)) units
                from public.stock_order_lines
               where status = 'arrived' and type <> 'unmatched' and spend is not null
                 and branch in ('SAA','KCA','MC','AQ') and arrived_date >= m0 and arrived_date < m1
               group by 1, 2, 3, 4) p), '[]'::jsonb),
    'brandsup', coalesce((select jsonb_object_agg(brand, supplier) from public.spend_brand_supplier), '{}'::jsonb),
    'prodcat', coalesce((select jsonb_agg(jsonb_build_array(brand, product, cat)) from public.spend_product_cat), '[]'::jsonb),
    'caps', coalesce((select jsonb_agg(jsonb_build_array(kind, key, value)) from public.spend_caps), '[]'::jsonb),
    'income', coalesce((select jsonb_object_agg(branch, inc) from (
        select branch, round(sum(total_ex_vat)) inc from public.phorest_staff_daily
         where is_total and branch in ('SAA','KCA','MC','AQ') and date >= m0 and date < m1 group by 1) i), '{}'::jsonb),
    'income_through', (select max(date) from public.phorest_staff_daily where is_total and date >= m0 and date < m1),
    'orders_through', (select max(arrived_date) from public.stock_order_lines where status = 'arrived' and arrived_date >= m0 and arrived_date < m1),
    'priced_on', (select max(priced_on) from public.stock_order_lines)
  );
end $$;
revoke all on function public.spend_report(date) from public, anon;
grant execute on function public.spend_report(date) to authenticated;

-- One change from the page. p_val null (or '') clears it where a clearing means something.
--   supcat    p_key supplier           p_val category
--   brandsup  p_key brand              p_val supplier ('Unassigned' removes the link)
--   prodcat   p_key brand E'\n' product  p_val category (null puts it back to the default)
--   cap       p_key 'salon|SAA' / 'cat|Hair Retail' / 'sup|DBD'   p_val number (null removes it)
create or replace function public.spend_set(p_kind text, p_key text, p_val text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a    jsonb := public.spend_access();
  who  text := coalesce(public.kb_me_email(), '?');
  v    text := nullif(btrim(coalesce(p_val, '')), '');
  nl   int;
  ck   text;
  cn   numeric;
begin
  if not coalesce((a->>'edit')::boolean, false) then raise exception 'no edit access'; end if;
  if p_kind = 'supcat' then
    if v is null or not (v = any (public.spend_cats())) then raise exception 'unknown category'; end if;
    update public.spend_supplier set cat = v, updated_by = who, updated_at = now() where name = p_key;
    if not found then raise exception 'unknown supplier'; end if;
  elsif p_kind = 'brandsup' then
    if v is null or v = 'Unassigned' then
      delete from public.spend_brand_supplier where brand = p_key;
    else
      if not exists (select 1 from public.spend_supplier where name = v) then raise exception 'unknown supplier'; end if;
      insert into public.spend_brand_supplier (brand, supplier, updated_by) values (p_key, v, who)
        on conflict (brand) do update set supplier = excluded.supplier, updated_by = excluded.updated_by, updated_at = now();
    end if;
  elsif p_kind = 'prodcat' then
    nl := position(E'\n' in p_key);
    if nl = 0 then raise exception 'bad key'; end if;
    if v is null then
      delete from public.spend_product_cat where brand = left(p_key, nl - 1) and product = substr(p_key, nl + 1);
    else
      if not (v = any (public.spend_cats())) then raise exception 'unknown category'; end if;
      insert into public.spend_product_cat (brand, product, cat, updated_by) values (left(p_key, nl - 1), substr(p_key, nl + 1), v, who)
        on conflict (brand, product) do update set cat = excluded.cat, updated_by = excluded.updated_by, updated_at = now();
    end if;
  elsif p_kind = 'cap' then
    ck := split_part(p_key, '|', 1);
    if ck not in ('salon','cat','sup') then raise exception 'bad cap'; end if;
    if v is null then
      delete from public.spend_caps where kind = ck and key = substr(p_key, length(ck) + 2);
    else
      cn := v::numeric;
      if cn < 0 then raise exception 'a cap cannot be negative'; end if;
      insert into public.spend_caps (kind, key, value, updated_by) values (ck, substr(p_key, length(ck) + 2), cn, who)
        on conflict (kind, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
    end if;
  else
    raise exception 'unknown change';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.spend_set(text, text, text) from public, anon;
grant execute on function public.spend_set(text, text, text) to authenticated;

-- Accounts' files in. Same pass as the Phorest pushers (push_passes). Replaces every month named in p_rows
-- ([{month:'2026-09-01', supplier:'DBD', branch:'KCA', amount:24897.0}]) and makes sure each supplier in
-- p_suppliers exists (new ones start as Not sorted; a supplier already tagged keeps its tag).
create or replace function public.spend_import(p_pass uuid, p_rows jsonb, p_suppliers text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int := 0; s int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  insert into spend_supplier (name)
    select distinct x from (select unnest(p_suppliers) x union select r->>'supplier' from jsonb_array_elements(p_rows) r) y
     where x is not null and btrim(x) <> '' on conflict (name) do nothing;
  get diagnostics s = row_count;
  delete from spend_invoiced where month in (select distinct (r->>'month')::date from jsonb_array_elements(p_rows) r);
  insert into spend_invoiced (month, supplier, branch, amount)
    select (r->>'month')::date, r->>'supplier', r->>'branch', (r->>'amount')::numeric
      from jsonb_array_elements(p_rows) r where (r->>'amount')::numeric > 0;
  get diagnostics n = row_count;
  return jsonb_build_object('rows', n, 'new_suppliers', s);
end $$;
revoke all on function public.spend_import(uuid, jsonb, text[]) from public;
grant execute on function public.spend_import(uuid, jsonb, text[]) to anon;
