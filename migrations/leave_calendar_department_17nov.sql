-- Kate, 17 Nov 2026: leave_calendar_people gets a department column for the people whose position does not say it
-- (the call centre are Receptionists by position; the accounts team are Office/Admin). leave_calendar() returns it as dp,
-- and the page uses it before it falls back to the position. Applied live 17 Nov 2026; the names are in the table, not here.
alter table public.leave_calendar_people add column if not exists department text;
-- leave_calendar(): in the people object, after 'rd', p.resigned_on add 'dp', coalesce(p.department, '')
