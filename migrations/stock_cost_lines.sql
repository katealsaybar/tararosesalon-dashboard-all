-- STOCK COST, the order lines behind a figure (Kate, 12 Nov 2026). Click a stock figure on the Stock Cost page and this lists the Phorest order lines that
-- arrived, at the Stock List cost: p_line is hr (Hair Retail), hp (Hair Professional), br (Beauty Retail), bp (Beauty Professional) or unpriced (the lines
-- with no Stock List price, which the page does not count). Same access as stock_cost_report().

create or replace function public.stock_cost_lines(p_year int, p_months int[], p_branches text[], p_line text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a   jsonb := public.stock_cost_access();
  brs text[];
  ok  boolean;
begin
  if not coalesce((a->>'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  if p_year is null or p_year < 2024 or p_year > 2100 then raise exception 'bad year'; end if;
  if p_line not in ('hr','hp','br','bp','unpriced') then raise exception 'bad line'; end if;
  brs := array(select b from unnest(coalesce(p_branches, array['SAA','KCA','MC','AQ'])) b where b in ('SAA','KCA','MC','AQ'));
  return (
    with l as (
      select branch, product, coalesce(brand, '') brand, count, unit_cost, spend, order_no, arrived_date
        from public.stock_order_lines
       where status = 'arrived'
         and branch = any(brs)
         and extract(year from arrived_date)::int = p_year
         and extract(month from arrived_date)::int = any(coalesce(p_months, array[]::int[]))
         and case p_line
               when 'unpriced' then type = 'unmatched'
               when 'hr' then coalesce(dept, 'Hair') = 'Hair'   and type = 'retail'
               when 'hp' then coalesce(dept, 'Hair') = 'Hair'   and type = 'professional'
               when 'br' then coalesce(dept, 'Hair') = 'Beauty' and type = 'retail'
               else           coalesce(dept, 'Hair') = 'Beauty' and type = 'professional'
             end)
    select jsonb_build_object(
      'n', (select count(*) from l),
      'total', (select round(coalesce(sum(spend), 0), 2) from l),
      'rows', coalesce((select jsonb_agg(jsonb_build_array(branch, product, brand, count, unit_cost, spend, order_no, arrived_date)
                                         order by spend desc nulls last, arrived_date, product)
                          from (select * from l order by spend desc nulls last, arrived_date, product limit 500) t), '[]'::jsonb))
  );
end $$;
revoke all on function public.stock_cost_lines(int, int[], text[], text) from public, anon;
grant execute on function public.stock_cost_lines(int, int[], text[], text) to authenticated;
