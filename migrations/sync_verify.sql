-- Kate, 20 Nov 2026: the weekly Phorest checker. APPLIED 20 Nov 2026 (project gvijxenafoowajqktqvd).
-- Once a week the cloud runner pulls last week's five reports fresh from Phorest (practice mode, writes nothing to the data tables) and compares them
-- with what the dashboard database holds, row by row, in case Phorest changed a value after the daily sync. This is the database side of that.
--
-- What this adds, and nothing else:
--   1. push_read(pass, table, eq, gte, lte)   READ ONLY. Same pass as push_delete and push_insert, but only the six report tables, a branch
--                                             is required, at most 50,000 rows. It cannot write, so a bug in the checker cannot change a figure.
--   2. sync_verify_runs, sync_verify_squares  the result of each check (one row per run, one per report x salon x day)
--   3. verify_put(pass, result jsonb)         the runner saves a finished check in one call
--   4. read-only policies, so a signed-in dashboard user can see the results
--
-- To undo: the drop statements at the bottom.

-- 1. Read -------------------------------------------------------------------------------------------------------------
create or replace function public.push_read(p_pass uuid, p_table text, p_eq jsonb,
                                            p_gte jsonb default '{}', p_lte jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare w text[] := '{}'; k text; v text; out jsonb;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  -- only the six report tables the checker compares, not the whole push list (that one also holds client contacts)
  if not (p_table = any(array['phorest_staff_daily', 'financial_totals', 'staff_financial_totals', 'sales_transaction_lines',
                              'staff_utilisation', 'phorest_staff_rebooking'])) then
    raise exception 'table % cannot be read by the checker', p_table; end if;
  if coalesce(p_eq->>'branch', '') = '' then raise exception 'a read needs a branch'; end if;
  for k, v in select * from jsonb_each_text(p_eq) union all select * from jsonb_each_text(coalesce(p_gte, '{}'))
              union all select * from jsonb_each_text(coalesce(p_lte, '{}')) loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = p_table and column_name = k) then raise exception 'no column %', k; end if;
  end loop;
  for k, v in select * from jsonb_each_text(p_eq)  loop w := w || format('%I = %L', k, v); end loop;
  for k, v in select * from jsonb_each_text(coalesce(p_gte, '{}')) loop w := w || format('%I >= %L', k, v); end loop;
  for k, v in select * from jsonb_each_text(coalesce(p_lte, '{}')) loop w := w || format('%I <= %L', k, v); end loop;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I where %s limit 50001) t',
                 p_table, array_to_string(w, ' and ')) into out;
  if jsonb_array_length(out) > 50000 then raise exception 'push_read: more than 50000 rows, ask for a shorter range'; end if;
  return out;
end $$;

-- 2. Results ----------------------------------------------------------------------------------------------------------
create table if not exists public.sync_verify_runs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  date_from     date not null,
  date_to       date not null,
  scope         jsonb not null default '{}'::jsonb,       -- {"branches":[...],"reports":[...]}
  status        text not null check (status in ('clean', 'drift', 'unverified')),
  summary       text,
  n_squares     int not null default 0,
  n_changed     int not null default 0,
  n_unverified  int not null default 0,
  github_run_id bigint
);
create index if not exists sync_verify_runs_created on public.sync_verify_runs (created_at desc);

create table if not exists public.sync_verify_squares (
  run_id   bigint not null references public.sync_verify_runs (id) on delete cascade,
  report   text not null,      -- daily, fin, sales, lines, util, track
  branch   text not null,
  date     date not null,
  state    text not null check (state in ('same', 'changed', 'unverified')),
  n_db     int,
  n_fresh  int,
  n_diffs  int not null default 0,
  detail   text,
  diffs    jsonb not null default '[]'::jsonb,            -- first 50: {kind: changed|added|removed, key, field, old, new}
  primary key (run_id, report, branch, date)
);

alter table public.sync_verify_runs enable row level security;
alter table public.sync_verify_squares enable row level security;
revoke all on public.sync_verify_runs, public.sync_verify_squares from public, anon;
revoke insert, update, delete on public.sync_verify_runs, public.sync_verify_squares from authenticated;
create policy dashboard_users_read on public.sync_verify_runs for select to authenticated using ((select public.is_dashboard_user()));
create policy dashboard_users_read on public.sync_verify_squares for select to authenticated using ((select public.is_dashboard_user()));
grant select on public.sync_verify_runs, public.sync_verify_squares to authenticated;

-- 3. Save a finished check --------------------------------------------------------------------------------------------
-- p_result = {"date_from","date_to","scope":{},"status","summary","github_run_id","squares":[{"report","branch","date","state","n_db","n_fresh","n_diffs","detail","diffs":[]}]}
create or replace function public.verify_put(p_pass uuid, p_result jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint; sq jsonb;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  insert into sync_verify_runs (date_from, date_to, scope, status, summary, n_squares, n_changed, n_unverified, github_run_id)
  values ((p_result->>'date_from')::date, (p_result->>'date_to')::date, coalesce(p_result->'scope', '{}'::jsonb),
          p_result->>'status', p_result->>'summary',
          jsonb_array_length(coalesce(p_result->'squares', '[]'::jsonb)),
          (select count(*) from jsonb_array_elements(coalesce(p_result->'squares', '[]'::jsonb)) s where s->>'state' = 'changed'),
          (select count(*) from jsonb_array_elements(coalesce(p_result->'squares', '[]'::jsonb)) s where s->>'state' = 'unverified'),
          nullif(p_result->>'github_run_id', '')::bigint)
  returning id into rid;
  for sq in select * from jsonb_array_elements(coalesce(p_result->'squares', '[]'::jsonb)) loop
    insert into sync_verify_squares (run_id, report, branch, date, state, n_db, n_fresh, n_diffs, detail, diffs)
    values (rid, sq->>'report', sq->>'branch', (sq->>'date')::date, sq->>'state',
            nullif(sq->>'n_db', '')::int, nullif(sq->>'n_fresh', '')::int, coalesce((sq->>'n_diffs')::int, 0),
            sq->>'detail', coalesce(sq->'diffs', '[]'::jsonb));
  end loop;
  return rid;
end $$;

revoke all on function public.push_read(uuid, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.verify_put(uuid, jsonb) from public;
grant execute on function public.push_read(uuid, text, jsonb, jsonb, jsonb) to anon;   -- the runner sends the public key plus its pass, like push_insert
grant execute on function public.verify_put(uuid, jsonb) to anon;

-- Undo (kept here, commented out):
--   drop function if exists public.push_read(uuid, text, jsonb, jsonb, jsonb), public.verify_put(uuid, jsonb);
--   drop table if exists public.sync_verify_squares, public.sync_verify_runs;
