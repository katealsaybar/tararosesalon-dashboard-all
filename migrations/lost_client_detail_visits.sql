-- Kate, 7 Oct 2026: the row panel (lost_client_detail) showed only the top 12 services by
-- visit count, so a client with many services lost her latest visit (Julia Bergheim's
-- 2 Oct cut, toner and treatment were pushed out by older repeats). Now it returns
--   services  every service, not 12, with spelling variants merged (Phorest writes
--             "Cut and Finish 1 HR" and "Cut and Finish 1 hr -" for the same thing);
--             shown under the same name, the latest spelling
--   visits    one entry per day, newest first: stylists, service names, products bought,
--             and what the day came to
-- products, stylists, first_visit and last_visit are as before. Level 2 and above, this
-- branch only, lines from 1 Jan 2025.
create or replace function public.lost_client_detail(p_branch text, p_client text)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '15s'
as $function$
declare out jsonb; k text := public.stl_client_key(p_client);
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with l as (
    select s.date, s.item, s.net, s.employee_name, public.stl_item_kind(s.item) kind,
           trim(regexp_replace(lower(coalesce(s.item, '')), '[^a-z0-9]+', ' ', 'g')) as ikey
    from sales_transaction_lines s
    where s.branch = p_branch and s.date >= date '2025-01-01'
      and public.stl_client_key(s.client_name) = k
  ), svc as (
    select (array_agg(item order by date desc))[1] as item,
           count(distinct date)::int visits, max(date) last_date, round(sum(coalesce(net,0)))::int spend,
           (array_agg(employee_name order by date desc) filter (where coalesce(employee_name,'') <> '' and employee_name !~* '^\s*business\M'))[1] last_by
    from l where kind = 'service' group by ikey
  ), prod as (
    select item, count(*)::int times, round(sum(coalesce(net,0)))::int spend
    from l where kind = 'product' group by item
  ), st as (
    select employee_name, count(distinct date)::int visits
    from l where coalesce(employee_name,'') <> '' and employee_name !~* '^\s*business\M' group by employee_name
  ), vd as (
    select date,
           (select jsonb_agg(e order by e) from (select distinct x.employee_name e from l x
              where x.date = l.date and coalesce(x.employee_name,'') <> '' and x.employee_name !~* '^\s*business\M') q) as by_who,
           (select jsonb_agg(i order by i) from (select distinct x.item i from l x
              where x.date = l.date and x.kind = 'service') q) as services,
           count(*) filter (where kind = 'product')::int as products,
           round(sum(coalesce(net,0)))::int as total
    from l group by date
  )
  select jsonb_build_object(
    'services', coalesce((select jsonb_agg(to_jsonb(svc) order by visits desc, spend desc) from svc), '[]'),
    'products', coalesce((select jsonb_agg(to_jsonb(prod) order by spend desc) from (select * from prod order by spend desc limit 6) prod), '[]'),
    'stylists', coalesce((select jsonb_agg(to_jsonb(st) order by visits desc) from st), '[]'),
    'visits',   coalesce((select jsonb_agg(to_jsonb(vd) order by date desc) from vd), '[]'),
    'first_visit', (select min(date) from l), 'last_visit', (select max(date) from l)
  ) into out;
  return out;
end $function$;
