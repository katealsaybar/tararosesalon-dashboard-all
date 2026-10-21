-- Receptionists and assistants on the payslip roster (Kate, 21 Oct 2026).
-- 19 Oct put the employed assistants on the roster by reading kb_staff. That table is the Staff Roster and Access list (it decides who can
-- sign in to Team Home), so adding payslip-only people there would also add them to that list. Payslips get a roster of their own instead:
-- everyone who gets a payslip but has no performance page (no perf_staff row). The eight assistants already on the roster keep their ids,
-- so nothing uploaded or sent for them changes.
--
-- grp  ASST = Assistants group, REC = Reception group (receptionists and call centre) in the portal.
-- site the branch code (KCA, SAA, MC, AQ) or null.
-- alt  other spellings of the name that may be printed on the payslip PDF, used only to match pages to people.
-- No names or emails in this file: the repo is public. The rows are loaded straight into the database.

create table if not exists public.payslip_staff (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  grp       text not null check (grp in ('ASST', 'REC')),
  site      text check (site in ('KCA', 'SAA', 'MC', 'AQ')),
  role      text,
  email     text,
  alt       text[] not null default '{}',
  active    boolean not null default true,
  note      text,
  added_at  timestamptz not null default now()
);
alter table public.payslip_staff enable row level security;   -- no policies: only the edge functions (service role) read it

create or replace function public.payslip_person_ok() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.perf_staff where id = new.staff_id)
     and not exists (select 1 from public.payslip_staff where id = new.staff_id)
     and not exists (select 1 from public.kb_staff where id = new.staff_id) then
    raise exception 'payslip staff_id % is not on the roster', new.staff_id using errcode = '23503';
  end if;
  return new;
end $$;
