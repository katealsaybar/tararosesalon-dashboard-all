-- Kate, 27 Oct 2026: Phase 2, batch A of counting clients by Phorest client id (Phase 1: sales_lines_client_id.sql, which adds client_id and ckey to every sales line).
-- Clients through the door now counts a client once per branch and day by ckey, not by the name on the PDF: one client under two spellings is one, two women with one name are two.
--   door_clients, door_clients_daily   `lower(trim(l.client_name)) as cn` becomes `l.ckey as cn`
--   drill_door_clients                 the same, and each row carries 'k' (her ckey) so the Phone and Email lookup and the client window are exact
--   visit_client_ids                   takes an optional 5th item element (her ckey from the row) and uses it as given
--   drill_client_history               new last parameter p_cid (that ckey); the old 4-argument signature is dropped
-- September 2026 clients through the door by id: KCA 890 (unchanged), SAA 933 to 927, AQ 242 to 241, MC 270 (unchanged); every list matches its card, 0 withheld at Khalifa City A.
-- Not yet switched (batch B onwards): door_first_visits and door_request_days (new and request clients), drill_staff_clients, drill_staff_new_clients, drill_client_lines,
-- client_mix_*, top_clients*, service_rankings, lv_lines, oty_refresh, perf_clients, lost_* and the Wellness Voucher blast lists. They still group by name.
-- The functions were rewritten by a guarded replace on the live definitions (so changes other sessions made, such as day_spend_ok, are kept); this file is the record, run it
-- as the DO block below. visit_client_ids is replaced whole.

create or replace function public.visit_client_ids(p_items jsonb)
returns table(ord bigint, n integer, cid text)
language sql stable security definer
set search_path = public
set statement_timeout to '20s'
as $$
  with it as (
    select t.ord, public.stl_client_key(t.x ->> 0) as nk, nullif(t.x ->> 1, '') as br,
           nullif(t.x ->> 2, '')::date as f, coalesce(nullif(t.x ->> 3, '')::date, nullif(t.x ->> 2, '')::date) as t,
           case when nullif(t.x ->> 4, '') is not null and (t.x ->> 4) not like 'n:%' then t.x ->> 4 end as given
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as t(x, ord)
  ), p1 as (
    select it.ord, v.phorest_client_id as cid
    from it
    join public.sales_transaction_lines l on public.stl_client_key(l.client_name) = it.nk and (it.br is null or l.branch = it.br) and l.date between it.f and it.t
    join public.phorest_visit_clients v on v.branch = l.branch and v.date = l.date and v.tx = l.sale_id
    where it.f is not null and it.nk <> '' and it.given is null
  ), p2 as (
    select it.ord, v.phorest_client_id as cid
    from it
    join public.phorest_visit_clients v on v.name_key = it.nk and v.branch = 'BAH' and (it.br is null or v.branch = it.br) and v.date between it.f and it.t
    where it.f is not null and it.nk <> '' and it.given is null
  ), u as (
    select ord, cid from p1 union select ord, cid from p2
  )
  select it.ord, case when it.given is not null then 1 else count(distinct u.cid)::integer end as n,
         case when it.given is not null then it.given when count(distinct u.cid) = 1 then min(u.cid) end as cid
  from it left join u on u.ord = it.ord
  group by it.ord, it.given
$$;
revoke all on function public.visit_client_ids(jsonb) from public, anon, authenticated;

do $do$
declare d text; f text;
begin
  foreach f in array array['door_clients', 'door_clients_daily', 'drill_door_clients'] loop
    select pg_get_functiondef(oid) into d from pg_proc where proname = f and pronamespace = 'public'::regnamespace;
    if position('lower(trim(l.client_name)) as cn' in d) = 0 then raise exception 'pattern not found in %', f; end if;
    d := replace(d, 'lower(trim(l.client_name)) as cn', 'l.ckey as cn');
    if f = 'drill_door_clients' then
      if position('''c'', client, ''s'', round(spend, 2)' in d) = 0 then raise exception 'rows pattern not found'; end if;
      d := replace(d, '''c'', client, ''s'', round(spend, 2)', '''c'', client, ''k'', cn, ''s'', round(spend, 2)');
    end if;
    execute d;
  end loop;

  select pg_get_functiondef(oid) into d from pg_proc where proname = 'drill_client_history' and pronamespace = 'public'::regnamespace;
  if position('p_to date DEFAULT NULL::date)' in d) = 0 or position('p_from::text, p_to::text))' in d) = 0 then raise exception 'history pattern not found'; end if;
  d := replace(replace(d, 'p_to date DEFAULT NULL::date)', 'p_to date DEFAULT NULL::date, p_cid text DEFAULT NULL::text)'), 'p_from::text, p_to::text))', 'p_from::text, p_to::text, p_cid))');
  drop function public.drill_client_history(text, text[], date, date);
  execute d;
  revoke all on function public.drill_client_history(text, text[], date, date, text) from public, anon;
  grant execute on function public.drill_client_history(text, text[], date, date, text) to authenticated;
end $do$;
