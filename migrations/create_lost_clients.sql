-- Lost Clients page (Kate, 2 Oct 2026; Tara asked for a per-branch outreach list
-- of regulars who stopped coming back). Applied live on 2 Oct 2026.
--
-- client_contacts  One row per branch + client from Sales Transactions (2025+),
--                  with the phone number matched from Phorest's New Clients report.
--                  Pushed by "phorest data export/new clients/parse_new_clients.py"
--                  (push_insert / push_delete, so it joins push_tables()).
--                  Phone numbers are readable by the owner login only, for now
--                  (Kate's choice): no anon policy, and the one read policy checks
--                  is_dashboard_owner(). The numbers themselves never enter this
--                  public repo.
-- lost_clients     The page's one call. Security invoker, so the Sales Transactions
--                  rows follow the reader's own policies (a Bahrain-scoped login
--                  gets nothing; this is UAE data), and the contact columns come
--                  back empty for anyone but the owner.
--
-- Everything is judged on 2025+ visits only, because that is where Sales
-- Transactions starts: a client who was a regular in 2024 and stopped before
-- January 2025 isn't in it.

create table if not exists public.client_contacts (
  branch       text not null,
  client_key   text not null,          -- stl_client_key(client_name)
  mobile       text,
  landline     text,
  contact_from text,                   -- which branch's export the number came from
  match        text,                   -- own branch / other branch / check / no number / none
  updated_at   timestamptz not null default now(),
  primary key (branch, client_key)
);
alter table public.client_contacts enable row level security;
revoke all on public.client_contacts from anon;
drop policy if exists owner_read on public.client_contacts;
create policy owner_read on public.client_contacts for select to authenticated
  using ((select public.is_dashboard_owner()));

create or replace function public.push_tables()
returns text[] language sql immutable as $$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts']
$$;

-- p_min_visits / p_max_visits pick the segment (3+ = regulars, 1..1 = one visit
-- only); p_days is how long since the last visit counts as gone. Visits = days
-- the client came in at that branch. Spend is ex VAT (net), refunds netted off.
-- Returns one jsonb array: a table result would stop at PostgREST's 1,000 rows.
create or replace function public.lost_clients(
  p_branch text, p_min_visits int default 3, p_max_visits int default null, p_days int default 90)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout = '30s'
as $function$
declare out jsonb;
begin
  with l as (
    select public.stl_client_key(s.client_name) as k,
           regexp_replace(trim(s.client_name), '\s+', ' ', 'g') as name,
           s.date, s.net, s.employee_name
    from sales_transaction_lines s
    where s.branch = p_branch and s.date >= date '2025-01-01'
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
  ), c as (
    select k, max(name) as client_name, count(distinct date)::int as visits,
           min(date) as first_visit, max(date) as last_visit, round(sum(coalesce(net, 0)), 2) as spend
    from l group by k
  ), st as (
    select k, employee_name,
           row_number() over (partition by k order by count(*) desc, max(date) desc) as rn
    from l where coalesce(employee_name, '') <> ''
    group by k, employee_name
  ), r as (
    select c.client_name, c.visits, c.first_visit, c.last_visit,
           (current_date - c.last_visit) as days_since, c.spend,
           st.employee_name as stylist, cc.mobile, cc.landline, cc.match
    from c
    left join st on st.k = c.k and st.rn = 1
    left join client_contacts cc on cc.branch = p_branch and cc.client_key = c.k
    where c.visits >= p_min_visits
      and (p_max_visits is null or c.visits <= p_max_visits)
      and c.last_visit < current_date - p_days
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.spend desc), '[]'::jsonb) into out from r;
  return out;
end;
$function$;
revoke all on function public.lost_clients(text, int, int, int) from public, anon;
grant execute on function public.lost_clients(text, int, int, int) to authenticated;
