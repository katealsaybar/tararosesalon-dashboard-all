-- Quarterly Business Report (Kate, 11 Nov 2026): what is typed on the report page and the numbers locked for a quarter.
-- The page (quarterly-report.js) works out every figure itself from the same ledger and Phorest rows as the Organisation Pulse and Daily Performance.
-- This table only holds three things per quarter:
--   1. the Think line and the commitment (action, who it is taught to, by when), typed on the page by Tara, Coach Emma or Kate;
--   2. a locked copy of the headline figures (snapshot), set by Kate when the quarter is closed, so a late ledger fix never changes what Tara read
--      without saying so (the page compares the live figures to the lock and shows how many differ);
--   3. who and when.
-- Who may open it: old Levels 3 (Executives & Marketing, shown as Level 4) and 5 (Kate, shown as Level 6), the same two as page_comments.
-- Locking and unlocking: Kate (old Level 5) only.
-- Closed to the browser (RLS on, no policies, no grants); the page reads and writes only through the functions below.
-- Undo: drop function public.quarter_report_get(text), public.quarter_report_save(text,text,text,text,text), public.quarter_report_lock(text,jsonb),
--       public.quarter_report_unlock(text), public.quarter_report_guard(boolean); drop table public.quarter_reports;

create table if not exists public.quarter_reports (
  quarter     text primary key check (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  think       text not null default '' check (char_length(think) <= 400),
  c_action    text not null default '' check (char_length(c_action) <= 200),
  c_owner     text not null default '' check (char_length(c_owner) <= 120),
  c_by        text not null default '' check (char_length(c_by) <= 60),
  snapshot    jsonb check (snapshot is null or char_length(snapshot::text) <= 60000),
  locked_at   timestamptz,
  locked_by   text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.quarter_reports enable row level security;
revoke all on public.quarter_reports from anon, authenticated;

-- ── guard: returns the signed-in person's name, or refuses ─────────────────────────────────────────────────────
create or replace function public.quarter_report_guard(p_kate_only boolean default false) returns text
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.level is null or m.level not in (3, 5) then raise exception 'Not open to your account'; end if;
  if p_kate_only and m.level <> 5 then raise exception 'Kate only'; end if;
  return coalesce(m.name, '');
end $$;

-- ── read one quarter ('2026-Q4'); an empty answer is a quarter nobody has typed in or locked yet ───────────────────
create or replace function public.quarter_report_get(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.quarter_reports%rowtype;
begin
  perform public.quarter_report_guard();
  select * into r from public.quarter_reports where quarter = p_q;
  if not found then return jsonb_build_object('quarter', p_q); end if;
  return jsonb_build_object('quarter', r.quarter, 'think', r.think, 'c_action', r.c_action, 'c_owner', r.c_owner, 'c_by', r.c_by,
    'snapshot', r.snapshot, 'locked_at', r.locked_at, 'locked_by', r.locked_by, 'updated_at', r.updated_at, 'updated_by', r.updated_by);
end $$;

-- ── save what was typed (the lock is untouched) ────────────────────────────────────────────────────────────────
create or replace function public.quarter_report_save(p_q text, p_think text, p_action text, p_owner text, p_by text) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.quarter_report_guard();
begin
  if p_q is null or p_q !~ '^[0-9]{4}-Q[1-4]$' then raise exception 'Not a quarter'; end if;
  insert into public.quarter_reports as q (quarter, think, c_action, c_owner, c_by, updated_by)
  values (p_q, left(coalesce(p_think, ''), 400), left(coalesce(p_action, ''), 200), left(coalesce(p_owner, ''), 120), left(coalesce(p_by, ''), 60), who)
  on conflict (quarter) do update set think = excluded.think, c_action = excluded.c_action, c_owner = excluded.c_owner, c_by = excluded.c_by,
    updated_at = now(), updated_by = who;
end $$;

-- ── lock: keep a copy of the headline figures as they were read (Kate only) ────────────────────────────────────
create or replace function public.quarter_report_lock(p_q text, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.quarter_report_guard(true);
begin
  if p_q is null or p_q !~ '^[0-9]{4}-Q[1-4]$' then raise exception 'Not a quarter'; end if;
  if p_snapshot is null then raise exception 'Nothing to lock'; end if;
  insert into public.quarter_reports as q (quarter, snapshot, locked_at, locked_by, updated_by)
  values (p_q, p_snapshot, now(), who, who)
  on conflict (quarter) do update set snapshot = excluded.snapshot, locked_at = now(), locked_by = who, updated_at = now(), updated_by = who;
  return public.quarter_report_get(p_q);
end $$;

create or replace function public.quarter_report_unlock(p_q text) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.quarter_report_guard(true);
begin
  update public.quarter_reports set snapshot = null, locked_at = null, locked_by = null, updated_at = now(), updated_by = who where quarter = p_q;
end $$;

revoke all on function public.quarter_report_guard(boolean), public.quarter_report_get(text), public.quarter_report_save(text,text,text,text,text),
  public.quarter_report_lock(text,jsonb), public.quarter_report_unlock(text) from public, anon;
grant execute on function public.quarter_report_get(text), public.quarter_report_save(text,text,text,text,text),
  public.quarter_report_lock(text,jsonb), public.quarter_report_unlock(text) to authenticated;
