-- WEEKLY PRODUCT PLAN (Kate, 12 Nov 2026): the Stock & Supplier Spend page is now ate Tine's Weekly Product Plan sheet.
-- One row per product per salon, built from Phorest (Stock List + Product Usage), with the plan columns (category, product, type,
-- priority, min, max) saved here as overrides and every change written to an append-only log.
--
-- This file is generic on purpose. Which brands and categories are in the plan lives in plan_scope (data, set by SQL, not here), and the
-- saved edits, the edit log and the price lists are rows behind RLS. Nothing in this file names a supplier, a brand or a price.
--
-- Access = spend_access() (Level 4 and up, or a spend_viewers row; edit = Level 4 and up or can_edit). Tables are closed to the browser,
-- the functions below are the only way in.

create table if not exists public.plan_scope (
  kind  text not null check (kind in ('brand','cat')),
  pat   text not null,        -- brand: a lower-case regex matched on the brand; cat: the Phorest category (compared in upper case)
  label text,                 -- cat only: the name the sheet shows
  primary key (kind, pat)
);

create table if not exists public.plan_settings (
  key   text primary key,
  value text not null
);
insert into public.plan_settings (key, value) values
  ('minmax_from', '2026-05-01'), ('minmax_to', '2026-09-30'),   -- the usage window the starting Min and Max come from (ate Tine's 153 days)
  ('prio_from',   '2026-07-01'), ('prio_to',   '2026-12-31')    -- the spend window Priority A and B come from (to the last day of usage loaded)
on conflict (key) do nothing;

-- The saved plan edits: one row per product per field. A cleared cell has no row (it goes back to the Phorest value or the starting value).
create table if not exists public.plan_overrides (
  row_key    text not null,
  field      text not null check (field in ('cat','name','type','prio','min','max')),
  value      text not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (row_key, field)
);

-- Every edit, never changed, never deleted.
create table if not exists public.plan_edit_log (
  id          bigserial primary key,
  row_key     text not null,
  branch      text,
  product     text,
  field       text not null,
  old_value   text,
  new_value   text,
  edited_by   text not null,
  edited_name text,
  edited_at   timestamptz not null default now()
);
create index if not exists plan_edit_log_key on public.plan_edit_log (row_key, field, id desc);

create or replace function public.plan_edit_log_lock() returns trigger language plpgsql as $$
begin
  raise exception 'the edit log cannot be changed or deleted';
end $$;
drop trigger if exists plan_edit_log_no_change on public.plan_edit_log;
create trigger plan_edit_log_no_change before update or delete on public.plan_edit_log
  for each row execute function public.plan_edit_log_lock();
drop trigger if exists plan_edit_log_no_truncate on public.plan_edit_log;
create trigger plan_edit_log_no_truncate before truncate on public.plan_edit_log
  for each statement execute function public.plan_edit_log_lock();

-- What an uploaded price list did to each product of the plan (the list itself is price_lists + price_list_items, which stay owner only).
alter table public.price_lists add column if not exists file_path text;   -- the uploaded file, in the private price-lists bucket
create table if not exists public.plan_list_prices (
  id       bigserial primary key,
  list_id  bigint not null references public.price_lists(id),
  row_key  text,                                       -- null for a SKU that is new in the list
  product  text not null,
  cost     numeric,
  status   text not null check (status in ('same','changed','renamed','removed','new','added')),
  new_name text
);
create unique index if not exists plan_list_prices_key on public.plan_list_prices (list_id, row_key) where row_key is not null;

-- SKUs added to the sheet from a price list ("New SKUs, not on the sheet yet").
create table if not exists public.plan_extra_rows (
  id       bigserial primary key,
  row_key  text not null unique,
  branch   text not null,
  brand    text,
  product  text not null,
  category text not null,
  type     text not null default 'p',
  cost     numeric,
  list_id  bigint references public.price_lists(id),
  added_by text not null,
  added_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['plan_scope','plan_settings','plan_overrides','plan_edit_log','plan_list_prices','plan_extra_rows']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.plan_edit_log_id_seq, public.plan_list_prices_id_seq, public.plan_extra_rows_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- The sheet. p_from..p_to is the dashboard's Period (Avg Units / Week = units in the window / days x 7); the window stops at the last
-- day of usage loaded. p_list = the price list to read (null = the one in force today).
-- rows: [row_key, branch, category, product, type p|r, flag, units per month (aligned with months), priority, min, max, unit cost,
--        unit cost in the list before, stock list price, in stock now, match status, price tag, brand]
--   flag 0 = fine, 1 = not on the Stock List now, 2 = the category name and Phorest disagree on professional or retail
create or replace function public.spend_plan(p_from date default null, p_to date default null, p_list bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a        jsonb := public.spend_access();
  today    date  := (now() at time zone 'Asia/Dubai')::date;
  u_first  date; u_last date;
  mm_from  date; mm_to date; pr_from date; pr_to date;
  w_from   date; w_to date;
  lid      bigint;
  res      jsonb;
begin
  if not coalesce((a->>'view')::boolean, false) then return jsonb_build_object('denied', true); end if;

  select min(used_date), max(used_date) into u_first, u_last from public.product_usage_lines where branch in ('SAA','KCA','MC','AQ');
  mm_from := coalesce((select value::date from public.plan_settings where key = 'minmax_from'), date '2026-05-01');
  mm_to   := coalesce((select value::date from public.plan_settings where key = 'minmax_to'),   date '2026-09-30');
  pr_from := coalesce((select value::date from public.plan_settings where key = 'prio_from'),   date '2026-07-01');
  pr_to   := least(coalesce((select value::date from public.plan_settings where key = 'prio_to'), u_last), u_last);
  w_from  := greatest(coalesce(p_from, mm_from), u_first);
  w_to    := least(coalesce(p_to, mm_to), u_last);

  select l.id into lid from public.price_lists l where l.id = p_list;
  if lid is null then
    select l.id into lid from public.price_lists l where l.effective_from <= today order by l.effective_from desc, l.id desc limit 1;
  end if;
  if lid is null then select l.id into lid from public.price_lists l order by l.effective_from, l.id limit 1; end if;

  -- Steps go through temporary tables (analysed) so the planner never guesses one row for a step that has thousands.
  drop table if exists pg_temp.pl_lists, pg_temp.pl_months, pg_temp.pl_la, pg_temp.pl_st, pg_temp.pl_uu, pg_temp.pl_gm, pg_temp.pl_ua,
                       pg_temp.pl_prow, pg_temp.pl_agg, pg_temp.pl_um, pg_temp.pl_plp, pg_temp.pl_pcur, pg_temp.pl_pprv, pg_temp.pl_ptag;

  create temp table pl_lists on commit drop as
    select l.id, l.name, l.effective_from, l.source, l.file_name, l.created_by, l.created_at, l.file_path,
           row_number() over (order by l.effective_from, l.id)::int ord
    from public.price_lists l;
  create temp table pl_months on commit drop as
    select m::date mo, greatest(m::date, w_from) f, least((m + interval '1 month - 1 day')::date, w_to) t
    from generate_series(date_trunc('month', w_from)::date, w_to, interval '1 month') m
    where w_from <= w_to;
  create temp table pl_la on commit drop as
    select x.branch, max(x.as_of) d from public.stock_levels x where x.branch in ('SAA','KCA','MC','AQ') group by x.branch;

  -- the products on the Stock List today (latest snapshot per salon), in the plan's brands and categories
  create temp table pl_st on commit drop as
    with st0 as (
      select s.branch, s.brand, s.product, s.barcode, s.category, coalesce(s.type, s.stock_type) typ, s.cost, s.sale_price, s.in_stock, c.label,
             lower(s.branch || '|' || coalesce(s.brand, '') || '|' || s.product || '|' || coalesce(s.barcode, '')) rk
      from public.stock_levels s
      join pg_temp.pl_la la on la.branch = s.branch and la.d = s.as_of
      join public.plan_scope c on c.kind = 'cat' and upper(btrim(s.category)) = upper(btrim(c.pat))
      where exists (select 1 from public.plan_scope b where b.kind = 'brand' and lower(coalesce(s.brand, '')) ~ b.pat)
    )
    select rk, min(branch) branch, min(brand) brand, min(product) product, min(barcode) barcode, min(category) category, min(typ) typ,
           max(cost) cost, max(sale_price) sale_price, sum(in_stock) in_stock, min(label) label,
           min(coalesce(brand, '')) brand0, upper(btrim(min(category))) ucat
    from st0 group by rk;
  analyze pg_temp.pl_st;

  -- usage by product and month: the window (wu), the Min and Max basis (mu), the Priority basis (ps), anything at all (au)
  create temp table pl_uu on commit drop as
    select u.branch, coalesce(u.list_brand, '') lb, upper(btrim(coalesce(u.list_category, ''))) lc, u.list_product lp, coalesce(u.unit_cost, -1) uc,
           date_trunc('month', u.used_date)::date mo,
           sum(-u.qty) filter (where u.used_date between w_from and w_to)   wu,
           sum(-u.qty) filter (where u.used_date between mm_from and mm_to) mu,
           sum(u.spend) filter (where u.used_date between pr_from and pr_to) ps,
           sum(-u.qty) au, min(u.type) typ, min(c.label) label
    from public.product_usage_lines u
    join public.plan_scope c on c.kind = 'cat' and upper(btrim(u.list_category)) = upper(btrim(c.pat))
    where u.branch in ('SAA','KCA','MC','AQ') and u.qty < 0 and u.list_product is not null
      and exists (select 1 from public.plan_scope b where b.kind = 'brand' and lower(coalesce(u.list_brand, '')) ~ b.pat)
      and u.used_date between least(w_from, mm_from, pr_from) and greatest(w_to, mm_to, pr_to)
    group by 1, 2, 3, 4, 5, 6;
  analyze pg_temp.pl_uu;

  -- each usage product to its Stock List row (same salon, brand, category and name; the closest cost when a name appears twice)
  create temp table pl_gm on commit drop as
    select distinct on (g.branch, g.lb, g.lc, g.lp, g.uc) g.branch, g.lb, g.lc, g.lp, g.uc, s.rk
    from (select distinct branch, lb, lc, lp, uc from pg_temp.pl_uu) g
    left join pg_temp.pl_st s on s.branch = g.branch and s.brand0 = g.lb and s.ucat = g.lc and s.product = g.lp
    order by g.branch, g.lb, g.lc, g.lp, g.uc, abs(coalesce(s.cost, 0) - g.uc), s.rk;
  analyze pg_temp.pl_gm;
  create temp table pl_ua on commit drop as
    select coalesce(gm.rk, lower(u.branch || '|' || u.lb || '|' || u.lp || '|~')) rk, (gm.rk is null) orphan, u.*
    from pg_temp.pl_uu u
    join pg_temp.pl_gm gm on gm.branch = u.branch and gm.lb = u.lb and gm.lc = u.lc and gm.lp = u.lp and gm.uc = u.uc;
  analyze pg_temp.pl_ua;

  create temp table pl_prow on commit drop as
    select s.rk, s.branch, s.brand, s.product, s.label, s.typ, s.cost stock_cost, s.sale_price, s.in_stock, 0 kind from pg_temp.pl_st s
    union all
    select o.rk, o.branch, o.brand, o.product, o.label, o.typ, o.cost, null::numeric, null::numeric, 1
    from (select rk, min(branch) branch, nullif(min(lb), '') brand, min(lp) product, min(label) label, min(typ) typ, nullif(max(uc), -1) cost
          from pg_temp.pl_ua where orphan group by rk) o
    union all
    select x.row_key, x.branch, x.brand, x.product, x.category, x.type, x.cost, null::numeric, null::numeric, 2 from public.plan_extra_rows x;
  create temp table pl_agg on commit drop as select rk, sum(mu) mu, sum(ps) ps, sum(au) au from pg_temp.pl_ua group by rk;
  create temp table pl_um on commit drop as
    select p.rk, jsonb_agg(coalesce(x.wu, 0)::int order by m.mo) units
    from (select distinct rk from pg_temp.pl_ua) p
    cross join pg_temp.pl_months m
    left join (select rk, mo, sum(wu) wu from pg_temp.pl_ua group by rk, mo) x on x.rk = p.rk and x.mo = m.mo
    group by p.rk;
  analyze pg_temp.pl_prow; analyze pg_temp.pl_agg; analyze pg_temp.pl_um;

  -- what each price list says about each product (the first list is the Phorest snapshot, later ones are uploads)
  create temp table pl_plp on commit drop as
    select i.list_id, l.ord, lower(i.branch || '|' || coalesce(i.brand, '') || '|' || i.product || '|' || coalesce(i.barcode, '')) rk, i.cost, null::text status, null::text new_name
    from public.price_list_items i join pg_temp.pl_lists l on l.id = i.list_id where i.branch <> 'ALL'
    union all
    select p.list_id, l.ord, p.row_key, p.cost, p.status, p.new_name
    from public.plan_list_prices p join pg_temp.pl_lists l on l.id = p.list_id where p.row_key is not null;
  analyze pg_temp.pl_plp;
  create temp table pl_pcur on commit drop as
    select distinct on (x.rk) x.rk, x.cost from pg_temp.pl_plp x, pg_temp.pl_lists c
    where c.id = lid and x.ord <= c.ord and x.cost is not null order by x.rk, x.ord desc;
  create temp table pl_pprv on commit drop as
    select distinct on (x.rk) x.rk, x.cost from pg_temp.pl_plp x, pg_temp.pl_lists c, pg_temp.pl_lists pv
    where c.id = lid and pv.ord = c.ord - 1 and x.ord <= pv.ord and x.cost is not null order by x.rk, x.ord desc;
  create temp table pl_ptag on commit drop as
    select distinct on (x.rk) x.rk, case x.status when 'renamed' then 'Now: ' || x.new_name else 'removed' end tag
    from pg_temp.pl_plp x where x.list_id = lid and x.status in ('renamed', 'removed') order by x.rk;
  analyze pg_temp.pl_pcur; analyze pg_temp.pl_pprv; analyze pg_temp.pl_ptag;

  with
  ov as (
    select row_key,
           max(value) filter (where field = 'cat')  ocat,  max(value) filter (where field = 'name') oname, max(value) filter (where field = 'type') otype,
           max(value) filter (where field = 'prio') oprio, max(value) filter (where field = 'min')  omin,  max(value) filter (where field = 'max')  omax
    from public.plan_overrides group by row_key
  ),
  zeros as (select coalesce(jsonb_agg(0 order by mo), '[]'::jsonb) z from pg_temp.pl_months),
  rk_spend as (
    select p.rk, coalesce(g.ps, 0) ps,
           sum(coalesce(g.ps, 0)) over (partition by p.branch) tot,
           sum(coalesce(g.ps, 0)) over (partition by p.branch order by coalesce(g.ps, 0) desc, p.rk) cum
    from pg_temp.pl_prow p left join pg_temp.pl_agg g on g.rk = p.rk
  ),
  rows_j as (
    select jsonb_agg(jsonb_build_array(
      p.rk, p.branch, coalesce(o.ocat, p.label), coalesce(o.oname, p.product),
      coalesce(o.otype, case lower(coalesce(p.typ, '')) when 'retail' then 'r' else 'p' end),
      case when p.kind = 1 then 1
           when o.otype is null and ((p.label ~* 'professional$' and lower(coalesce(p.typ, '')) = 'retail') or (p.label ~* 'retail$' and lower(coalesce(p.typ, '')) = 'professional')) then 2
           else 0 end,
      coalesce(um.units, zeros.z),
      coalesce(o.oprio, case when r.ps > 0 and (r.cum - r.ps) < 0.8 * r.tot then 'A' else 'B' end),
      coalesce(o.omin::int, ceil(coalesce(g.mu, 0) / greatest((mm_to - mm_from + 1), 1) * 7)::int),
      coalesce(o.omax::int, ceil(coalesce(g.mu, 0) / greatest((mm_to - mm_from + 1), 1) * 7)::int + 3),
      coalesce(pc.cost, p.stock_cost),
      pv.cost,
      p.sale_price, p.in_stock,
      case when p.kind = 1 then 'Usage, not on the Stock List now'
           when p.kind = 2 then 'New SKU from a price list'
           when g.au is null then 'No matched usage' else 'Matched' end,
      pt.tag,
      p.brand
    ) order by p.branch, p.label, p.product, p.rk) rows
    from pg_temp.pl_prow p
    cross join zeros
    left join pg_temp.pl_um um on um.rk = p.rk
    left join ov o on o.row_key = p.rk
    left join pg_temp.pl_agg g on g.rk = p.rk
    left join rk_spend r on r.rk = p.rk
    left join pg_temp.pl_pcur pc on pc.rk = p.rk
    left join pg_temp.pl_pprv pv on pv.rk = p.rk
    left join pg_temp.pl_ptag pt on pt.rk = p.rk
  ),
  ed as (
    select l.row_key, l.field, l.edited_name, l.edited_at, l.old_value, l.new_value,
           count(*) over (partition by l.row_key, l.field) n, row_number() over (partition by l.row_key, l.field order by l.id desc) rn
    from public.plan_edit_log l where l.row_key in (select rk from pg_temp.pl_prow)
  )
  select jsonb_build_object(
    'access', a,
    'rows', coalesce((select rows from rows_j), '[]'::jsonb),
    'months', coalesce((select jsonb_agg(jsonb_build_object('m', mo, 'from', f, 'to', t, 'days', (t - f + 1)) order by mo) from pg_temp.pl_months), '[]'::jsonb),
    'window', jsonb_build_object('from', w_from, 'to', w_to, 'asked_from', p_from, 'asked_to', p_to, 'days', greatest(w_to - w_from + 1, 0)),
    'usage', jsonb_build_object('first', u_first, 'last', u_last),
    'basis', jsonb_build_object('minmax_from', mm_from, 'minmax_to', mm_to, 'prio_from', pr_from, 'prio_to', pr_to),
    'stock_asof', (select jsonb_object_agg(branch, d) from pg_temp.pl_la),
    'list_id', lid,
    'lists', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'n', l.ord, 'name', l.name, 'from', l.effective_from, 'source', l.source, 'file', l.file_name,
                         'by', l.created_by, 'at', l.created_at, 'has_file', l.file_path is not null, 'path', l.file_path,
                         'new_skus', (select count(*) from public.plan_list_prices q where q.list_id = l.id and q.status = 'new'),
                         'new_added', exists (select 1 from public.plan_extra_rows x where x.list_id = l.id)) order by l.ord) from pg_temp.pl_lists l), '[]'::jsonb),
    'new_skus', coalesce((select jsonb_agg(jsonb_build_array(q.product, q.cost) order by q.product) from public.plan_list_prices q where q.list_id = lid and q.status = 'new'), '[]'::jsonb),
    'edits', coalesce((select jsonb_agg(jsonb_build_array(row_key, field, edited_name, edited_at, old_value, new_value, n) order by row_key, field, rn) from ed where rn <= 6), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.spend_plan(date, date, bigint) from public, anon;
grant execute on function public.spend_plan(date, date, bigint) to authenticated;

-- One edit. p_val null or blank clears the cell (back to the Phorest value or the starting value). p_old / p_label are only for the log.
create or replace function public.plan_set(p_row_key text, p_field text, p_val text default null, p_old text default null, p_label text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a    jsonb := public.spend_access();
  who  text  := coalesce(public.kb_me_email(), '?');
  nm   text  := coalesce((select d.name from public.dashboard_users d where lower(d.email) = public.kb_me_email() limit 1), public.kb_me_email(), '?');
  v    text  := nullif(btrim(coalesce(p_val, '')), '');
  br   text  := upper(split_part(p_row_key, '|', 1));
begin
  if not coalesce((a->>'edit')::boolean, false) then raise exception 'no edit access'; end if;
  if p_row_key is null or length(p_row_key) > 600 or br not in ('SAA','KCA','MC','AQ') then raise exception 'bad row'; end if;
  if p_field not in ('cat','name','type','prio','min','max') then raise exception 'unknown field'; end if;
  if p_field in ('min','max') and v is not null then
    if v !~ '^\d{1,6}$' then raise exception 'min and max are whole numbers'; end if;
  elsif p_field = 'prio' and v is not null and v not in ('A','B','C') then raise exception 'priority is A, B or C';
  elsif p_field = 'type' and v is not null and v not in ('p','r') then raise exception 'type is p or r';
  elsif p_field in ('cat','name') and v is not null and length(v) > 200 then raise exception 'too long';
  end if;
  if v is null then
    delete from public.plan_overrides where row_key = p_row_key and field = p_field;
  else
    insert into public.plan_overrides (row_key, field, value, updated_by) values (p_row_key, p_field, v, who)
      on conflict (row_key, field) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into public.plan_edit_log (row_key, branch, product, field, old_value, new_value, edited_by, edited_name)
    values (p_row_key, br, left(p_label, 200), p_field, left(p_old, 200), v, who, nm);
  return jsonb_build_object('ok', true, 'by', nm, 'at', now());
end $$;
revoke all on function public.plan_set(text, text, text, text, text) from public, anon;
grant execute on function public.plan_set(text, text, text, text, text) to authenticated;

-- Save an uploaded price list as a NEW list (never an edit of an old one). p_items = [[product, cost], ...] the lines of the file;
-- p_links = [[row_key or null, status, cost, new_name, product], ...] what the list does to each product of the plan.
create or replace function public.plan_price_save(p_name text, p_from date, p_file text, p_path text, p_items jsonb, p_links jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a   jsonb := public.spend_access();
  nm  text  := coalesce((select d.name from public.dashboard_users d where lower(d.email) = public.kb_me_email() limit 1), public.kb_me_email(), '?');
  lid bigint;
begin
  if not coalesce((a->>'edit')::boolean, false) then raise exception 'no edit access'; end if;
  if btrim(coalesce(p_name, '')) = '' or p_from is null then raise exception 'a name and a date are needed'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'the file has no lines'; end if;
  if jsonb_array_length(p_items) > 20000 or jsonb_array_length(coalesce(p_links, '[]'::jsonb)) > 20000 then raise exception 'too many lines'; end if;
  insert into public.price_lists (name, supplier, effective_from, source, file_name, file_path, note, created_by)
    values (left(btrim(p_name), 160), null, p_from, 'upload', left(p_file, 200), left(p_path, 300), 'Uploaded on the Weekly Product Plan page', nm)
    returning id into lid;
  insert into public.price_list_items (list_id, branch, brand, product, cost)
    select lid, 'ALL', null, left(x->>0, 300), nullif(x->>1, '')::numeric from jsonb_array_elements(p_items) x where coalesce(x->>0, '') <> '';
  insert into public.plan_list_prices (list_id, row_key, product, cost, status, new_name)
    select lid, nullif(x->>0, ''), left(coalesce(x->>4, ''), 300), nullif(x->>2, '')::numeric, x->>1, nullif(x->>3, '')
    from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) x;
  return jsonb_build_object('ok', true, 'id', lid);
end $$;
revoke all on function public.plan_price_save(text, date, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.plan_price_save(text, date, text, text, jsonb, jsonb) to authenticated;

-- Put the new SKUs of a list on the sheet, one row per chosen salon, with their price and no usage yet.
create or replace function public.plan_add_new_skus(p_list bigint, p_branches text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a   jsonb := public.spend_access();
  who text  := coalesce(public.kb_me_email(), '?');
  b   text;
  n   int := 0;
  k   int;
begin
  if not coalesce((a->>'edit')::boolean, false) then raise exception 'no edit access'; end if;
  if exists (select 1 from public.plan_extra_rows where list_id = p_list) then raise exception 'these SKUs are already on the sheet'; end if;
  foreach b in array coalesce(p_branches, '{}') loop
    if b not in ('SAA','KCA','MC','AQ') then continue; end if;
    insert into public.plan_extra_rows (row_key, branch, brand, product, category, type, cost, list_id, added_by)
      select lower(b || '||' || q.product || '|'), b, null, q.product, '(New SKU)', 'p', q.cost, p_list, who
      from public.plan_list_prices q where q.list_id = p_list and q.status = 'new'
      on conflict (row_key) do nothing;
    get diagnostics k = row_count; n := n + k;
    insert into public.plan_list_prices (list_id, row_key, product, cost, status)
      select p_list, lower(b || '||' || q.product || '|'), q.product, q.cost, 'added'
      from public.plan_list_prices q where q.list_id = p_list and q.status = 'new'
      on conflict (list_id, row_key) where row_key is not null do nothing;
  end loop;
  return jsonb_build_object('ok', true, 'added', n);
end $$;
revoke all on function public.plan_add_new_skus(bigint, text[]) from public, anon;
grant execute on function public.plan_add_new_skus(bigint, text[]) to authenticated;

-- The uploaded price files: a private bucket, readable by people who can see the page, writable by people who can edit it, never changed or deleted.
insert into storage.buckets (id, name, public) values ('price-lists', 'price-lists', false) on conflict (id) do nothing;
drop policy if exists price_lists_read on storage.objects;
create policy price_lists_read on storage.objects for select to authenticated
  using (bucket_id = 'price-lists' and coalesce((public.spend_access()->>'view')::boolean, false));
drop policy if exists price_lists_add on storage.objects;
create policy price_lists_add on storage.objects for insert to authenticated
  with check (bucket_id = 'price-lists' and coalesce((public.spend_access()->>'edit')::boolean, false));
