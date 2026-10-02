-- push_client_roster: one entry per branch + client from sales_transaction_lines,
-- for "phorest data export/new clients/parse_new_clients.py", which matches these
-- names to the phone numbers in Phorest's New Clients report.
--
-- Gated by the push pass (push_passes), like push_delete / push_insert: the table
-- is locked to signed-in viewers, and the script runs from the pipeline, not a
-- browser. Returns names and visit figures only; the phone numbers never come
-- into Supabase through this function.
--
-- Returns one jsonb array, not a table: PostgREST caps a table result at 1,000
-- rows and ignores Range on an RPC POST, and there are ~15,000 clients.
--
-- client_key = lower-cased name with runs of spaces collapsed, which is how the
-- script keys the report's names too ("Ana  Muriana" = "ana muriana").
-- spend_net is ex VAT. top_stylist = the employee on most of the client's lines.

drop function if exists public.push_client_roster(uuid, date);

create function public.push_client_roster(p_pass uuid, p_from date default '2025-01-01')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set statement_timeout = '60s'  -- anon times out at a few seconds; this scans every 2025+ line
as $function$
declare out jsonb;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then
    raise exception 'bad pass';
  end if;
  with l as (
    select s.branch, regexp_replace(lower(trim(s.client_name)), '\s+', ' ', 'g') as k,
           trim(s.client_name) as name, s.date, s.net, s.employee_name
    from sales_transaction_lines s
    where s.date >= p_from and coalesce(trim(s.client_name), '') <> ''
  ), st as (
    select l.branch, l.k, l.employee_name,
           row_number() over (partition by l.branch, l.k order by count(*) desc, l.employee_name) as rn
    from l where coalesce(l.employee_name, '') <> ''
    group by l.branch, l.k, l.employee_name
  ), r as (
    select l.branch, l.k as client_key, max(l.name) as client_name,
           count(distinct l.date)::int as visits, min(l.date) as first_visit, max(l.date) as last_visit,
           round(sum(coalesce(l.net, 0)), 2) as spend_net, max(st.employee_name) as top_stylist
    from l left join st on st.branch = l.branch and st.k = l.k and st.rn = 1
    group by l.branch, l.k
  )
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into out from r;
  return out;
end;
$function$;

revoke all on function public.push_client_roster(uuid, date) from public;
grant execute on function public.push_client_roster(uuid, date) to anon, authenticated;
