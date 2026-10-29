-- staff_phones, second step (29 Oct 2026): some staff are in the Phorest roster
-- (phorest_staff_roster) but have no email in perf_staff / kb_staff / dashboard_users
-- yet (new receptionists, floating assistants). Key the table on id, make email
-- optional, and keep one row per email and one per name where there is no email.

alter table public.staff_phones drop constraint staff_phones_pkey;
alter table public.staff_phones add column id bigint generated always as identity primary key;
alter table public.staff_phones alter column email drop not null;
create unique index staff_phones_email_uq on public.staff_phones (lower(email)) where email is not null;
create unique index staff_phones_name_noemail_uq on public.staff_phones (lower(name)) where email is null;
