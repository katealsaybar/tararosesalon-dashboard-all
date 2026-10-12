-- Lost Clients files carry each client's visits (Kate, 12 Oct 2026: "it must show it").
-- The row panel shows a client's recent visits; the XLSX/CSV did not. This gives the files the same thing, in bulk:
-- for each name, the number of visits since 1 Jan 2025 (any UAE branch, products-only days included, vouchers and
-- non-sales left out, as the panel does) and her latest p_n visits as one text, newest first:
--   "12 Jul 2025, KCA, Classic Toner + Root Colour, AED 600, Katie Sanchez | 08 Jul 2025, KCA, ..."
-- Same shape and rules as lost_clients_detail_bulk (Level 2 and above, 30 s, invoker's rights, so the table's own
-- policies still apply); matched on stl_client_key like it.

create or replace function public.lost_clients_visits_bulk(p_clients text[], p_n int default 10)
 returns table(client_name text, visits integer, recent text)
 language plpgsql stable
 set search_path to 'public' set statement_timeout to '30s'
as $function$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  return query
  with want as (
    select distinct on (public.stl_client_key(c)) c as name, public.stl_client_key(c) k
    from unnest(p_clients) c
  ), l as (
    select w.name, s.date, s.branch, s.item, s.net, s.employee_name, public.stl_item_kind(s.item) kind
    from sales_transaction_lines s
    join want w on public.stl_client_key(s.client_name) in (w.k, w.k || ' ' || w.k)
    where s.branch in ('SAA', 'KCA', 'MC', 'AQ') and s.date >= date '2025-01-01'
  ), vd as (
    select l.name, l.date, string_agg(distinct l.branch, '/') as br,
           string_agg(distinct l.item, ' + ') filter (where l.kind = 'service') as svc,
           string_agg(distinct l.employee_name, ', ') filter (where coalesce(l.employee_name, '') <> '' and l.employee_name !~* '^\s*business\M') as who,
           round(sum(coalesce(l.net, 0)))::int as total
    from l where l.kind not in ('non_sale', 'voucher') group by l.name, l.date
  ), rk as (
    select vd.*, row_number() over (partition by vd.name order by vd.date desc) as rn from vd
  )
  select w.name,
         (select count(*)::int from vd where vd.name = w.name),
         (select string_agg(to_char(r.date, 'DD Mon YYYY') || ', ' || r.br || ', ' || coalesce(r.svc, 'products only') || ', AED ' || r.total || coalesce(', ' || r.who, ''),
                            ' | ' order by r.date desc)
          from rk r where r.name = w.name and r.rn <= p_n)
  from want w;
end $function$;

revoke execute on function public.lost_clients_visits_bulk(text[], int) from public, anon;
grant execute on function public.lost_clients_visits_bulk(text[], int) to authenticated;
