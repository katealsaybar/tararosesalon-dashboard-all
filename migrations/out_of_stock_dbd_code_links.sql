-- Out of Stock: save the DBD code of a line the order form could not match (Kate, 27 Nov 2026: "CODE NEEDED save", no Apps Script).
-- Needs dbd_catalog.sql and out_of_stock_order_form.sql (both APPLIED 26 Nov 2026).
--
-- A product that was never ordered from DBD has no Code on the order form ("CODE NEEDED"). The person ordering types the Code once (or picks it from the
-- closest DBD products the page suggests); it is kept here and every later order form, for every salon, shows it.
--
-- dbd_code_links           one row per product: link_key = 'bc:' + the Stock List barcode (digits, 6 or more), else 'nm:' + the plain lower-case name (same plain name the
--                          order form match uses). No policy, no grant: only the two functions below touch it.
-- oos_dbd_code_set()       whoever may edit the Weekly Product Plan (spend_access edit, same gate as Confirm order): saves the Code of a line; an empty code takes the saved code
--                          away and the automatic match applies again. The Code is 6 to 8 digits, like every code in dbd_catalog. Returns the product as DBD's list has it
--                          (description, size, price list price, EAN) when the Code is already in dbd_catalog, else just the Code.
-- oos_order_form_get()     as before, plus: a saved code is looked at FIRST (matched by 'saved'), and it is returned even when dbd_catalog does not have it yet.

create table if not exists public.dbd_code_links (
  link_key text primary key,
  code     text not null check (code ~ '^\d{6,8}$'),
  name     text,
  set_by   text,
  set_at   timestamptz not null default now()
);
alter table public.dbd_code_links enable row level security;
revoke all on public.dbd_code_links from public, anon, authenticated;

create or replace function public.oos_dbd_code_set(p_key text, p_name text, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  who text := coalesce(auth.jwt() ->> 'email', 'unknown');
  parts text[] := string_to_array(coalesce(p_key, ''), '|');
  bc text := regexp_replace(coalesce(parts[array_length(parts, 1)], ''), '\D', '', 'g');
  n text := trim(regexp_replace(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9+% ]+', ' ', 'g'), '\s+', ' ', 'g'));
  lk text; cd text := nullif(btrim(coalesce(p_code, '')), ''); k record;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if length(bc) >= 6 then lk := 'bc:' || bc; elsif length(n) > 0 then lk := 'nm:' || n; else raise exception 'product missing'; end if;
  if cd is null then
    delete from public.dbd_code_links where link_key = lk;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;
  if cd !~ '^\d{6,8}$' then raise exception 'A DBD code is 6 to 8 digits'; end if;
  insert into public.dbd_code_links as t (link_key, code, name, set_by, set_at) values (lk, cd, left(p_name, 200), who, now())
  on conflict (link_key) do update set code = excluded.code, name = excluded.name, set_by = excluded.set_by, set_at = excluded.set_at;
  select * into k from public.dbd_catalog where code = cd;
  return jsonb_build_object('ok', true, 'code', cd, 'known', found,
    'desc', k.description, 'size', k.size, 'cat', k.category, 'sub', k.sub_category, 'wsp', k.wsp, 'ean', k.ean);
end $$;
revoke all on function public.oos_dbd_code_set(text, text, text) from public, anon;
grant execute on function public.oos_dbd_code_set(text, text, text) to authenticated;

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
                           where trim(regexp_replace(regexp_replace(lower(k.description), '[^a-z0-9+% ]+', ' ', 'g'), '\s+', ' ', 'g'))
                                   = any (array[l2.n, 'abc ' || l2.n, 'caviar ' || l2.n, 'ir ' || l2.n0, 'ig ' || l2.n0, 'bm ' || l2.n, l2.n0, 'ir ' || l2.n])
                           order by k.last_seen desc nulls last, k.n_seen desc limit 1) c on true
      )
      select jsonb_agg(m.v || jsonb_build_object('code', m.code, 'ean', k.ean, 'desc', k.description, 'size', k.size, 'cat', k.category, 'sub', k.sub_category,
                                                  'wsp', k.wsp, 'how', m.how) order by m.ord)
      from m left join public.dbd_catalog k on k.code = m.code
    ), '[]'::jsonb));
end $$;
revoke all on function public.oos_order_form_get(text) from public, anon;
grant execute on function public.oos_order_form_get(text) to authenticated;
