-- Kate, 18 Nov 2026: on Service Rankings, a tap on Units or Clients opens WHO had the service.
-- Same lines, same stem and category rules as service_rankings (migrations/service_rankings.sql), so the list always adds up to the figure on the page:
-- units are sales lines (Ironing counts 0), refunds, negative lines, deposits, vouchers, retail and skipped categories are left out, walk-ins are
-- counted in walkin_units but not listed. One row per client and salon, with her units, visits, first and last day and the service names she had.
-- Read-only over sales_transaction_lines, security invoker. Client names are Level 3 and up (database level 2), like Top Clients and Client Mix.
-- p_branch is one code, a comma list (SAA,KCA), or null for the four open UAE salons; Bahrain is 'BAH'.
-- p_stem + p_category is one row of the page; p_fam is a family (the By family rows); p_item is one name or size inside a row; all null = every service.
-- NOT APPLIED when this file was written: the page shows a plain note until it is (Kate's word first).
create or replace function public.drill_service_clients(
  p_from date, p_to date, p_branch text default null, p_stem text default null, p_category text default null,
  p_fam text default null, p_item text default null, p_limit int default 500)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb; scope text[];
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Client lists are for Level 3 and up';
  end if;
  scope := case when p_branch is null then array['SAA','KCA','MC','AQ'] else string_to_array(p_branch, ',') end;
  with b as materialized (
    select s.branch, s.date, s.client_name as cn, s.client_id, coalesce(s.item, '') as raw_item, coalesce(s.net, 0) as net
    from sales_transaction_lines s
    where s.branch = any(scope) and s.date between p_from and p_to
      and coalesce(s.net, 0) >= 0 and coalesce(s.item, '') !~* '\(Refund\)\s*$'
  ), ic as materialized (
    select item, family, category, stem from public.item_classes(array(select distinct raw_item from b))
  ), l as materialized (
    select b.branch, b.date, b.cn, b.client_id, b.raw_item, b.net,
           case when b.raw_item ~* '\s-\s*ironing\s*$' then 0 else 1 end as u,
           (b.cn is not null and trim(b.cn) <> '' and b.cn !~* '^\s*walk[\s-]*in\M') as ok
    from b join ic on ic.item = b.raw_item
    where ic.family not in ('skip', 'retail')
      and (p_stem is null or ic.stem = p_stem) and (p_category is null or ic.category = p_category)
      and (p_fam is null or ic.family = p_fam) and (p_item is null or b.raw_item = p_item)
  ), per as (
    select lower(regexp_replace(trim(cn), '\s+', ' ', 'g')) as k, max(cn) as client_name, max(client_id) as client_id, branch,
           sum(u)::int as units, round(sum(net), 2) as net, count(distinct date)::int as visits,
           min(date) as first_day, max(date) as last_day, left(string_agg(distinct raw_item, ' · '), 300) as items
    from l where ok group by 1, branch
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select client_name, client_id, branch, units, net, visits, first_day, last_day, items
        from per order by units desc, net desc, client_name limit greatest(p_limit, 1)) x), '[]'::jsonb),
    'total_clients', (select count(distinct k) from per),
    'total_units', (select coalesce(sum(u), 0) from l),
    'walkin_units', (select coalesce(sum(u), 0) from l where not ok)
  ) into out;
  return out;
end $function$;
revoke all on function public.drill_service_clients(date, date, text, text, text, text, text, int) from public, anon;
grant execute on function public.drill_service_clients(date, date, text, text, text, text, text, int) to authenticated;
alter function public.drill_service_clients(date, date, text, text, text, text, text, int) set enable_nestloop = off;
