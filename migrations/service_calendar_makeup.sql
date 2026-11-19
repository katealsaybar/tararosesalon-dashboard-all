-- Service Calendar: Make up hours in Shifts and overtime (Kate, 19 Nov 2026: the team blocks the time off in the Phorest calendar as "Owed Hrs").
-- WRITTEN ONLY, NOT APPLIED. It needs Kate's word first (a new table and a live function).
-- 1. phorest_makeup_blocks: the Phorest calendar blocks (the /break endpoint) whose label says owed hours or make up hours. Filled by appointments-sync
--    (supabase/functions/appointments-sync), the same window as the appointments. RLS on, no policy: read only through service_calendar().
-- 2. service_calendar() also returns 'makeup': [date, stylist index, block start, block end, label], Level 2 and up, for the stylists already in the answer.
--    It PATCHES the live function in place (adds one CTE and one key) instead of replacing it with a copy, so the Bahrain support and everything else other
--    sessions added stays. It stops with an error if the places it patches are not found, and does nothing if it was already applied.
-- Order: apply this file, deploy appointments-sync, then run the sync once over the past days to backfill (body { from, to }).

create table if not exists public.phorest_makeup_blocks (
  branch      text        not null,                 -- SAA, KCA, MC, AQ
  break_id    text        not null,                 -- Phorest breakId
  staff_id    text,
  date        date        not null,
  start_time  time        not null,
  end_time    time        not null,
  label       text        not null default '',      -- what the team typed on the block, e.g. Owed Hrs
  synced_at   timestamptz not null default now(),
  primary key (branch, break_id)
);
create index if not exists phorest_makeup_blocks_day on public.phorest_makeup_blocks (branch, date);
alter table public.phorest_makeup_blocks enable row level security;
revoke all on public.phorest_makeup_blocks from anon, authenticated;

do $mig$
declare
  def text;
  a1 text := $a$  )
  select jsonb_build_object($a$;
  b1 text := $b$  ),
  -- the time the team blocks off in the Phorest calendar as Owed Hrs (make up hours), synced into phorest_makeup_blocks
  mk as (
    select m.date d, s.si, to_char(m.start_time, 'HH24:MI') st, to_char(m.end_time, 'HH24:MI') en, m.label
    from public.phorest_makeup_blocks m
    join s on s.sid = m.staff_id
    where v_dash and m.branch = p_branch and m.date between p_from and v_to
  )
  select jsonb_build_object($b$;
  a2 text := $a$    'shifts', coalesce($a$;
  b2 text := $b$    -- make up hours: date, stylist index, block start, block end, the label typed on the block (Level 2 and up)
    'makeup', coalesce((select jsonb_agg(jsonb_build_array(to_char(mk.d, 'YYYY-MM-DD'), mk.si, mk.st, mk.en, mk.label) order by mk.d, mk.si, mk.st) from mk), '[]'::jsonb),
    'shifts', coalesce($b$;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'service_calendar' and p.pronargs = 3;
  if def is null then raise exception 'service_calendar(text, date, date) not found'; end if;
  if def like '%phorest_makeup_blocks%' then return; end if;   -- already applied
  if length(def) - length(replace(def, a1, '')) <> length(a1) then raise exception 'anchor 1 (the end of the CTE list) not found exactly once'; end if;
  if length(def) - length(replace(def, a2, '')) <> length(a2) then raise exception 'anchor 2 (the shifts key) not found exactly once'; end if;
  def := replace(def, a1, b1);
  def := replace(def, a2, b2);
  execute def;
end
$mig$;
