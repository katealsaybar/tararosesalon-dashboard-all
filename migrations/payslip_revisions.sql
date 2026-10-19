-- Revised payslips sent from the site (Kate, 19 Oct 2026). Before, fixing a payslip meant Replace in the Upload Portal and then
-- replying by hand from payroll@'s Gmail with the new PDF and a pasted template. The payslip-mailer's `revised` action now sends
-- that email itself, and this table records each one: who got it, what the note said, and who sent it.
-- Nothing here is readable with the publishable key; only the edge function (service role) touches it.
create table if not exists public.payslip_revisions (
  id       bigserial primary key,
  month    date not null,
  staff_id uuid not null references public.perf_staff(id),
  email    text not null,
  what     text not null,
  sent_by  text not null,
  sent_at  timestamptz not null default now()
);
create index if not exists payslip_revisions_month_staff on public.payslip_revisions (month, staff_id);
alter table public.payslip_revisions enable row level security;
