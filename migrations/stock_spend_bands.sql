-- Stock & Supplier Spend, step 2 (Kate, 22 Oct 2026): weekly bands per product family, and a Priority (A or B) on a product.
--
-- From the Khalifa Schwarzkopf template Cristine made (weekly usage and spend band per product): the page now reads what each product
-- family (Vibrance, Igora Royal ...) spends in a week, per branch, as a band taken from the family's own monthly totals (lowest and
-- highest month, as a weekly rate) rather than by adding up each product's band, which overstated it (the product bands add to more than
-- the average week). Professional stock only, as received in Phorest, until the Phorest product usage report is loaded.
-- spend_family() is the draft rule that puts a product in a family (Schwarzkopf by line, any other brand as its own family); a name in
-- spend_product_fam overrides it. spend_product_prio holds the A or B. Weekly caps per family go in spend_caps (kind fam).

create or replace function public.spend_family(p_brand text, p_product text) returns text
language sql immutable as $$
  select case
    when coalesce(p_brand, '') ~* 'schwar' then
      case
        when p_product ~* 'vibrance' then 'Vibrance'
        when p_product ~* 'zero\s*amm' then 'Igora Zero Amm'
        when p_product ~* 'igora\s*color\s*10' then 'Igora Color 10'
        when p_product ~* '^(ir|igora)\M' or p_product ~* 'igora\s*royal' then 'Igora Royal'
        when p_product ~* '^bm\M|blond\s*me|blondme|vario\s*blond|lightener|glow\s*toner|^t[- ]' then 'BlondMe'
        when p_product ~* 'color\s*expert' then 'Color Expert'
        when p_product ~* 'bonacure|^bc\M' then 'BC Bonacure'
        when p_product ~* 'scalp\s*clinix' then 'Scalp Clinix'
        when p_product ~* 'developer|activator|oxidant' then 'Developers'
        else 'Other Schwarzkopf'
      end
    else coalesce(nullif(btrim(regexp_replace(coalesce(p_brand, ''), '\s*\(.*\)\s*$', '')), ''), 'Other')
  end
$$;

create table if not exists public.spend_product_prio (
  brand      text not null,
  product    text not null,
  prio       text not null check (prio in ('A','B')),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (brand, product)
);
create table if not exists public.spend_product_fam (
  brand      text not null,
  product    text not null,
  family     text not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (brand, product)
);
alter table public.spend_product_prio enable row level security;
alter table public.spend_product_fam enable row level security;
revoke all on public.spend_product_prio, public.spend_product_fam from public, anon, authenticated;

alter table public.spend_caps drop constraint if exists spend_caps_kind_check;
alter table public.spend_caps add constraint spend_caps_kind_check check (kind in ('salon','cat','sup','fam'));
-- kind fam: key = 'KCA|Vibrance' or 'ALL|Vibrance', value = AED a week.

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
    'prodprio', coalesce((select jsonb_agg(jsonb_build_array(brand, product, prio)) from public.spend_product_prio), '[]'::jsonb),
    'prodfam', coalesce((select jsonb_agg(jsonb_build_array(brand, product, family)) from public.spend_product_fam), '[]'::jsonb),
    'fam_months', coalesce((
      select jsonb_agg(jsonb_build_array(branch, family, to_char(mo, 'YYYY-MM-DD'), round(spend), round(units)))
        from (select s.branch, coalesce(o.family, public.spend_family(s.brand, s.product)) family, date_trunc('month', s.arrived_date)::date mo,
                     sum(s.spend) spend, sum(s.count) units
                from public.stock_order_lines s
                left join public.spend_product_fam o on o.brand = coalesce(s.brand, '') and o.product = s.product
               where s.status = 'arrived' and s.type = 'professional' and s.spend is not null
                 and s.branch in ('SAA','KCA','MC','AQ')
                 and s.arrived_date >= (m0 - interval '3 months')::date and s.arrived_date < m1
               group by 1, 2, 3) f), '[]'::jsonb),
    'caps', coalesce((select jsonb_agg(jsonb_build_array(kind, key, value)) from public.spend_caps), '[]'::jsonb),
    'income', coalesce((select jsonb_object_agg(branch, inc) from (
        select branch, round(sum(total_ex_vat)) inc from public.phorest_staff_daily
         where is_total and branch in ('SAA','KCA','MC','AQ') and date >= m0 and date < m1 group by 1) i), '{}'::jsonb),
    'income_through', (select max(date) from public.phorest_staff_daily where is_total and date >= m0 and date < m1),
    'orders_through', (select max(arrived_date) from public.stock_order_lines where status = 'arrived' and arrived_date >= m0 and arrived_date < m1),
    'priced_on', (select max(priced_on) from public.stock_order_lines)
  );
end $$;

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
  elsif p_kind = 'prodprio' then
    nl := position(E'\n' in p_key);
    if nl = 0 then raise exception 'bad key'; end if;
    if v is null then
      delete from public.spend_product_prio where brand = left(p_key, nl - 1) and product = substr(p_key, nl + 1);
    else
      if v not in ('A','B') then raise exception 'priority is A or B'; end if;
      insert into public.spend_product_prio (brand, product, prio, updated_by) values (left(p_key, nl - 1), substr(p_key, nl + 1), v, who)
        on conflict (brand, product) do update set prio = excluded.prio, updated_by = excluded.updated_by, updated_at = now();
    end if;
  elsif p_kind = 'prodfam' then
    nl := position(E'\n' in p_key);
    if nl = 0 then raise exception 'bad key'; end if;
    if v is null then
      delete from public.spend_product_fam where brand = left(p_key, nl - 1) and product = substr(p_key, nl + 1);
    else
      insert into public.spend_product_fam (brand, product, family, updated_by) values (left(p_key, nl - 1), substr(p_key, nl + 1), left(v, 60), who)
        on conflict (brand, product) do update set family = excluded.family, updated_by = excluded.updated_by, updated_at = now();
    end if;
  elsif p_kind = 'cap' then
    ck := split_part(p_key, '|', 1);
    if ck not in ('salon','cat','sup','fam') then raise exception 'bad cap'; end if;
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

revoke all on function public.spend_report(date) from public, anon;
grant execute on function public.spend_report(date) to authenticated;
revoke all on function public.spend_set(text, text, text) from public, anon;
grant execute on function public.spend_set(text, text, text) to authenticated;
