-- Payslip email -> WhatsApp heads-up, automatic (Kate, 29 Oct 2026: "Awtomatiko").
-- When the payslip-mailer marks someone's payslip email 'sent' (payslip_sends.status = 'sent'), this queues the approved WhatsApp template
-- 'payslip_ready' for that person: "your October 2026 payslip is ready, expect an email from payroll@". It rides on the same send paths as the email
-- (Send ready now, the schedule), so the mailer itself is not touched.
-- Rules, all checked here: staff_wa_config.enabled (the kill switch) must be ON, the template must be approved in Meta, the person must have a number on
-- staff_phones (matched by email) with wa_payroll on, and nobody gets it twice for a month. If any of these is not so, nothing is queued and the email
-- goes as it always has. The trigger swallows its own errors, so it can never stop a payslip email from being recorded.
-- The WhatsApp itself is sent by staff-wa-worker, inside the send window (09:00 to 20:59 Dubai); an email sent later in the evening gets its WhatsApp next morning.

create or replace function public.staff_wa_enqueue_payslip(p_email text, p_month date) returns text
language plpgsql security definer set search_path = public as $$
declare cfg staff_wa_config; t staff_wa_templates; s staff_phones; ph text; b text := 'payslip-' || to_char(p_month, 'YYYY-MM');
begin
  select * into cfg from staff_wa_config where id = 1;
  if not cfg.enabled then return 'off'; end if;
  select * into t from staff_wa_templates where key = 'payslip_ready';
  if not found or not t.approved then return 'template not approved'; end if;
  select * into s from staff_phones where lower(email) = lower(p_email) and wa_payroll limit 1;
  if not found then return 'no number'; end if;
  ph := regexp_replace(coalesce(s.phone, ''), '\D', '', 'g');
  if length(ph) < 9 or length(ph) > 15 then return 'bad number'; end if;
  if exists (select 1 from staff_wa_jobs j where not j.is_test and j.staff_id = s.id and j.tkey = t.key and j.batch = b and j.status in ('queued', 'sending', 'sent'))
    then return 'already queued'; end if;
  insert into staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by)
  values (s.id, t.kind, b, 'template', t.key, '+' || ph,  cfg.channel_id,
          array[staff_wa_first_name(s.name), to_char(p_month, 'FMMonth YYYY')],
          staff_wa_render(t.body, array[staff_wa_first_name(s.name), to_char(p_month, 'FMMonth YYYY')]), 'payslip email');
  return 'queued';
end $$;

create or replace function public.staff_wa_payslip_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
      perform public.staff_wa_enqueue_payslip(new.email, new.month);
    end if;
  exception when others then
    null;   -- never let the WhatsApp side stop the payslip record
  end;
  return new;
end $$;

drop trigger if exists staff_wa_payslip on public.payslip_sends;
create trigger staff_wa_payslip after insert or update of status on public.payslip_sends
  for each row execute function public.staff_wa_payslip_trg();

revoke all on function public.staff_wa_enqueue_payslip(text, date), public.staff_wa_payslip_trg() from public, anon, authenticated;
