-- Recruitment: a real Send button for every email the page drafts (Kate, 19 Nov 2026: ate Jho and ate Frans can open the Recruitment page but have no access to the
-- recruitment@ mailbox, so they could only copy the email, never send it).
-- It reuses the queue and the send-only sender that already exist (migrations/recruit_shortlist_email.sql, apps-script/send-recruitment-mail.gs): the page asks the database to QUEUE
-- one email, and the small script that lives inside the recruitment@ mailbox sends it FROM recruitment@ (it runs AS that account, so there is no mail password anywhere: not in the
-- browser, not in the repo, not in Supabase). The sent copy lands in recruitment@'s Sent folder and a reply comes back to the recruitment@ inbox.
--
--   recruit_send_email(id, kind, subject, html, text, test)   the Send button. Guard: recruit_guard() (Level 5, or the 'recruitment' page), the same as every recruit_* function.
--       * the ADDRESS is read from the person's row here, never taken from the browser, so a page can only ever email the person on the card
--       * a bounced or missing address sends nothing
--       * one real email per person per kind (shortlist, invite, no, interview_pass, ...): a second press says who sent it and when (the unique index recruit_outbox_one_live)
--       * a failed send can be tried again; "Send me a test" (test = true) and a Test row go only to the signed-in person's own address, marked [TEST], and can be repeated
--       * OFF for real people until recruit_settings.send_email_enabled is true (starts false); tests to your own address work while it is off
--   recruit_email_state(id)   what was queued or sent to that person (the dialog shows "Sent on 19 Nov by Jho" and hides Send)
--   recruit_outbox_finish     now also writes the result into "Who changed what" (the person's history): who pressed Send is logged when they press it, the sender's result when it reports
-- Nothing here sends mail by itself. Undo: drop the two functions and recruit_email_label, delete the setting, and put recruit_outbox_finish back from recruit_shortlist_email.sql.

insert into public.recruit_settings (key, value) values ('send_email_enabled', 'false'::jsonb) on conflict (key) do nothing;

create or replace function public.recruit_email_label(p_kind text) returns text
language sql immutable as $f$
  select case p_kind
    when 'shortlist'      then 'Shortlist (keep your line open)'
    when 'invite'         then 'Shortlist invite'
    when 'no'             then 'No'
    when 'interview_pass' then 'Interview passed'
    when 'interview_fail' then 'Interview not passed'
    when 'trade_test'     then 'Trade test'
    when 'trade_fail'     then 'Trade test not passed'
    when 'trade_pass'     then 'Trade test passed'
    when 'offer_to_send'  then 'Offer letter coming'
    when 'offer_sent'     then 'Offer letter sent'
    when 'start_pending'  then 'Start date'
    when 'start_accepted' then 'Start date confirmed'
    when 'hired'          then 'Welcome'
    else null end
$f$;

create or replace function public.recruit_send_email(p_id uuid, p_kind text, p_subject text, p_html text, p_text text, p_test boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $f$
declare
  who text := public.recruit_guard();
  a public.recruit_applicants; to_addr text; lab text; oid bigint; prev record;
begin
  lab := public.recruit_email_label(p_kind);
  if lab is null then raise exception 'unknown email'; end if;
  select * into a from public.recruit_applicants where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
  if p_subject is null or btrim(p_subject) = '' or length(p_subject) > 200 then raise exception 'bad subject'; end if;
  if p_html is null or length(p_html) > 120000 or p_text is null or btrim(p_text) = '' or length(p_text) > 20000 then raise exception 'bad email size'; end if;

  if coalesce(p_test, false) or a.is_test then
    -- a test goes only to the person who pressed it (their own sign-in address), never to the applicant
    select lower(u.email) into to_addr from auth.users u where u.id = auth.uid();
    if to_addr is null then return jsonb_build_object('queued', 0, 'reason', 'no_own_address'); end if;
    insert into public.recruit_outbox (applicant_id, kind, to_email, subject, html, text_body, is_test, created_by)
    values (a.id, p_kind, to_addr, '[TEST] ' || p_subject, p_html, p_text, true, who) returning id into oid;
    perform public.recruit_log(array[a.id], who, 'Sent themselves a test of the ' || lab || ' email', false);
    return jsonb_build_object('queued', 1, 'test', true, 'id', oid, 'to', to_addr);
  end if;

  if coalesce((select value from public.recruit_settings where key = 'send_email_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  if a.email is null or btrim(a.email) = '' or a.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('queued', 0, 'reason', 'no_email'); end if;
  if a.bounced then return jsonb_build_object('queued', 0, 'reason', 'bounced'); end if;

  begin
    insert into public.recruit_outbox (applicant_id, kind, to_email, subject, html, text_body, created_by)
    values (a.id, p_kind, lower(btrim(a.email)), p_subject, p_html, p_text, who) returning id into oid;
  exception when unique_violation then
    select o.created_by, o.created_at, o.sent_at, o.status into prev from public.recruit_outbox o
      where o.applicant_id = a.id and o.kind = p_kind and not o.is_test and o.status in ('queued', 'sending', 'sent') order by o.id desc limit 1;
    return jsonb_build_object('queued', 0, 'reason', 'already_sent', 'by', prev.created_by, 'at', coalesce(prev.sent_at, prev.created_at), 'status', prev.status);
  end;
  perform public.recruit_log(array[a.id], who, 'Pressed Send on the ' || lab || ' email to the applicant');
  return jsonb_build_object('queued', 1, 'id', oid, 'to', lower(btrim(a.email)));
end $f$;

create or replace function public.recruit_email_state(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $f$
declare out jsonb;
begin
  perform public.recruit_guard();
  select coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'status', o.status, 'by', o.created_by, 'at', o.created_at, 'sent_at', o.sent_at, 'error', o.error, 'to', o.to_email) order by o.id desc), '[]'::jsonb)
    into out from public.recruit_outbox o where o.applicant_id = p_id and not o.is_test;
  return out;
end $f$;

-- the sender reports back: sent or failed. Same as before, plus a line in the person's history (a test is not logged).
create or replace function public.recruit_outbox_finish(p_pass uuid, p_id bigint, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = public as $f$
declare o record; lab text;
begin
  if not exists (select 1 from public.push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_status not in ('sent', 'failed') then raise exception 'unknown status'; end if;
  update public.recruit_outbox set status = p_status, sent_at = case when p_status = 'sent' then now() else sent_at end, error = left(p_error, 300)
    where id = p_id and status = 'sending' returning applicant_id, kind, is_test, created_by into o;
  if found and not o.is_test then
    lab := coalesce(public.recruit_email_label(o.kind), o.kind);
    if p_status = 'sent' then
      perform public.recruit_log(array[o.applicant_id], coalesce(o.created_by, 'The recruitment sender'), 'The ' || lab || ' email went out from the recruitment inbox', false);
    else
      perform public.recruit_log(array[o.applicant_id], coalesce(o.created_by, 'The recruitment sender'), 'The ' || lab || ' email did not send: ' || left(coalesce(p_error, 'unknown error'), 120));
    end if;
  end if;
end $f$;

revoke all on function public.recruit_email_label(text), public.recruit_send_email(uuid, text, text, text, text, boolean), public.recruit_email_state(uuid) from public, anon;
grant execute on function public.recruit_send_email(uuid, text, text, text, text, boolean), public.recruit_email_state(uuid) to authenticated;
