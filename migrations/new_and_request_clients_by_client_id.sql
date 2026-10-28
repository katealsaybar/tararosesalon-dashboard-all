-- Kate, 28 Oct 2026: Phase 2, batch B of counting clients by Phorest client id (Phase 1: sales_lines_client_id.sql; batch A: door_clients_by_client_id.sql).
-- New clients and request clients through the door, and the lists behind them, now go by ckey (her Phorest client id, else 'n:' + the folded name), not by the name on the PDF.
--   phorest_appt_requests   gets client_id (Appointments clientId; '' on rows pulled before 28 Oct); the key is now (branch, date, name_key, client_id). pull_appt_requests.py
--                           writes the id and the whole history was pulled again (2021-07 to 2026-10), the old '' rows deleted.
--   door_first_visits       one row per ckey (column cn holds the ckey): her first paid visit anywhere, the branch she first came to, and new_ok from HER Phorest profile
--                           (phorest_client_since.phorest_id = ckey; a name-only ckey falls back to the name key). A namesake can no longer hide or fake a new client.
--   door_request_days       one row per branch, day and ckey: a visit of hers that day whose Phorest appointment carried the stylist request (by client id).
--   drill_staff_clients     groups by ckey, rows carry 'k'
--   drill_staff_new_clients joins her lines by ckey, the request flag by client id, rows carry 'k'
--   drill_ledger_ncr        the client the ledger's first name resolves to is a ckey, rows carry 'k' (when matched)
--   drill_client_lines      new last parameter p_ckey (her ckey from the row): lines of that client only, so two women with one name are not merged; the old 6-argument signature is dropped
-- door_new_daily and door_request_daily are unchanged (they read the two views). The hourly refresh jobs keep their names.
-- The functions were rewritten by a guarded replace on the live definitions (so changes other sessions made, such as day_spend_ok, are kept); this file is the record.

alter table public.phorest_appt_requests add column if not exists client_id text not null default '';
alter table public.phorest_appt_requests drop constraint if exists phorest_appt_requests_pkey;
alter table public.phorest_appt_requests add constraint phorest_appt_requests_pkey primary key (branch, date, name_key, client_id);
create index if not exists phorest_appt_requests_cid on public.phorest_appt_requests (client_id, branch, date) where client_id <> '';

-- The two views were built as door_first_visits_b and door_request_days_b, then swapped in (drop the old, rename the new, with their indexes):
create materialized view public.door_first_visits_b as
with k as materialized (
  select ik, public.stl_item_kind(ik) as kind
  from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines) d
), ln as (
  select l.branch, l.date, l.ckey as cn,
         (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
         (bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) and l.day_spend_ok) as sale_paid
  from public.sales_transaction_lines l
  join k on k.ik = coalesce(l.item, '')
  where l.ckey is not null
    and coalesce(trim(l.client_name), '') <> ''
    and l.client_name !~* '^\s*walk[\s-]*in\M'
    and l.client_name !~* '\mstaff\M'
), cd as (
  select branch, date, cn from ln group by branch, date, cn having bool_or(is_real and sale_paid)
), fv as (
  select cn, min(date) as first_date from cd group by cn
), fb as (
  select distinct on (cd.cn) cd.cn, cd.branch as first_branch
  from cd join fv on fv.cn = cd.cn and fv.first_date = cd.date
  order by cd.cn, cd.branch
), cs as (
  select phorest_id, min(since_date) as since_date from public.phorest_client_since group by phorest_id
), csn as (
  select name_key, min(since_date) as since_date from public.phorest_client_since group by name_key
)
select fv.cn, fv.first_date, fb.first_branch,
       (coalesce(cs.since_date, csn.since_date) is null or coalesce(cs.since_date, csn.since_date) >= (select min(date) from public.sales_transaction_lines)) as new_ok
from fv
join fb using (cn)
left join cs on cs.phorest_id = fv.cn
left join csn on fv.cn like 'n:%' and csn.name_key = substr(fv.cn, 3);
create unique index door_first_visits_b_cn on public.door_first_visits_b (cn);
create index door_first_visits_b_date on public.door_first_visits_b (first_date, first_branch);
revoke all on public.door_first_visits_b from public, anon, authenticated;

create materialized view public.door_request_days_b as
with k as materialized (
  select ik, public.stl_item_kind(ik) as kind
  from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines) d
), ln as (
  select l.branch, l.date, l.ckey as cn,
         (k.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
         (bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) and l.day_spend_ok) as sale_paid
  from public.sales_transaction_lines l
  join k on k.ik = coalesce(l.item, '')
  where l.ckey is not null
    and coalesce(trim(l.client_name), '') <> ''
    and l.client_name !~* '^\s*walk[\s-]*in\M'
    and l.client_name !~* '\mstaff\M'
), cd as (
  select branch, date, cn from ln group by branch, date, cn having bool_or(is_real and sale_paid)
)
select cd.branch, cd.date, cd.cn
from cd
where exists (
  select 1 from public.phorest_appt_requests r
  where r.branch = cd.branch and r.date = cd.date and r.requested
    and (r.client_id = cd.cn or (r.client_id = '' and cd.cn like 'n:%' and r.name_key = substr(cd.cn, 3)))
);
create unique index door_request_days_b_key on public.door_request_days_b (branch, date, cn);
revoke all on public.door_request_days_b from public, anon, authenticated;

-- Swap, in one transaction, together with the functions below:
drop materialized view public.door_first_visits;
alter materialized view public.door_first_visits_b rename to door_first_visits;
alter index public.door_first_visits_b_cn rename to door_first_visits_cn;
alter index public.door_first_visits_b_date rename to door_first_visits_date;
drop materialized view public.door_request_days;
alter materialized view public.door_request_days_b rename to door_request_days;
alter index public.door_request_days_b_key rename to door_request_days_key;

do $do$
declare d text;
  nm text := 'lower(regexp_replace(trim(l.client_name), ''\s+'', '' '', ''g''))';
  ns text := 'lower(regexp_replace(trim(s.client_name), ''\s+'', '' '', ''g''))';
  np text := 'lower(regexp_replace(trim(p_client), ''\s+'', '' '', ''g''))';
begin
  -- drill_staff_clients
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'drill_staff_clients' and pronamespace = 'public'::regnamespace;
  if position('lower(trim(l.client_name)) as cn' in d) = 0 or position('''c'', client, ''s'', round(spend, 2)' in d) = 0 then raise exception 'pattern not found in drill_staff_clients'; end if;
  d := replace(replace(d, 'lower(trim(l.client_name)) as cn', 'l.ckey as cn'), '''c'', client, ''s'', round(spend, 2)', '''c'', client, ''k'', cn, ''s'', round(spend, 2)');
  execute d;

  -- drill_staff_new_clients
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'drill_staff_new_clients' and pronamespace = 'public'::regnamespace;
  if position('and ' || nm || ' = fv.cn' in d) = 0
     or position('left join public.phorest_appt_requests r on r.branch = h.b and r.date = h.d and r.name_key = h.cn' in d) = 0
     or position('''c'', c, ''q'', q)' in d) = 0 then raise exception 'pattern not found in drill_staff_new_clients'; end if;
  d := replace(d, 'and ' || nm || ' = fv.cn', 'and l.ckey = fv.cn');
  d := replace(d, 'left join public.phorest_appt_requests r on r.branch = h.b and r.date = h.d and r.name_key = h.cn',
    'left join lateral (select bool_or(x.requested) as requested from public.phorest_appt_requests x where x.branch = h.b and x.date = h.d and (x.client_id = h.cn or (x.client_id = '''' and h.cn like ''n:%'' and x.name_key = substr(h.cn, 3)))) r on true');
  d := replace(d, '''c'', c, ''q'', q)', '''c'', c, ''k'', cn, ''q'', q)');
  execute d;

  -- drill_ledger_ncr
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'drill_ledger_ncr' and pronamespace = 'public'::regnamespace;
  if position('select distinct n.id, ' || ns || ' as cn,' in d) = 0
     or position('partition by n.id, ' || ns in d) = 0
     or position('(o.id is not null) as m,' in d) = 0
     or position('''m'', m, ''nw'', nw)' in d) = 0 then raise exception 'pattern not found in drill_ledger_ncr'; end if;
  d := replace(d, 'select distinct n.id, ' || ns || ' as cn,', 'select distinct n.id, s.ckey as cn,');
  d := replace(d, 'partition by n.id, ' || ns, 'partition by n.id, s.ckey');
  d := replace(d, '(o.id is not null) as m,', '(o.id is not null) as m, o.cn as ck,');
  d := replace(d, '''m'', m, ''nw'', nw)', '''m'', m, ''k'', ck, ''nw'', nw)');
  execute d;

  -- drill_client_lines: new last parameter p_ckey
  select pg_get_functiondef(oid) into d from pg_proc where proname = 'drill_client_lines' and pronamespace = 'public'::regnamespace;
  if position('p_all boolean DEFAULT false)' in d) = 0 or position('and ' || nm || ' = ' || np in d) = 0 then raise exception 'pattern not found in drill_client_lines'; end if;
  d := replace(d, 'p_all boolean DEFAULT false)', 'p_all boolean DEFAULT false, p_ckey text DEFAULT NULL::text)');
  d := replace(d, 'and ' || nm || ' = ' || np,
    'and (case when coalesce(p_ckey, '''') <> '''' and p_ckey not like ''n:%'' then l.ckey = p_ckey else ' || nm || ' = ' || np || ' end)');
  drop function public.drill_client_lines(date, date, text[], text, text[], boolean);
  execute d;
  revoke all on function public.drill_client_lines(date, date, text[], text, text[], boolean, text) from public, anon;
  grant execute on function public.drill_client_lines(date, date, text[], text, text[], boolean, text) to authenticated;
end $do$;
