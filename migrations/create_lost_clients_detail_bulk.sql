-- Kate, 2 Oct 2026: the Lost Clients XLSX/CSV carry what the row panel shows
-- (lost_client_detail): her first visit, the services she came in for, what she took
-- home and her retail spend. One call per batch of clients (lost-clients.js sends
-- 400 names at a time) instead of one per client. Same rules as lost_client_detail:
-- Level 2 and above, this branch only, lines from 1 Jan 2025, names matched on
-- stl_client_key. Services are "Item x visits", most visits first, top 8; products
-- "Item x times", most spend first, top 6.
create or replace function public.lost_clients_detail_bulk(p_branch text, p_clients text[])
returns table (client_name text, first_visit date, services text, products text, retail_spend int)
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
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
    select w.name, s.date, s.item, s.net, public.stl_item_kind(s.item) kind
    from sales_transaction_lines s
    join want w on public.stl_client_key(s.client_name) = w.k
    where s.branch = p_branch and s.date >= date '2025-01-01'
  ), svc as (
    select name, item, count(distinct date) v,
           row_number() over (partition by name order by count(distinct date) desc, sum(coalesce(net,0)) desc) rn
    from l where kind = 'service' group by name, item
  ), prod as (
    select name, item, count(*) t, sum(coalesce(net,0)) sp,
           row_number() over (partition by name order by sum(coalesce(net,0)) desc) rn
    from l where kind = 'product' group by name, item
  )
  select w.name,
         (select min(l.date) from l where l.name = w.name),
         (select string_agg(svc.item || ' x' || svc.v, '; ' order by svc.rn) from svc where svc.name = w.name and svc.rn <= 8),
         (select string_agg(prod.item || ' x' || prod.t, '; ' order by prod.rn) from prod where prod.name = w.name and prod.rn <= 6),
         (select round(sum(coalesce(l.net,0)))::int from l where l.name = w.name and l.kind = 'product')
  from want w;
end $function$;

revoke execute on function public.lost_clients_detail_bulk(text, text[]) from public, anon;
grant execute on function public.lost_clients_detail_bulk(text, text[]) to authenticated;
