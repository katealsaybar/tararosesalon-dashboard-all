-- Out of Stock: "Refresh stock now" (Kate, 26 Nov 2026: the shelf figure is only read once a day, so it can be hours old when the order is placed;
-- ate Tine: "bantayan lang tlga na tama". Kate said go to a button that reads one salon straight from Phorest's API).
-- APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (migrations out_of_stock_stock_apply, then out_of_stock_stock_apply_v2 which is the function below).
--
-- The edge function oos-stock-refresh (supabase/functions/oos-stock-refresh) reads one salon's products from Phorest's third-party API
-- (quantityInStock, minQuantity, maxQuantity per product, about 5 calls) and hands them here. This function puts the figures into today's
-- stock_levels snapshot of that salon IN PLACE: only in_stock, min_stock, max_stock and loaded_at change. Nothing else of a row is touched,
-- so the Stock List's brand, category, cost and price stay exactly as the daily PDF sync wrote them. If the morning sync has not run today,
-- yesterday's snapshot is copied to today first (the page always reads the newest snapshot of a salon; yesterday's rows stay as history).
--
-- HOW A STOCK LIST ROW IS MATCHED TO A PHOREST PRODUCT (checked 26 Nov 2026 on all 829 Saadiyat products: 825 matched, the 4 left are long-named
-- extension and skincare lines; a Phorest product can carry several barcodes in one field, "4045787205824,4045787950151", and a sibling's barcode, so names go first):
--   tier 1  the name and the category, when that pair is on one Phorest product only
--   tier 2  a barcode and the category
--   tier 3  a barcode that is on one Phorest product only
--   tier 4  the Stock List cuts long names and categories short: a name that starts the Phorest name, in a category that starts or is started by it, on one product only
-- p_dry = true matches against the newest snapshot and writes nothing (used to check the matching on real data).
--
-- Only the service role may run it (the edge function, after it has checked oos_access() with the caller's own sign-in). Revoked from everyone else.

create or replace function public.oos_stock_apply(p_branch text, p_items jsonb, p_dry boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'Asia/Dubai')::date;
  latest date; t date; copied int := 0; n_api int; n_rows int; n_match int; n_chg int; n_missing int; sample jsonb;
begin
  if p_branch not in ('KCA', 'SAA', 'MC', 'AQ') then raise exception 'branch must be KCA, SAA, MC or AQ'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items must be an array'; end if;
  select max(as_of) into latest from public.stock_levels where branch = p_branch;
  if latest is null then raise exception 'no Stock List snapshot for % yet', p_branch; end if;
  t := case when p_dry then latest else d end;
  if not p_dry and latest < d then
    insert into public.stock_levels (branch, as_of, brand, product, volume, barcode, stock_type, type, cost, sale_price, in_stock, min_stock, max_stock, on_order, loaded_at, category)
    select branch, d, brand, product, volume, barcode, stock_type, type, cost, sale_price, in_stock, min_stock, max_stock, on_order, now(), category
    from public.stock_levels where branch = p_branch and as_of = latest;
    get diagnostics copied = row_count;
  end if;

  create temp table _api on commit drop as
    select o.ord::int idx, lower(btrim(coalesce(o.x ->> 'nm', ''))) nm, lower(btrim(coalesce(o.x ->> 'cat', ''))) cat,
           (o.x ->> 'q')::numeric q, nullif(o.x ->> 'mn', '')::numeric mn, nullif(o.x ->> 'mx', '')::numeric mx, coalesce(o.x ->> 'bc', '') bcs
    from jsonb_array_elements(p_items) with ordinality as o(x, ord) where o.x ->> 'q' is not null;
  create temp table _bc on commit drop as
    select a.idx, lower(btrim(b)) bc from _api a, lateral regexp_split_to_table(a.bcs, ',') b where btrim(b) <> '';
  create temp table _nu on commit drop as select nm, cat, min(idx) idx from _api group by nm, cat having count(*) = 1;
  create temp table _bu on commit drop as select bc, min(idx) idx from _bc group by bc having count(distinct idx) = 1;
  create temp table _s on commit drop as
    select id, lower(btrim(coalesce(barcode, ''))) bc, lower(btrim(product)) p, lower(btrim(coalesce(category, ''))) cat
    from public.stock_levels where branch = p_branch and as_of = t;
  create temp table _m (id bigint primary key, idx int, tier int) on commit drop;
  insert into _m select s.id, n.idx, 1 from _s s join _nu n on n.nm = s.p and n.cat = s.cat;
  insert into _m select distinct on (s.id) s.id, a.idx, 2 from _s s join _bc b on s.bc <> '' and b.bc = s.bc join _api a on a.idx = b.idx and a.cat = s.cat
    where s.id not in (select id from _m) order by s.id, a.idx;
  insert into _m select s.id, u.idx, 3 from _s s join _bu u on s.bc <> '' and u.bc = s.bc where s.id not in (select id from _m);
  insert into _m select s.id, min(a.idx), 4 from _s s
    join _api a on length(s.p) >= 12 and left(a.nm, length(s.p)) = s.p and length(a.cat) > 0 and length(s.cat) > 0 and (left(a.cat, length(s.cat)) = s.cat or left(s.cat, length(a.cat)) = a.cat)
    where s.id not in (select id from _m) group by s.id having count(distinct a.idx) = 1;

  select count(*) into n_api from _api;
  select count(*) into n_rows from _s;
  select count(*) into n_match from _m;
  select count(*) into n_chg from _m m join public.stock_levels s on s.id = m.id join _api a on a.idx = m.idx
    where s.in_stock is distinct from a.q or s.min_stock is distinct from coalesce(a.mn, s.min_stock) or s.max_stock is distinct from coalesce(a.mx, s.max_stock);
  n_missing := n_rows - n_match;
  select coalesce(jsonb_agg(z.product), '[]'::jsonb) into sample from (select product from public.stock_levels s where s.branch = p_branch and s.as_of = t and s.id not in (select id from _m) order by product limit 15) z;
  if not p_dry then
    update public.stock_levels s set in_stock = a.q, min_stock = coalesce(a.mn, s.min_stock), max_stock = coalesce(a.mx, s.max_stock), loaded_at = now()
    from _m m join _api a on a.idx = m.idx where s.id = m.id;
  end if;
  return jsonb_build_object('branch', p_branch, 'day', t, 'dry', p_dry, 'phorest_products', n_api, 'stock_list_rows', n_rows, 'matched', n_match, 'changed', n_chg,
                            'not_matched', n_missing, 'not_matched_sample', sample, 'snapshot_copied', copied,
                            'tiers', (select coalesce(jsonb_object_agg(tier, c), '{}'::jsonb) from (select tier, count(*) c from _m group by tier) z));
end $$;
revoke all on function public.oos_stock_apply(text, jsonb, boolean) from public, anon, authenticated;
