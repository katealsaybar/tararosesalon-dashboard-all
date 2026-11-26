-- Out of Stock shows the exact date and time of the last shelf sync (Kate, 26 Nov 2026: "put exact date and time for last sync").
-- oos_plan() now also returns 'stock_loaded': for each of the four UAE salons, the time the latest Stock List snapshot was written (max stock_levels.loaded_at of the newest as_of).
-- 'rows' and 'stock_asof' are unchanged, so an older copy of out-of-stock.js still works. Applied to the live project on 26 Nov 2026.
create or replace function public.oos_plan()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare res jsonb;
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  res := public.spend_plan_core(null, null, null);
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_array(r -> 0, r -> 1, r -> 2, r -> 3, r -> 4, null, null, r -> 7, r -> 8, r -> 9, r -> 10, null, null, r -> 13, null, null, r -> 16, r -> 17))
                      from jsonb_array_elements(res -> 'rows') r), '[]'::jsonb),
    'stock_asof', res -> 'stock_asof',
    'stock_loaded', coalesce((select jsonb_object_agg(x.branch, x.loaded)
                              from (select s.branch, max(s.loaded_at) as loaded
                                    from public.stock_levels s
                                    join (select branch, max(as_of) as d from public.stock_levels where branch in ('SAA','KCA','MC','AQ') group by branch) l
                                      on l.branch = s.branch and l.d = s.as_of
                                    group by s.branch) x), '{}'::jsonb));
end $function$;
