-- Phorest rota (Kate, 18 Nov 2026). Belle asked if the roster can be captured so the team stops logging overtime by hand.
-- Source: Phorest official API, GET /branch/{id}/staff/worktimetable (max one month per call), read by the edge function shifts-sync.
-- One row per staff and day: kind WORKING (start_time, end_time = the rostered shift) or OFF (note = the label the salon typed: RDO, HOLIDAY, SICK_DAY, TRAINING, swap...).
-- A day with nothing on the rota has no row. This is the rota as it stands in Phorest today, with no history of edits: a shift changed after the day is overwritten.
-- Row level security on, no policy: read only through service_calendar().
create table if not exists public.phorest_shifts (
  branch      text        not null,            -- SAA, KCA, MC, AQ
  staff_id    text        not null,
  date        date        not null,
  kind        text        not null,            -- WORKING or OFF
  start_time  time,
  end_time    time,
  note        text        not null default '',
  synced_at   timestamptz not null default now(),
  primary key (branch, staff_id, date)
);
create index if not exists phorest_shifts_day on public.phorest_shifts (branch, date);
alter table public.phorest_shifts enable row level security;
revoke all on public.phorest_shifts from anon, authenticated;
