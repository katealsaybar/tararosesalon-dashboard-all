-- Kate, 17 Nov 2026: leave_calendar_entries takes a fourth kind, inferred, for days read from the Phorest roster
-- (no hours on a usual working day, the only such day in the month, matching Jumera's SL count). Applied live 17 Nov 2026.
-- The rows themselves (nine Sick leave days) are personal data and are not in this file.
alter table public.leave_calendar_entries drop constraint leave_calendar_entries_kind_check,
  add constraint leave_calendar_entries_kind_check check (kind in ('approved','planned','requested','inferred'));
