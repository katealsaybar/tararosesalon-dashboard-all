-- Payslips tab: what the WhatsApp that rides with each payslip email is doing (Kate, 30 Oct 2026: "isang send, dalawa").
-- The queueing itself is migrations/staff_wa_payslip.sql (a trigger on payslip_sends). This only READS, for the Payslips tab in the Upload Portal, so
-- Accounts can see that the WhatsApp goes with the email and whether it is switched on. Counts only: no name, number or message text leaves the database.
-- Level 4 (Accounts & Admin, old numbering) and above, the same people who open the Payslips tab; Staff Payroll WhatsApp itself stays Level 5.

create or replace function public.payslip_wa_status(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg staff_wa_config; t staff_wa_templates; b text := 'payslip-' || to_char(p_month, 'YYYY-MM'); emailed int; queued int; sent int; failed int;
begin
  if staff_wa_level() < 4 then raise exception 'Level 4 and above'; end if;
  select * into cfg from staff_wa_config where id = 1;
  select * into t from staff_wa_templates where key = 'payslip_ready';
  select count(*) into emailed from payslip_sends where month = p_month and status = 'sent';
  select count(*) filter (where status in ('queued', 'sending')),
         count(*) filter (where status = 'sent'),
         count(*) filter (where status = 'failed')
    into queued, sent, failed
    from staff_wa_jobs where tkey = 'payslip_ready' and batch = b and not is_test;
  return jsonb_build_object(
    'enabled', coalesce(cfg.enabled, false),
    'approved', coalesce(t.approved, false),
    'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to,
    'emailed', emailed, 'queued', queued, 'sent', sent, 'failed', failed,
    -- Emailed, but no WhatsApp queued or sent: no number on file, or the switch was off when the email went.
    'without', greatest(emailed - queued - sent - failed, 0));
end $$;

revoke all on function public.payslip_wa_status(date) from public, anon;
grant execute on function public.payslip_wa_status(date) to authenticated;
