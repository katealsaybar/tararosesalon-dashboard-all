-- Complaint alerts by WhatsApp through respond.io only (Kate, 28 Oct 2026). Twilio is dropped.
-- wa_on = send this person the WhatsApp alert (needs phone). sms_on is no longer read by anything and is left in place, all false.
-- Add a number and switch it on:
--   update public.complaint_notify_recipients set phone = '+9715XXXXXXXX', wa_on = true where name = 'Name';
-- The message goes from the call centre spare number (respond.io channel 569496) using the approved template named in the edge function
-- secret RESPOND_COMPLAINT_TEMPLATE (see supabase/functions/complaint-notify/index.ts for the template wording). Every attempt is in
-- complaint_notify_log with channel 'whatsapp'. Send a test to one person: select public.complaint_notify_test(<recipient id>);
alter table public.complaint_notify_recipients add column if not exists wa_on boolean not null default false;
update public.complaint_notify_recipients set sms_on = false where sms_on;

-- Escalation (Kate's Zoom note, 29 Oct 2026): "if Coach Emma is unavailable it goes to the next person". away = true skips that person and sends the
-- alert to escalate_to (another recipient row) instead. Switch it by hand while someone is out, for example:
--   update public.complaint_notify_recipients set away = true where name like 'Emma Usher%';      -- Coach Emma's alerts go to Mette
--   update public.complaint_notify_recipients set away = false where name like 'Emma Usher%';     -- back
alter table public.complaint_notify_recipients add column if not exists away boolean not null default false;
alter table public.complaint_notify_recipients add column if not exists escalate_to bigint references public.complaint_notify_recipients(id);
update public.complaint_notify_recipients set escalate_to = (select id from public.complaint_notify_recipients where name = 'Mette Haxthausen' limit 1)
 where name like 'Emma Usher%' and escalate_to is null;
