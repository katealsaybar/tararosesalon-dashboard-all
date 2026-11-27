-- APPLIED 27 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_dbd_match). Checked first in a rolled-back run on real product names: Amplify Conditioner 1000ml and Hydrate Mask 500ml matched their DBD code, size, category and price, an unknown product came back with no code.
-- Out of Stock: the supplier order window shows DBD's own format BEFORE the order is confirmed (Kate, 27 Nov 2026: "pag DBD supplier, default DBD format na lang so easy to navigate for salon coordss").
-- oos_order_form_get() only reads a CONFIRMED order. oos_dbd_match(p_lines) does the same matching on any list of lines [{key, name, q, brand, fam, type}, ...]: the saved code first, then the barcode (the end of the key),
-- then the item code, then the name, exactly as oos_order_form_get does, and returns each line with code, ean, desc, size, cat, sub, wsp, how. Read-only, same read gate (oos_access).
create or replace function public.oos_dbd_match(p_lines jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return coalesce((
    with l as (
      select e.ord, e.v,
             e.v ->> 'name' as nm,
             regexp_replace((string_to_array(coalesce(e.v ->> 'key', ''), '|'))[array_length(string_to_array(coalesce(e.v ->> 'key', ''), '|'), 1)], '\D', '', 'g') as bc,
             trim(regexp_replace(regexp_replace(lower(coalesce(e.v ->> 'name', '')), '[^a-z0-9+% ]+', ' ', 'g'), '\s+', ' ', 'g')) as n
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as e(v, ord)
    ), l2 as (select l.*, trim(regexp_replace(l.n, ' ?60 ?ml$', '')) as n0 from l),
    m as (
      select l2.ord, l2.v,
             coalesce(s.code, a.code, b.code, c.code) as code,
             case when s.code is not null then 'saved' when a.code is not null then 'ean' when b.code is not null then 'code' when c.code is not null then 'name' end as how
      from l2
      left join lateral (select x.code from public.dbd_code_links x
                         where x.link_key = case when length(l2.bc) >= 6 then 'bc:' || l2.bc else 'nm:' || l2.n end limit 1) s on true
      left join lateral (select k.code from public.dbd_catalog k
                         where length(l2.bc) >= 8 and k.ean is not null and (k.ean = l2.bc or (length(l2.bc) >= 12 and left(k.ean, 12) = left(l2.bc, 12)))
                         order by k.last_seen desc nulls last, k.n_seen desc limit 1) a on true
      left join lateral (select k.code from public.dbd_catalog k where length(l2.bc) between 6 and 8 and k.code = l2.bc limit 1) b on true
      left join lateral (select k.code from public.dbd_catalog k
                         where trim(regexp_replace(regexp_replace(lower(k.description), '[^a-z0-9+% ]+', ' ', 'g'), '\s+', ' ', 'g'))
                                 = any (array[l2.n, 'abc ' || l2.n, 'caviar ' || l2.n, 'ir ' || l2.n0, 'ig ' || l2.n0, 'bm ' || l2.n, l2.n0, 'ir ' || l2.n])
                         order by k.last_seen desc nulls last, k.n_seen desc limit 1) c on true
    )
    select jsonb_agg(m.v || jsonb_build_object('code', m.code, 'ean', k.ean, 'desc', k.description, 'size', k.size, 'cat', k.category, 'sub', k.sub_category,
                                                'wsp', k.wsp, 'how', m.how) order by m.ord)
    from m left join public.dbd_catalog k on k.code = m.code
  ), '[]'::jsonb);
end $$;
revoke all on function public.oos_dbd_match(jsonb) from public, anon;
grant execute on function public.oos_dbd_match(jsonb) to authenticated;
