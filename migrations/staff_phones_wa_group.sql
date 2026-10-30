-- Staff Payroll WhatsApp: a group of its own for the LID agency people (Kate, 30 Oct 2026: "LID sila so dapat sila ang magkasama").
-- wa_group, when set, is the heading the person sits under on the Staff Payroll WhatsApp list instead of their team (Hair, Beauty, Other...). Nothing else reads it.
-- Ids 72 and 73 are the two LID people (they were both under Other); no names are kept in this public repo.
alter table public.staff_phones add column if not exists wa_group text;
update public.staff_phones set wa_group = 'LID' where id in (72, 73) and wa_group is distinct from 'LID';
