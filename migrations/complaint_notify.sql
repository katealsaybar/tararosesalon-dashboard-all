-- Client complaint notifications (Kate, 22 Oct 2026): when a complaint is logged on the Client Complaints page, Mette and Emma Coach get an
-- email and a text. The insert trigger posts to the complaint-notify edge function (the same pattern as dashboard_invite), which reads
-- complaint_notify_recipients, sends the email by SMTP and the text through Twilio, and writes every attempt to complaint_notify_log.
--
-- Recipients (names, emails, phone numbers) live only in complaint_notify_recipients: RLS on, no policies, so only the service role and the
-- security definer functions read it. Add or change them in the SQL editor:
--   insert into public.complaint_notify_recipients (name, email, phone) values ('Name', 'name@example.com', '+9715XXXXXXXX');
--   update public.complaint_notify_recipients set sms_on = false where name = 'Name';      -- email only
-- Send one again by hand:        select public.complaint_notify(<complaint id>);
-- Send a test to one recipient:  select public.complaint_notify_test(<recipient id>);
-- Replies land in net._http_response; what was sent, skipped or failed is in complaint_notify_log.
--
-- Edge function secrets (Supabase, Edge Functions, Secrets; set by Kate, never pasted into chat):
--   NOTIFY_SMTP_USER, NOTIFY_SMTP_PASS   the Gmail account the email goes out from (noreply@) and its App Password
--   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   TWILIO_FROM is a Twilio number, an alphanumeric sender id, or a Messaging Service SID (MG...)
-- Until a channel's secrets are set, that channel is logged as skipped and nothing else breaks.

create table if not exists public.complaint_notify_recipients (
  id bigserial primary key,
  name text not null,
  email text,
  phone text,
  email_on boolean not null default true,
  sms_on boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now());
alter table public.complaint_notify_recipients enable row level security;

create table if not exists public.complaint_notify_log (
  id bigserial primary key,
  complaint_id bigint,
  recipient text,
  channel text,
  status text,
  error text,
  at timestamptz not null default now());
alter table public.complaint_notify_log enable row level security;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'complaint_hook_secret', 'complaint-notify edge function')
where not exists (select 1 from vault.secrets where name = 'complaint_hook_secret');

create or replace function public.complaint_hook_ok(p_secret text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'complaint_hook_secret' and decrypted_secret = p_secret)
$$;
revoke all on function public.complaint_hook_ok(text) from public, anon, authenticated;
grant execute on function public.complaint_hook_ok(text) to service_role;

create or replace function public.complaint_notify(p_id bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/complaint-notify',
    body := jsonb_build_object('complaint_id', p_id,
              'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'complaint_hook_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_id;
  return v_id;
end $$;
revoke all on function public.complaint_notify(bigint) from public, anon, authenticated;

create or replace function public.complaint_notify_test(p_recipient_id bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/complaint-notify',
    body := jsonb_build_object('test', true, 'recipient_id', p_recipient_id,
              'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'complaint_hook_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_id;
  return v_id;
end $$;
revoke all on function public.complaint_notify_test(bigint) from public, anon, authenticated;

-- only a complaint logged from the page (submitted_at set) notifies; the Phorest notes never do
create or replace function public.client_complaints_notify_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.complaint_notify(new.id);
  exception when others then
    raise warning 'complaint notify for % failed: %', new.id, sqlerrm;   -- never block the log
  end;
  return new;
end $$;
revoke all on function public.client_complaints_notify_trg() from public, anon, authenticated;

drop trigger if exists client_complaints_notify on public.client_complaints;
create trigger client_complaints_notify after insert on public.client_complaints
  for each row when (new.submitted_at is not null) execute function public.client_complaints_notify_trg();
