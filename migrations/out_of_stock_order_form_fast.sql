-- APPLIED 27 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_order_form_fast). Found on Kate's first real Confirm order (83 Saadiyat lines): oos_order_form_get took about 6 seconds,
-- the 8 second limit of the signed-in role was hit when the page called it several times at once ("canceling statement due to statement timeout"). The slow part was the name match, which
-- cleaned every catalog description with two regexp_replace calls for every order line. dbd_catalog now keeps that plain name in a stored column (nd, indexed) and the function compares to it.
-- Same answers (checked line by line on the 83 lines in a rolled-back run), about 0.5 seconds.
alter table public.dbd_catalog add column if not exists nd text generated always as (trim(regexp_replace(regexp_replace(lower(coalesce(description, '')), '[^a-z0-9+% ]+', ' ', 'g'), '\s+', ' ', 'g'))) stored;
create index if not exists dbd_catalog_nd on public.dbd_catalog (nd);

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
                           where k.nd = any (array[l2.n, 'abc ' || l2.n, 'caviar ' || l2.n, 'ir ' || l2.n0, 'ig ' || l2.n0, 'bm ' || l2.n, l2.n0, 'ir ' || l2.n])
                           order by k.last_seen desc nulls last, k.n_seen desc limit 1) c on true
      )
      select jsonb_agg(m.v || jsonb_build_object('code', m.code, 'ean', k.ean, 'desc', k.description, 'size', k.size, 'cat', k.category, 'sub', k.sub_category,
                                                  'wsp', k.wsp, 'how', m.how) order by m.ord)
      from m left join public.dbd_catalog k on k.code = m.code
    ), '[]'::jsonb));
end $$;
revoke all on function public.oos_order_form_get(text) from public, anon;
grant execute on function public.oos_order_form_get(text) to authenticated;
