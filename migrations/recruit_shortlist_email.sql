-- Recruitment: an automatic email to the applicant when a support-role applicant is shortlisted (Kate, 16 Nov 2026: "pag nag click dinshortlist coach emma, they will receive an
-- automated email saying to keep their lines open, our team will get in touch"; formatted, brand aligned, with the recruitment signature; the number that will call is left out on purpose).
-- Who: the same roles as the interviewer WhatsApp (recruit_settings.notify_roles: Front Desk / Reception, Hair Assistant, Other). Stylists and beauticians are Coach Emma's own invite.
-- How it works: the page builds the email (same formatted layout and the same signature as the No reply) and calls recruit_queue_email(); that only QUEUES one row in recruit_outbox.
-- A small separate Apps Script in the recruitment@ mailbox (apps-script/send-recruitment-mail.gs, gmail.send scope only, it cannot read mail) claims the rows every 5 minutes and sends them
-- FROM recruitment@, so the applicant sees the recruitment inbox and a reply lands there. The dashboard itself still never sends email and holds no mail password.
--   * OFF until recruit_settings.shortlist_email_enabled is true (starts false); the sender script is not installed yet either
--   * one email per applicant, ever (a second Shortlist or Invite again queues nothing); no email address or a bounced address queues nothing
--   * a Test row (Status drop-down) emails only the person who clicked, never the applicant, and can be repeated
--   * a send that fails is marked failed and never retried by itself (no double emails); a claim stuck in sending for 10 minutes is marked failed
-- recruit_queue_email(id, role, subject, html, text)   Recruitment page guard (recruit_guard)
-- recruit_outbox_claim(pass, n) / recruit_outbox_finish(pass, id, status, error)   the sender script, passworded like recruit_import (push_passes)
-- Undo: drop the three functions and the table recruit_outbox, delete the setting.

insert into public.recruit_settings (key, value) values ('shortlist_email_enabled', 'false'::jsonb) on conflict (key) do nothing;

create table if not exists public.recruit_outbox (
  id           bigserial primary key,
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  kind         text not null default 'shortlist',
  to_email     text not null,
  subject      text not null,
  html         text not null,
  text_body    text not null,
  is_test      boolean not null default false,
  status       text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  error        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  sent_at      timestamptz
);
create unique index if not exists recruit_outbox_one_live on public.recruit_outbox (applicant_id, kind) where not is_test and status in ('queued', 'sending', 'sent');
create index if not exists recruit_outbox_pick on public.recruit_outbox (status, created_at);
alter table public.recruit_outbox enable row level security;   -- no policies on purpose

create or replace function public.recruit_queue_email(p_id uuid, p_role text, p_subject text, p_html text, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  who text := public.recruit_guard();
  a public.recruit_applicants; roles jsonb; to_addr text;
begin
  select * into a from public.recruit_applicants where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  if p_subject is null or btrim(p_subject) = '' or length(p_subject) > 200 then raise exception 'bad subject'; end if;
  if p_html is null or length(p_html) > 120000 or p_text is null or length(p_text) > 20000 then raise exception 'bad email size'; end if;

  if a.is_test then
    -- a test goes only to the person who clicked (their own sign-in address)
    select lower(u.email) into to_addr from auth.users u where u.id = auth.uid();
    if to_addr is null then return jsonb_build_object('queued', 0, 'reason', 'no_own_address'); end if;
    insert into public.recruit_outbox (applicant_id, to_email, subject, html, text_body, is_test, created_by)
    values (a.id, to_addr, '[TEST] ' || p_subject, p_html, p_text, true, who);
    return jsonb_build_object('queued', 1, 'test', true);
  end if;

  if coalesce((select value from public.recruit_settings where key = 'shortlist_email_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  roles := coalesce((select value from public.recruit_settings where key = 'notify_roles'), '["Front Desk / Reception", "Hair Assistant", "Other"]'::jsonb);
  if p_role is null or not (roles ? p_role) then return jsonb_build_object('queued', 0, 'reason', 'role'); end if;
  if a.email is null or btrim(a.email) = '' or a.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('queued', 0, 'reason', 'no_email'); end if;
  if a.bounced then return jsonb_build_object('queued', 0, 'reason', 'bounced'); end if;
  begin
    insert into public.recruit_outbox (applicant_id, to_email, subject, html, text_body, created_by)
    values (a.id, lower(btrim(a.email)), p_subject, p_html, p_text, who);
  exception when unique_violation then
    return jsonb_build_object('queued', 0, 'reason', 'already_emailed');
  end;
  return jsonb_build_object('queued', 1);
end $$;

-- the sender script: take up to n queued emails (marks them sending), then report each one
create or replace function public.recruit_outbox_claim(p_pass uuid, p_n int default 5) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not exists (select 1 from public.push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  update public.recruit_outbox set status = 'failed', error = 'Interrupted while sending. Look in the recruitment@ Sent folder before you retry; it may have gone.'
    where status = 'sending' and claimed_at < now() - interval '10 minutes';
  with pick as (
    select id from public.recruit_outbox where status = 'queued' order by is_test desc, id limit greatest(1, least(coalesce(p_n, 5), 10)) for update skip locked
  ), upd as (
    update public.recruit_outbox o set status = 'sending', claimed_at = now() from pick where o.id = pick.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'to', u.to_email, 'subject', u.subject, 'html', u.html, 'text', u.text_body) order by u.id), '[]'::jsonb) into out from upd u;
  return out;
end $$;

create or replace function public.recruit_outbox_finish(p_pass uuid, p_id bigint, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_status not in ('sent', 'failed') then raise exception 'unknown status'; end if;
  update public.recruit_outbox set status = p_status, sent_at = case when p_status = 'sent' then now() else sent_at end, error = left(p_error, 300) where id = p_id and status = 'sending';
end $$;

revoke all on function public.recruit_queue_email(uuid, text, text, text, text), public.recruit_outbox_claim(uuid, int), public.recruit_outbox_finish(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.recruit_queue_email(uuid, text, text, text, text) to authenticated;
grant execute on function public.recruit_outbox_claim(uuid, int), public.recruit_outbox_finish(uuid, bigint, text, text) to anon, authenticated;
