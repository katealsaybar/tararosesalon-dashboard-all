-- Kate, 18 Oct 2026: long windows (a Year, All time, any custom span over a few months) no longer download the whole
-- staff history on every load.
--
--   staff_rows_fingerprint(table, from, to)   one row per calendar month: how many rows, and a checksum of their
--                                             content. The browser keeps every closed month in IndexedDB beside
--                                             the checksum it was fetched with, asks for these (one request),
--                                             and downloads only the months whose checksum has moved: a
--                                             backfill, a re-sync or a deleted row changes it, so a cached
--                                             month can never be out of date.
--
-- Read only, security INVOKER (it sees what the signed-in person's own row-level policies let them see, so a
-- scoped login gets scoped checksums), and only for the three tables the dashboard pages through. The checksum
-- is a sum of 64-bit hashes of each row's text, so the order of rows does not matter. It is returned as text: the
-- sum is wider than the 53 bits a JavaScript number keeps, and a rounded checksum could miss a small change.
drop function if exists public.staff_rows_fingerprint(text, date, date);
create function public.staff_rows_fingerprint(p_table text, p_from date, p_to date)
returns table(m text, n bigint, fp text)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  if p_table not in ('branch_staff_daily_clean', 'phorest_staff_daily', 'phorest_staff_rebooking') then
    raise exception 'table not allowed';
  end if;
  return query execute format(
    'select to_char(date_trunc(''month'', t.date), ''YYYY-MM'') as m, count(*)::bigint as n, (sum(hashtextextended(t::text, 0)::numeric))::text as fp
       from public.%I t where t.date >= $1 and t.date <= $2 group by 1 order by 1', p_table)
    using p_from, p_to;
end;
$function$;

revoke all on function public.staff_rows_fingerprint(text, date, date) from public, anon;
grant execute on function public.staff_rows_fingerprint(text, date, date) to authenticated;
