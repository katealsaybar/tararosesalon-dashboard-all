-- Kate, 25 Nov 2026: every client line the ledger names, so the Service Calendar's ledger figures (Total, New, NCR, Request, Salon, Rebooked)
-- can open the ledger's own clients beside Phorest's. ledger_ncr_clients (27 Oct) kept only the NCR lines; this keeps all of them.
-- One row per ledger line that has a Type: N (new), R (request), SC (salon client), NCR (new client request), RB (rebooked).
-- Total clients = SC + R + NCR + N. RB is never part of the Total: a Rebooked line is a flag on a client already counted (Kate, 25 Nov 2026).
-- A RB line normally has no name typed (it sits under the client it belongs to): client_first then takes the nearest named row above it
-- in the same column and typed = false. First names only, as typed by reception; staff is the day tab's column heading.
-- Read from the weekly ledger files by "phorest data export/ledgers/parse_ledger_clients.py"; a push replaces every row of the branch and
-- dates it covers. Owner read only, RLS on, same pattern as ledger_ncr_clients.

create table if not exists public.ledger_client_lines (
  id bigint generated always as identity primary key,
  branch text not null,
  date date not null,
  staff text not null,
  row_no int not null,
  client_first text not null default '',
  client_key text not null default '',
  typed boolean not null default true,
  dept text,
  type text not null check (type in ('N','R','SC','NCR','RB')),
  service text,
  amount numeric,
  source text,
  pulled_at date not null default current_date
);
create index if not exists ledger_client_lines_day on public.ledger_client_lines (branch, date);
alter table public.ledger_client_lines enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ledger_client_lines' and policyname = 'owner_read') then
    create policy owner_read on public.ledger_client_lines for select using ((select is_dashboard_owner()));
  end if;
end $$;

-- add the table to push_tables() without touching the other names (guarded replace on the live definition)
do $$
declare d text;
begin
  select pg_get_functiondef('public.push_tables'::regproc) into d;
  if d not like '%ledger_client_lines%' then
    d := replace(d, '''ledger_ncr_clients''', '''ledger_ncr_clients'',''ledger_client_lines''');
    execute d;
  end if;
end $$;
