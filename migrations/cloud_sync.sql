-- Kate, 17 Nov 2026: the cloud sync for /daily-reports. DRAFT, NOT APPLIED.
-- A GitHub Actions runner pulls the Phorest reports five times a day (9 am, 1 pm, 5 pm, 9 pm, 1 am Dubai) and whenever the owner
-- presses the button on the dashboard, so nobody's laptop has to be on. It writes through the push pass, like the Python pushers
-- (push_passes.sql). Re-syncing a day replaces that branch-day (push_delete then push_insert), so older data is overwritten.
--
-- What this adds, and nothing else:
--   1. phorest_sessions   the two Phorest sign-in tokens per country, so the runner can renew them and save the new ones
--   2. sync_runs, sync_squares, sync_latest   what the button page shows (each report x salon x day is one square)
--   3. RPCs the runner calls with its pass: session_get, session_put, sync_run_open, sync_square, sync_run_close, ledger_filled
--   4. read-only policies so a signed-in dashboard user can see the sync status (owner only can start a sync, through the edge function)
--
-- The runner's pass is a NEW row in push_passes labelled 'github-actions' so it can be revoked on its own:
--   update public.push_passes set active = false where label = 'github-actions';
-- Insert it separately with a uuid made on Kate's PC (never written into this repo):
--   insert into public.push_passes (token, label) values ('<uuid from the local file>', 'github-actions');
--
-- To undo everything: the drop statements at the bottom.

-- 1. Phorest sign-ins -------------------------------------------------------------------------------------------------
create table if not exists public.phorest_sessions (
  country       text primary key check (country in ('ae', 'bh')),
  access_token  text,
  refresh_token text not null,
  refreshed_at  timestamptz not null default now()
);
alter table public.phorest_sessions enable row level security;
revoke all on public.phorest_sessions from public, anon, authenticated;   -- no policy: only the RPCs below can touch it

create or replace function public.session_get(p_pass uuid, p_country text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  return (select to_jsonb(s) from (select country, access_token, refresh_token, refreshed_at
                                     from phorest_sessions where country = p_country) s);
end $$;

create or replace function public.session_put(p_pass uuid, p_country text, p_access text, p_refresh text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_country not in ('ae', 'bh') then raise exception 'country must be ae or bh'; end if;
  if coalesce(p_refresh, '') = '' then raise exception 'a refresh token is required'; end if;
  insert into phorest_sessions (country, access_token, refresh_token, refreshed_at)
  values (p_country, p_access, p_refresh, now())
  on conflict (country) do update
    set access_token = excluded.access_token, refresh_token = excluded.refresh_token, refreshed_at = now();
end $$;

-- 2. What the button page shows ---------------------------------------------------------------------------------------
create table if not exists public.sync_runs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  trigger       text not null check (trigger in ('schedule', 'button')),
  requested_by  text,                                   -- the owner's email for a button press, null for the timer
  scope         jsonb not null default '{}'::jsonb,     -- {"dates":["2026-11-17"],"branches":["SAA","KCA"],"reports":["daily","fin"],"practice":false}
  status        text not null default 'queued'
                check (status in ('queued', 'running', 'done', 'needs_look', 'failed')),
  summary       text,
  github_run_id bigint
);
create index if not exists sync_runs_created on public.sync_runs (created_at desc);

create table if not exists public.sync_squares (
  run_id     bigint not null references public.sync_runs (id) on delete cascade,
  report     text not null,      -- daily, fin, sales, util, track, ledger, drive, prod, compl, disc
  branch     text not null,      -- SAA, KCA, MC, AQ, BAH
  date       date not null,
  state      text not null check (state in ('queued', 'run', 'done', 'dry', 'held', 'failed', 'need')),
  detail     text,               -- the plain words shown on the page, e.g. 'Staff Daily 12,840.00 and Financial Totals 12,627.50 are 212.50 apart'
  files      int,
  rows       int,
  updated_at timestamptz not null default now(),
  primary key (run_id, report, branch, date)
);

-- The last good sync of each report, salon and day: this is what "Updated 3:04 pm" reads.
create table if not exists public.sync_latest (
  report    text not null,
  branch    text not null,
  date      date not null,
  synced_at timestamptz not null default now(),
  run_id    bigint,
  rows      int,
  primary key (report, branch, date)
);

alter table public.sync_runs enable row level security;
alter table public.sync_squares enable row level security;
alter table public.sync_latest enable row level security;
revoke all on public.sync_runs, public.sync_squares, public.sync_latest from public, anon;
revoke insert, update, delete on public.sync_runs, public.sync_squares, public.sync_latest from authenticated;

-- Reading is open to a dashboard user, like the data tables (dashboard_sign_in_phase_a.sql). Writing is only through the RPCs below
-- (the runner's pass) or the sync-now edge function (service role, owner only).
create policy dashboard_users_read on public.sync_runs for select to authenticated using ((select public.is_dashboard_user()));
create policy dashboard_users_read on public.sync_squares for select to authenticated using ((select public.is_dashboard_user()));
create policy dashboard_users_read on public.sync_latest for select to authenticated using ((select public.is_dashboard_user()));
grant select on public.sync_runs, public.sync_squares, public.sync_latest to authenticated;

-- 3. The runner's calls -----------------------------------------------------------------------------------------------
-- Open a run: for a button press the edge function already made the queued row, so its id comes in and the row is marked running;
-- for the timer there is no id, so a new row is made.
create or replace function public.sync_run_open(p_pass uuid, p_trigger text, p_scope jsonb,
                                                p_github_run bigint default null, p_id bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_id is not null then
    update sync_runs set status = 'running', started_at = now(), github_run_id = p_github_run
     where id = p_id returning id into rid;
    if rid is null then raise exception 'no such run %', p_id; end if;
  else
    insert into sync_runs (trigger, scope, status, started_at, github_run_id)
    values (p_trigger, coalesce(p_scope, '{}'::jsonb), 'running', now(), p_github_run) returning id into rid;
  end if;
  return rid;
end $$;

-- Set one square. A 'done' square also moves the "last good sync" forward; every other state leaves the last good sync alone,
-- so a held or failed pull never makes the page say the day is fresh.
create or replace function public.sync_square(p_pass uuid, p_run bigint, p_report text, p_branch text, p_date date,
                                              p_state text, p_detail text default null, p_files int default null, p_rows int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  insert into sync_squares (run_id, report, branch, date, state, detail, files, rows, updated_at)
  values (p_run, p_report, p_branch, p_date, p_state, p_detail, p_files, p_rows, now())
  on conflict (run_id, report, branch, date) do update
    set state = excluded.state, detail = excluded.detail, files = excluded.files, rows = excluded.rows, updated_at = now();
  if p_state = 'done' then
    insert into sync_latest (report, branch, date, synced_at, run_id, rows)
    values (p_report, p_branch, p_date, now(), p_run, p_rows)
    on conflict (report, branch, date) do update
      set synced_at = now(), run_id = p_run, rows = excluded.rows;
  end if;
end $$;

create or replace function public.sync_run_close(p_pass uuid, p_run bigint, p_status text, p_summary text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  update sync_runs set status = p_status, summary = p_summary, finished_at = now() where id = p_run;
end $$;

-- The ledger check, read only: judge by rows with figures, never by rows existing (the nightly backfill writes the whole roster at zero).
create or replace function public.ledger_filled(p_pass uuid, p_date date)
returns table (branch text, n bigint, nonzero bigint) language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  return query select b.branch, count(*), count(*) filter (where b.total <> 0)
                 from branch_staff_daily b where b.date = p_date group by b.branch order by b.branch;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'session_get(uuid, text)', 'session_put(uuid, text, text, text)',
    'sync_run_open(uuid, text, jsonb, bigint, bigint)',
    'sync_square(uuid, bigint, text, text, date, text, text, int, int)',
    'sync_run_close(uuid, bigint, text, text)', 'ledger_filled(uuid, date)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon', f);   -- the runner sends the public key plus its pass, like push_insert
  end loop;
end $$;

-- Undo (kept here, commented out):
--   drop function if exists public.session_get(uuid, text), public.session_put(uuid, text, text, text),
--     public.sync_run_open(uuid, text, jsonb, bigint, bigint), public.sync_square(uuid, bigint, text, text, date, text, text, int, int),
--     public.sync_run_close(uuid, bigint, text, text), public.ledger_filled(uuid, date);
--   drop table if exists public.sync_squares, public.sync_latest, public.sync_runs, public.phorest_sessions;
--   update public.push_passes set active = false where label = 'github-actions';
