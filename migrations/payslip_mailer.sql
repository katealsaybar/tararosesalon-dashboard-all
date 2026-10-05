-- Payslip emails sent from the site (Kate, 5 Oct 2026). Replaces the Staff Payslips
-- Apps Script: the payslip-mailer edge function sends from payroll@ over Gmail SMTP,
-- and these tables hold what the script kept in its Script Properties.
-- Nothing here is readable with the publishable key; only the edge function
-- (service role) touches them.

-- One row per person per month once their email has gone. 'sending' is written
-- before the email and turned into 'sent' after, so two runs never email the same
-- person; a 'sending' row left behind means "check payroll@'s Sent folder".
create table if not exists public.payslip_sends (
  month    date not null,
  staff_id uuid not null references public.perf_staff(id),
  email    text not null,
  status   text not null default 'sending' check (status in ('sending', 'sent')),
  sent_at  timestamptz not null default now(),
  sent_by  text not null,
  primary key (month, staff_id)
);
alter table public.payslip_sends enable row level security;

-- When each month's emails go out (Kate, 5 Oct 2026: "it won't always be Monday").
-- Accounts pick the date and time in the Upload Portal; the schedule below checks
-- every 10 minutes. No row, or a cancelled one, means nothing goes by itself.
-- done_at is set once a due send has emailed everyone who was ready; payslips
-- uploaded after that go with the portal's Send ready now.
create table if not exists public.payslip_schedule (
  month   date primary key,
  send_at timestamptz not null,
  set_by  text not null,
  set_at  timestamptz not null default now(),
  done_at timestamptz
);
alter table public.payslip_schedule enable row level security;

-- Who pressed what, shown under the portal's buttons.
create table if not exists public.payslip_mailer_log (
  id   bigserial primary key,
  at   timestamptz not null default now(),
  who  text not null,
  what text not null
);
alter table public.payslip_mailer_log enable row level security;

-- September 2026 went out from the Apps Script (payroll@, Mon 5 Oct 2026): all 48
-- with a payslip, per payroll@'s Sent folder. Recorded so it never goes again.
insert into public.payslip_sends (month, staff_id, email, status, sent_at, sent_by)
select p.month, s.id, s.email, 'sent', '2026-10-05 03:15:00+00', 'Apps Script (before the site)'
from public.payslips p join public.perf_staff s on s.id = p.staff_id
where p.month = '2026-09-01' and s.email is not null
on conflict do nothing;

-- The schedule calls the function with this secret.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'payslip_cron_secret', 'payslip-mailer schedule')
where not exists (select 1 from vault.secrets where name = 'payslip_cron_secret');

create or replace function public.payslip_cron_ok(p_secret text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'payslip_cron_secret' and decrypted_secret = p_secret)
$$;
revoke all on function public.payslip_cron_ok(text) from public, anon, authenticated;
grant execute on function public.payslip_cron_ok(text) to service_role;

create or replace function public.payslip_cron_call(p_action text) returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/payslip-mailer',
    body := jsonb_build_object('action', p_action,
              'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'payslip_cron_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 120000
  )
$$;
revoke all on function public.payslip_cron_call(text) from public, anon, authenticated;

-- Every 10 minutes: send any month whose time has come (the function is only called
-- then). A run stops before the function's time limit and the next one carries on.
select cron.unschedule(jobname) from cron.job where jobname like 'payslip-%';
select cron.schedule('payslip-due', '*/10 * * * *', $$ select public.payslip_cron_call('due') where exists (select 1 from public.payslip_schedule where done_at is null and send_at <= now()) $$);
