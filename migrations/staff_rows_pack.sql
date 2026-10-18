-- Kate, 18 Oct 2026: the first fill of a device for a long window (All time) was about 208 requests of 1,000 rows, each row an
-- object carrying every column name, and took minutes on a phone.
--
--   staff_rows_pack(table, from, to)   the rows of one of the three staff tables for a stretch of dates, in ONE answer:
--                                      {"cols": [...], "rows": [[...], ...]}, the column names once and each row as an
--                                      array in column order, ordered by date then id (the order the paged read gives).
--                                      One jsonb value, so it is not cut at 1,000 rows, and about a third of the size.
--                                      The browser rebuilds the objects with the same keys, so everything downstream
--                                      sees the same rows; it fetches runs of up to six months at a time and keeps each
--                                      month beside its staff_rows_fingerprint checksum.
--
-- Read only, security INVOKER (a scoped login gets its own rows), same table whitelist as staff_rows_fingerprint.
create or replace function public.staff_rows_pack(p_table text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  v_cols text;
  v_list text;
  v_out jsonb;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  if p_table not in ('branch_staff_daily_clean', 'phorest_staff_daily', 'phorest_staff_rebooking') then
    raise exception 'table not allowed';
  end if;
  select string_agg(format('%L', a.attname), ',' order by a.attnum),
         string_agg(format('t.%I', a.attname), ',' order by a.attnum)
    into v_cols, v_list
    from pg_attribute a
   where a.attrelid = ('public.' || quote_ident(p_table))::regclass
     and a.attnum > 0 and not a.attisdropped;
  execute format(
    'select jsonb_build_object(''cols'', jsonb_build_array(%s), ''rows'', coalesce(jsonb_agg(jsonb_build_array(%s) order by t.date, t.id), ''[]''::jsonb))
       from public.%I t where t.date >= $1 and t.date <= $2', v_cols, v_list, p_table)
    into v_out using p_from, p_to;
  return v_out;
end;
$function$;

revoke all on function public.staff_rows_pack(text, date, date) from public, anon;
grant execute on function public.staff_rows_pack(text, date, date) to authenticated;
