-- The welcome email that asks every stylist and beautician to sign in once (Kate, 19 Oct 2026), sent in bulk from the Upload Portal's
-- Payslips tab (payslip-mailer action `welcome`). It goes to the active hair and beauty team with an email, skips anyone who has already
-- signed in, and never goes twice to the same person.
-- Nothing here is readable with the publishable key; only the edge function (service role) touches it. No names or emails in this file.

-- One row per person once their welcome has gone. 'sending' is written before the email and turned into 'sent' after it, like payslip_sends,
-- so two presses never email the same person; a 'sending' row left behind means "check payroll@'s Sent folder".
create table if not exists public.staff_welcome_sends (
  staff_id uuid primary key references public.perf_staff(id),
  email    text not null,
  status   text not null default 'sending' check (status in ('sending', 'sent')),
  sent_at  timestamptz not null default now(),
  sent_by  text not null
);
alter table public.staff_welcome_sends enable row level security;

-- Who on the performance list has signed in at least once (same test as perf_lock_status). Service role only: the mailer asks it, nobody else.
create or replace function public.perf_signed_in_emails() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(lower(trim(p.email))), '{}'::text[])
    from public.perf_staff p
   where p.active and p.email is not null
     and exists (select 1 from auth.users u where lower(u.email) = lower(trim(p.email)) and u.last_sign_in_at is not null)
$$;
revoke all on function public.perf_signed_in_emails() from public, anon, authenticated;
grant execute on function public.perf_signed_in_emails() to service_role;
