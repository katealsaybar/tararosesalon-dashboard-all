-- APPLIED on gvijxenafoowajqktqvd, 25 Nov 2026 (Kate: "Apply and push"). Tried first in a transaction that rolled back.
-- Recruitment: Replies (tickets) and bell alerts that fire only once an email has really gone out (Kate, 25 Nov 2026: "a ticketing system for replying to them", and
-- "notify us if somebody did not pass the interview, passed, or is for a job offer; make sure to notify ONLY when the email is sent to the applicant").
-- Mockup approved the same day: docs/mockups/recruitment-replies.html in the cowork repo.
--
-- TWO KINDS OF TICKET, one table (recruit_tickets):
--   inbound  an applicant wrote to us. Opened by the mailbox reader (recruit_tickets_import, passworded like recruit_import). Closed when an email goes back to them: the Send button
--            with kind 'reply' (recruit_outbox_finish), or a message we sent by hand from the recruitment inbox (the reader sees our Sent folder), or "Close, no reply needed".
--   owed     a status was changed to a step that has an email (interview passed or not, trade test, offer letter, start date, welcome) and that email has not gone out. Opened by a trigger on
--            recruit_applicants.stage. Closed the moment recruit_outbox_finish reports that exact email SENT, or when the person moves to another step, or by hand.
--   Not created for Shortlist, Not now or Rejected (the shortlist email is sent in the same dialog, and a bulk No goes out by Bcc, so it would never close).
-- BELL ALERTS: recruit_outbox_finish, the moment the sender script reports 'sent' for a real (not test) email of kind interview_pass, interview_fail, trade_pass, trade_fail, offer_to_send or
--   offer_sent, writes a notice to each person ticked for that alert (setting alert_recipients, one list per alert: interview_pass, interview_fail, trade, offer). Clicking Passed does nothing;
--   queued does nothing; failed does nothing. Emails sent by hand in Gmail cannot be seen as a stage email, so they raise no alert.
-- tickets_from: replies older than this are not turned into tickets, so the backfill never floods the queue (set to 2 days before this is applied).
-- recruit_outbox_one_live no longer covers kind 'reply': several replies to one person are fine.
-- Nothing here sends mail. Undo: drop trigger recruit_ticket_stage on public.recruit_applicants; drop the functions named below and table public.recruit_tickets; put recruit_outbox_finish and
--   recruit_email_label back from recruit_send_email_19nov.sql; recreate recruit_outbox_one_live without "and kind <> 'reply'"; delete the settings tickets_from and alert_recipients.

insert into public.recruit_settings (key, value) values
  ('tickets_from', to_jsonb(now() - interval '2 days')),
  ('alert_recipients', jsonb_build_object(
      'interview_pass', coalesce((select jsonb_agg(lower(email)) from public.dashboard_users where name in ('Kate Alsaybar', 'Emma-Louise Usher')), '[]'::jsonb),
      'interview_fail', coalesce((select jsonb_agg(lower(email)) from public.dashboard_users where name in ('Kate Alsaybar', 'Emma-Louise Usher')), '[]'::jsonb),
      'offer',          coalesce((select jsonb_agg(lower(email)) from public.dashboard_users where name in ('Kate Alsaybar', 'Emma-Louise Usher')), '[]'::jsonb),
      'trade',          '[]'::jsonb))
on conflict (key) do nothing;

create table if not exists public.recruit_tickets (
  id           bigserial primary key,
  applicant_id uuid not null references public.recruit_applicants (id) on delete cascade,
  kind         text not null check (kind in ('inbound', 'owed')),
  email_kind   text,                       -- owed: the recruit_outbox kind that closes it
  msg_id       text,                       -- inbound: the Gmail message id (one ticket per message)
  subject      text,
  snippet      text,                       -- inbound: the first lines of what they wrote, quoted text removed
  opened_at    timestamptz not null default now(),
  owner_name   text,
  owner_email  text,
  status       text not null default 'open' check (status in ('open', 'closed')),
  closed_at    timestamptz,
  closed_by    text,
  close_reason text,                       -- sent, sent_by_hand, no_reply_needed, already_sent, stage_changed
  reopened_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists recruit_tickets_msg on public.recruit_tickets (msg_id) where kind = 'inbound' and msg_id is not null;
create unique index if not exists recruit_tickets_owed_open on public.recruit_tickets (applicant_id, email_kind) where kind = 'owed' and status = 'open';
create index if not exists recruit_tickets_pick on public.recruit_tickets (status, kind, opened_at);
create index if not exists recruit_tickets_person on public.recruit_tickets (applicant_id, status);
alter table public.recruit_tickets enable row level security;     -- no policies on purpose
revoke all on public.recruit_tickets from anon, authenticated;
revoke all on sequence public.recruit_tickets_id_seq from anon, authenticated;

-- ── the email that a step owes ─────────────────────────────────────────────────────────────────────────────
create or replace function public._recruit_stage_email_kind(p_stage text) returns text
language sql immutable as $f$
  select case p_stage
    when 'interview_pass' then 'interview_pass' when 'interview_fail' then 'interview_fail'
    when 'trade_test' then 'trade_test' when 'trade_pass' then 'trade_pass' when 'trade_fail' then 'trade_fail'
    when 'offer' then 'offer_to_send' when 'offer_to_send' then 'offer_to_send' when 'offer_sent' then 'offer_sent'
    when 'start_pending' then 'start_pending' when 'start_accepted' then 'start_accepted' when 'hired' then 'hired'
    else null end
$f$;

-- ── owed tickets: opened and closed by the status change itself, whichever function made it ────────────────────
create or replace function public.recruit_ticket_on_stage() returns trigger
language plpgsql security definer set search_path = public as $f$
declare k text;
begin
  if new.stage is not distinct from old.stage or coalesce(new.is_test, false) then return new; end if;
  -- leaving a step: the email that step owed is no longer owed
  update public.recruit_tickets set status = 'closed', closed_at = now(), closed_by = 'Status changed', close_reason = 'stage_changed'
   where applicant_id = new.id and kind = 'owed' and status = 'open';
  k := public._recruit_stage_email_kind(new.stage);
  if k is null then return new; end if;
  if exists (select 1 from public.recruit_outbox o where o.applicant_id = new.id and o.kind = k and not o.is_test and o.status in ('queued', 'sending', 'sent')) then return new; end if;
  insert into public.recruit_tickets (applicant_id, kind, email_kind, owner_name, owner_email)
  values (new.id, 'owed', k, new.assigned_to, new.assigned_email) on conflict do nothing;
  return new;
exception when others then
  return new;    -- a ticket problem must never stop a status change
end $f$;
revoke all on function public._recruit_stage_email_kind(text), public.recruit_ticket_on_stage() from public, anon, authenticated;
drop trigger if exists recruit_ticket_stage on public.recruit_applicants;
create trigger recruit_ticket_stage after update of stage on public.recruit_applicants for each row execute function public.recruit_ticket_on_stage();

-- ── inbound tickets: the mailbox reader sends replies and our own sent mail (kind reply / human_reply) ──────────
-- rows: [{kind, email, at, msg_id, subject, snippet}]. Never creates a person. Processed oldest first, so a reply and our answer in the same batch end closed.
create or replace function public.recruit_tickets_import(p_pass uuid, p_rows jsonb, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $f$
declare
  r jsonb; knd text; ts timestamptz; em text; nem text; mid text; ex public.recruit_applicants; from_ts timestamptz;
  n_open int := 0; n_closed int := 0; n_skip int := 0; n_unmatched int := 0; c int;
begin
  if not exists (select 1 from public.push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'at most 1000 rows per call'; end if;
  from_ts := coalesce((select (value #>> '{}')::timestamptz from public.recruit_settings where key = 'tickets_from'), now());

  for r in select e.v from jsonb_array_elements(p_rows) with ordinality as e(v, n)
            order by case when e.v->>'at' ~ '^\d{4}-' then (e.v->>'at')::timestamptz end nulls last, e.n
  loop
    knd := r->>'kind';
    if knd not in ('reply', 'human_reply') then n_skip := n_skip + 1; continue; end if;
    begin ts := coalesce(nullif(r->>'at', '')::timestamptz, now()); exception when others then ts := now(); end;
    em := nullif(lower(btrim(coalesce(r->>'email', ''))), '');
    nem := public.recruit_norm_email(em);
    mid := nullif(btrim(coalesce(r->>'msg_id', '')), '');
    if nem is null then n_skip := n_skip + 1; continue; end if;
    ex := null;
    select a.* into ex from public.recruit_applicants a join public.recruit_aliases al on al.applicant_id = a.id where al.kind = 'email' and al.value = nem limit 1;
    if ex.id is null then select * into ex from public.recruit_applicants where person_key = nem or lower(email) = em limit 1; end if;
    if ex.id is null or coalesce(ex.is_test, false) then n_unmatched := n_unmatched + 1; continue; end if;

    if knd = 'reply' then
      if ts < from_ts or mid is null then n_skip := n_skip + 1; continue; end if;
      if not p_dry then
        insert into public.recruit_tickets (applicant_id, kind, msg_id, subject, snippet, opened_at, owner_name, owner_email)
        values (ex.id, 'inbound', mid, left(btrim(coalesce(r->>'subject', '')), 150), left(btrim(coalesce(r->>'snippet', '')), 400), ts, ex.assigned_to, ex.assigned_email)
        on conflict do nothing;
        get diagnostics c = row_count; n_open := n_open + c;
      else n_open := n_open + 1; end if;
    else
      -- we wrote to them by hand: whatever was open before that mail is answered or sent
      if not p_dry then
        update public.recruit_tickets set status = 'closed', closed_at = now(), closed_by = 'Sent by hand', close_reason = 'sent_by_hand'
         where applicant_id = ex.id and status = 'open' and coalesce(reopened_at, opened_at) <= ts;
        get diagnostics c = row_count; n_closed := n_closed + c;
      end if;
    end if;
  end loop;
  return jsonb_build_object('dry', p_dry, 'opened', n_open, 'closed_by_mail', n_closed, 'skipped', n_skip, 'unmatched', n_unmatched);
end $f$;

-- ── the page ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.recruit_tickets_get() returns jsonb
language plpgsql stable security definer set search_path = public as $f$
declare em text := lower(coalesce(public.kb_me_email(), ''));
begin
  perform public.recruit_guard();
  return jsonb_build_object('me', em, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'applicant_id', t.applicant_id, 'kind', t.kind, 'email_kind', t.email_kind, 'subject', t.subject, 'snippet', t.snippet,
             'opened_at', t.opened_at, 'owner_name', t.owner_name, 'owner_email', t.owner_email, 'status', t.status, 'closed_at', t.closed_at, 'closed_by', t.closed_by,
             'reason', t.close_reason) order by t.opened_at)
    from (select * from public.recruit_tickets x where x.status = 'open' or x.closed_at > now() - interval '2 days' order by x.opened_at desc limit 400) t), '[]'::jsonb));
end $f$;

create or replace function public._recruit_team_member(p_email text) returns text
language sql stable security definer set search_path = public as $f$
  select u.name from public.dashboard_users u
   where lower(u.email) = lower(btrim(coalesce(p_email, ''))) and (u.level >= 5 or 'recruitment' = any (coalesce(u.extra_pages, '{}'::text[]))) limit 1
$f$;

create or replace function public.recruit_ticket_assign(p_id bigint, p_email text) returns void
language plpgsql security definer set search_path = public as $f$
declare who text := public.recruit_guard(); nm text;
begin
  if p_email is null or btrim(p_email) = '' then
    update public.recruit_tickets set owner_name = null, owner_email = null where id = p_id;
  else
    nm := public._recruit_team_member(p_email);
    if nm is null then raise exception 'not on the recruitment team'; end if;
    update public.recruit_tickets set owner_name = nm, owner_email = lower(btrim(p_email)) where id = p_id and status = 'open';
  end if;
end $f$;

create or replace function public.recruit_ticket_close(p_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $f$
declare who text := public.recruit_guard(); t public.recruit_tickets;
begin
  if p_reason not in ('no_reply_needed', 'already_sent') then raise exception 'unknown reason'; end if;
  update public.recruit_tickets set status = 'closed', closed_at = now(), closed_by = who, close_reason = p_reason where id = p_id and status = 'open' returning * into t;
  if t.id is not null then
    perform public.recruit_log(array[t.applicant_id], who, case when t.kind = 'inbound' then 'Closed their message: no reply needed' else 'Closed an owed email: already sent' end, false);
  end if;
end $f$;

create or replace function public.recruit_ticket_reopen(p_id bigint) returns void
language plpgsql security definer set search_path = public as $f$
declare who text := public.recruit_guard();
begin
  update public.recruit_tickets set status = 'open', closed_at = null, closed_by = null, close_reason = null, reopened_at = now() where id = p_id and status = 'closed';
end $f$;

create or replace function public.recruit_alert_set(p_kind text, p_email text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $f$
declare who text := public.recruit_guard(); cur jsonb; lst jsonb; em text := lower(btrim(coalesce(p_email, '')));
begin
  if p_kind not in ('interview_pass', 'interview_fail', 'trade', 'offer') then raise exception 'unknown alert'; end if;
  if public._recruit_team_member(em) is null then raise exception 'not on the recruitment team'; end if;
  cur := coalesce((select value from public.recruit_settings where key = 'alert_recipients'), '{}'::jsonb);
  lst := coalesce(cur -> p_kind, '[]'::jsonb) - em;       -- remove first, so it is never in twice
  if coalesce(p_on, false) then lst := lst || to_jsonb(em); end if;
  insert into public.recruit_settings (key, value, updated_at, updated_by) values ('alert_recipients', jsonb_set(cur, array[p_kind], lst, true), now(), who)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = who;
end $f$;

-- ── the sender reports back: this is where tickets close and the bell rings, and nowhere else ─────────────────────
create or replace function public.recruit_email_label(p_kind text) returns text
language sql immutable as $f$
  select case p_kind
    when 'shortlist'      then 'Shortlist (keep your line open)'
    when 'invite'         then 'Shortlist invite'
    when 'no'             then 'No'
    when 'reply'          then 'Reply'
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

drop index if exists public.recruit_outbox_one_live;
create unique index recruit_outbox_one_live on public.recruit_outbox (applicant_id, kind) where not is_test and kind <> 'reply' and status in ('queued', 'sending', 'sent');

create or replace function public.recruit_outbox_finish(p_pass uuid, p_id bigint, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = public as $f$
declare o record; lab text; akey text; recips jsonb; em text; a record; sender text;
begin
  if not exists (select 1 from public.push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_status not in ('sent', 'failed') then raise exception 'unknown status'; end if;
  update public.recruit_outbox set status = p_status, sent_at = case when p_status = 'sent' then now() else sent_at end, error = left(p_error, 300)
    where id = p_id and status = 'sending' returning id, applicant_id, kind, is_test, created_by into o;
  if found and not o.is_test then
    lab := coalesce(public.recruit_email_label(o.kind), o.kind);
    sender := coalesce(o.created_by, 'The recruitment sender');
    if p_status = 'sent' then
      perform public.recruit_log(array[o.applicant_id], sender, 'The ' || lab || ' email went out from the recruitment inbox', false);
      begin
        -- tickets: this exact owed email is done; a reply to their message also closes what they wrote
        update public.recruit_tickets set status = 'closed', closed_at = now(), closed_by = sender, close_reason = 'sent'
         where applicant_id = o.applicant_id and status = 'open' and ((kind = 'owed' and email_kind = o.kind) or (kind = 'inbound' and o.kind = 'reply'));
        -- the bell: only now that it has really gone, and only for these emails
        akey := case o.kind when 'interview_pass' then 'interview_pass' when 'interview_fail' then 'interview_fail' when 'trade_pass' then 'trade' when 'trade_fail' then 'trade'
                            when 'offer_to_send' then 'offer' when 'offer_sent' then 'offer' else null end;
        if akey is not null then
          select name into a from public.recruit_applicants where id = o.applicant_id;
          recips := coalesce((select value -> akey from public.recruit_settings where key = 'alert_recipients'), '[]'::jsonb);
          for em in select jsonb_array_elements_text(recips) loop
            perform public._notice_push('recruit_' || akey, o.id::text || ':' || em, em,
              lab || ': email sent',
              left(coalesce(nullif(btrim(a.name), ''), 'An applicant'), 80) || '. Sent from the recruitment inbox by ' || sender || '.',
              'reply', '/?view=recruitment&cand=' || o.applicant_id::text, 'Open the applicant', false);
          end loop;
        end if;
      exception when others then
        null;     -- a ticket or bell problem must never stop the sender reporting that the email went out
      end;
    else
      perform public.recruit_log(array[o.applicant_id], sender, 'The ' || lab || ' email did not send: ' || left(coalesce(p_error, 'unknown error'), 120));
    end if;
  end if;
end $f$;

revoke all on function public.recruit_tickets_import(uuid, jsonb, boolean), public.recruit_tickets_get(), public._recruit_team_member(text), public.recruit_ticket_assign(bigint, text),
  public.recruit_ticket_close(bigint, text), public.recruit_ticket_reopen(bigint), public.recruit_alert_set(text, text, boolean) from public, anon, authenticated;
grant execute on function public.recruit_tickets_import(uuid, jsonb, boolean) to anon, authenticated;
grant execute on function public.recruit_tickets_get(), public.recruit_ticket_assign(bigint, text), public.recruit_ticket_close(bigint, text), public.recruit_ticket_reopen(bigint),
  public.recruit_alert_set(text, text, boolean) to authenticated;
