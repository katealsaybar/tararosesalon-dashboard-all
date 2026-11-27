-- Kate, 27 Nov 2026: Products gets two tabs, "All products" and "Order by supplier" (mockup docs/mockups/products-and-suppliers.html in the cowork repo).
-- The data is Phorest's: every product of the four UAE salons, the supplier list with its contacts, and each salon's orders. Phorest holds no supplier on a
-- product, so the link is the NEWEST order that had the product on it; the sync script (phorest data export/catalog/sync_catalog.py) works that out and
-- hands the whole picture to catalog_replace as ONE jsonb snapshot:
--   asof  the day it was read,  PR products,  SU suppliers (names folded: one supplier, one name),  TU product orders by month/salon/supplier,  SO supplier orders by month/salon
--   (the shape is documented at the top of js/products-catalog.js).
-- One row, replaced each time: it is a reading, not a history. About 0.75 MB.
--
--   catalog_snapshot     the one row. RLS on and no policy, and every API role is revoked, so nobody reads it directly.
--   catalog_get()        the Products page reads it here. Level 5 only (database level 4), the same people the Products page opens for: it holds supplier contacts.
--   catalog_replace()    the sync script writes it, with the Phorest pushers' pass (push_passes, push_passes.sql). It only touches catalog_snapshot.
-- Additive: one new table and two new functions; nothing existing changes.
-- NOT APPLIED when this file was written (Kate's word first). Until it is applied the two new tabs say so and the page works as before.

create table if not exists public.catalog_snapshot (
  id       int primary key default 1 check (id = 1),
  asof     date not null,
  loaded_at timestamptz not null default now(),
  data     jsonb not null
);
alter table public.catalog_snapshot enable row level security;
revoke all on public.catalog_snapshot from public, anon, authenticated;

create or replace function public.catalog_get()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 4 then
    raise exception 'Products and suppliers are for Level 5';
  end if;
  select jsonb_build_object('asof', asof, 'loaded_at', loaded_at) || data into out from public.catalog_snapshot where id = 1;
  return coalesce(out, jsonb_build_object('empty', true));
end
$function$;
revoke all on function public.catalog_get() from public, anon;
grant execute on function public.catalog_get() to authenticated;

create or replace function public.catalog_replace(p_pass uuid, p_asof date, p_data jsonb)
returns int
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if jsonb_typeof(p_data->'PR') <> 'array' or jsonb_array_length(p_data->'PR') < 100 then raise exception 'the snapshot has no products, nothing replaced'; end if;
  insert into catalog_snapshot (id, asof, loaded_at, data) values (1, p_asof, now(), p_data)
  on conflict (id) do update set asof = excluded.asof, loaded_at = excluded.loaded_at, data = excluded.data;
  return jsonb_array_length(p_data->'PR');
end
$function$;
revoke all on function public.catalog_replace(uuid, date, jsonb) from public;
grant execute on function public.catalog_replace(uuid, date, jsonb) to anon, authenticated;
