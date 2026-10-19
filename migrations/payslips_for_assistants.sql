-- Employed assistants on the payslip send roster (Kate, 19 Oct 2026).
-- Until now the payslip tables (payslips, payslip_sends, payslip_revisions) only knew perf_staff, the hair and beauty team.
-- Assistants live in kb_staff (category 'Assistant', keyed by email), so they could not be uploaded, listed or emailed.
--
-- 1. kb_staff gets a stable id, so an assistant can be a staff_id like a stylist.
-- 2. The three staff_id foreign keys to perf_staff are replaced by one check: the id must be a perf_staff OR a kb_staff row.
--    (A perf_staff row is never deleted, only marked inactive, so losing ON DELETE CASCADE on payslips changes nothing in practice.)
-- No names or emails in this file: the repo is public.

alter table public.kb_staff add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists kb_staff_id_key on public.kb_staff (id);

alter table public.payslips          drop constraint if exists payslips_staff_id_fkey;
alter table public.payslip_sends     drop constraint if exists payslip_sends_staff_id_fkey;
alter table public.payslip_revisions drop constraint if exists payslip_revisions_staff_id_fkey;

create or replace function public.payslip_person_ok() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.perf_staff where id = new.staff_id)
     and not exists (select 1 from public.kb_staff where id = new.staff_id) then
    raise exception 'payslip staff_id % is not on the roster', new.staff_id using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists payslip_person_ok on public.payslips;
create trigger payslip_person_ok before insert or update of staff_id on public.payslips
  for each row execute function public.payslip_person_ok();
drop trigger if exists payslip_person_ok on public.payslip_sends;
create trigger payslip_person_ok before insert or update of staff_id on public.payslip_sends
  for each row execute function public.payslip_person_ok();
drop trigger if exists payslip_person_ok on public.payslip_revisions;
create trigger payslip_person_ok before insert or update of staff_id on public.payslip_revisions
  for each row execute function public.payslip_person_ok();
