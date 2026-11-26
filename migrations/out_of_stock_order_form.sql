-- APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_order_form). Checked in a rolled-back run on 181 real Saadiyat Priority A lines: 110 matched by barcode, 1 by item code, 42 by name, 28 without a code.
-- Out of Stock: the DBD order form of a confirmed order (Kate, 26 Nov 2026, step 2 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md: "create order form for dbd").
-- Needs out_of_stock_supplier_orders.sql and dbd_catalog.sql (both APPLIED 26 Nov 2026).
--
-- oos_order_form_get(order_no)   read gate = oos_access(). Gives the lines of the order with the DBD product each one is: Code, EAN, description, size, category,
--                                sub-category and price list price (WSP), from dbd_catalog. A line is matched, first one that fits wins:
--                                  ean   the Stock List barcode is the catalog EAN (13 digits; or the first 12 match)
--                                  code  the Stock List barcode is the DBD item code itself (some products are kept that way in Phorest)
--                                  name  our name equals DBD's description once both are lower case and plain (our "Glow mask 500ml" is DBD's "ABC Glow Mask 500ml",
--                                        our "IR  3-0  60ML" is DBD's "IR 3-0", our "Moisture Masque 161g" is "Caviar Moisture Masque 161g")
--                                When several catalog rows fit, the one seen on the newest form wins. A line with no match has code null: the page shows it as "code needed".

create or replace function public.oos_order_form_get(p_order_no text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o record;
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  select * into o from public.oos_supplier_orders where order_no = p_order_no;
  if not found then return jsonb_build_object('missing', true); end if;
  return jsonb_build_object('order_no', o.order_no, 'supplier', o.supplier, 'branch', o.branch, 'status', o.status, 'extras', o.extras,
    'confirmed_by', o.confirmed_by, 'confirmed_at', o.confirmed_at,
    'lines', coalesce((
      with l as (
        select e.ord, e.v,
               e.v ->> 'name' as nm,
               regexp_replace((string_to_array(coalesce(e.v ->> 'key', ''), '|'))[array_length(string_to_array(coalesce(e.v ->> 'key', ''), '|'), 1)], '\D', '', 'g') as bc,
               trim(regexp_replace(regexp_replace(lower(coalesce(e.v ->> 'name', '')), '[^a-z0-9+% ]+', ' ', 'g'), '\s+', ' ', 'g')) as n
        from jsonb_array_elements(o.lines) with ordinality as e(v, ord)
      ), l2 as (select l.*, trim(regexp_replace(l.n, ' ?60 ?ml$', '')) as n0 from l),
      m as (
        select l2.ord, l2.v,
               coalesce(a.code, b.code, c.code) as code,
               case when a.code is not null then 'ean' when b.code is not null then 'code' when c.code is not null then 'name' end as how
        from l2
        left join lateral (select k.code from public.dbd_catalog k
                           where length(l2.bc) >= 8 and k.ean is not null and (k.ean = l2.bc or (length(l2.bc) >= 12 and left(k.ean, 12) = left(l2.bc, 12)))
                           order by k.last_seen desc nulls last, k.n_seen desc limit 1) a on true
        left join lateral (select k.code from public.dbd_catalog k where length(l2.bc) between 6 and 8 and k.code = l2.bc limit 1) b on true
        left join lateral (select k.code from public.dbd_catalog k
                           where trim(regexp_replace(regexp_replace(lower(k.description), '[^a-z0-9+% ]+', ' ', 'g'), '\s+', ' ', 'g'))
                                   = any (array[l2.n, 'abc ' || l2.n, 'caviar ' || l2.n, 'ir ' || l2.n0, 'ig ' || l2.n0, 'bm ' || l2.n, l2.n0, 'ir ' || l2.n])
                           order by k.last_seen desc nulls last, k.n_seen desc limit 1) c on true
      )
      select jsonb_agg(m.v || jsonb_build_object('code', k.code, 'ean', k.ean, 'desc', k.description, 'size', k.size, 'cat', k.category, 'sub', k.sub_category,
                                                  'wsp', k.wsp, 'how', m.how) order by m.ord)
      from m left join public.dbd_catalog k on k.code = m.code
    ), '[]'::jsonb));
end $$;
revoke all on function public.oos_order_form_get(text) from public, anon;
grant execute on function public.oos_order_form_get(text) to authenticated;
