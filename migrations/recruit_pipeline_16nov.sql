-- Recruitment: the hiring steps (Kate, 16 Nov 2026, "may ibat ibang statuses dapat for assistants / recep"). Run after recruit_hire.sql. Additive; one data move (offer -> offer_to_send).
--
-- Stages added to recruit_applicants.stage (a fail is the last status):
--   interview_pass   Interview done (pass)           interview_fail  Interview done (fail)
--   trade_test       Trade test scheduled (existing)   trade_fail      Trade test done (fail)       trade_pass  Trade test done (pass)
--   offer_to_send    For offer letter (to send)       offer_sent      For offer letter (sent)
--   start_pending    Finalise start date (pending)    start_accepted  Finalise start date (accepted, set by the applicant's own link)
--   hired            Hired (existing); start_accepted becomes hired by itself once the start date has passed (recruit_auto_hire, daily and on every page load)
-- New columns: stage_note (the trade test's when and where), accept_token (the applicant's own accept link; unguessable).
-- Functions: recruit_move (a step that carries a note or a start date), recruit_accept_link (the person's link token, Kate / Coach Emma),
--            recruit_accept (the applicant pressing the link; service role only, called by the edge function recruit-accept), recruit_auto_hire.
-- recruit_set_stage accepts the new stages; recruit_get also returns stage_note (both patched in place, nothing else in them changes).
-- Undo: put the old stage check back, drop the two columns and four functions, move offer_to_send rows back to offer, restore the two functions from recruit_hire.sql.

alter table public.recruit_applicants add column if not exists stage_note text;
alter table public.recruit_applicants add column if not exists accept_token uuid not null default gen_random_uuid();
create unique index if not exists recruit_applicants_accept_token_key on public.recruit_applicants (accept_token);

do $do$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.recruit_applicants'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%interview_booked%' loop
    execute format('alter table public.recruit_applicants drop constraint %I', c);
  end loop;
  alter table public.recruit_applicants add constraint recruit_applicants_stage_check check (stage in
    ('new', 'screening', 'interview_booked', 'interview_pass', 'interview_fail', 'trade_test', 'trade_pass', 'trade_fail', 'offer', 'offer_to_send', 'offer_sent',
     'start_pending', 'start_accepted', 'hired', 'not_now', 'rejected'));
end $do$;

update public.recruit_applicants set stage = 'offer_to_send' where stage = 'offer';

-- recruit_set_stage: the longer list
do $do$
declare d text := pg_get_functiondef('public.recruit_set_stage(uuid[], text)'::regprocedure);
begin
  if position('interview_pass' in d) = 0 then
    d := replace(d, '''interview_booked'', ''trade_test'', ''offer'', ''hired''',
      '''interview_booked'', ''interview_pass'', ''interview_fail'', ''trade_test'', ''trade_pass'', ''trade_fail'', ''offer'', ''offer_to_send'', ''offer_sent'', ''start_pending'', ''start_accepted'', ''hired''');
    if position('interview_pass' in d) = 0 then raise exception 'recruit_set_stage was not in the expected shape, nothing changed'; end if;
    execute d;
  end if;
end $do$;

-- recruit_get: also stage_note
do $do$
declare d text := pg_get_functiondef('public.recruit_get()'::regprocedure);
begin
  if position('''stage_note''' in d) = 0 then
    d := replace(d, '''start_date'', a.start_date', '''start_date'', a.start_date, ''stage_note'', a.stage_note');
    if position('''stage_note''' in d) = 0 then raise exception 'recruit_get was not in the expected shape, nothing changed'; end if;
    execute d;
  end if;
end $do$;

create or replace function public.recruit_move(p_id uuid, p_stage text, p_note text, p_start date) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_stage not in ('trade_test', 'start_pending') then raise exception 'unknown step'; end if;
  if p_stage = 'trade_test' and nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'put in when and where'; end if;
  if p_stage = 'start_pending' then
    if p_start is null then raise exception 'a start date is needed'; end if;
    if p_start < current_date - 30 or p_start > current_date + 366 then raise exception 'that start date looks wrong'; end if;
  end if;
  update public.recruit_applicants
     set stage = p_stage,
         stage_note = case when p_stage = 'trade_test' then left(btrim(p_note), 160) else stage_note end,
         start_date = case when p_stage = 'start_pending' then p_start else start_date end,
         decided_by = who, decided_at = now(),
         reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, who), updated_at = now()
   where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
end $$;

create or replace function public.recruit_accept_link(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard(); t uuid;
begin
  select accept_token into t from public.recruit_applicants where id = p_id;
  if t is null then raise exception 'no such applicant'; end if;
  return t::text;
end $$;

-- the applicant presses their link: only a person waiting on a start date moves, and only to accepted. Service role only (the edge function).
create or replace function public.recruit_accept(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select id, name, stage, start_date into a from public.recruit_applicants where accept_token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if a.stage in ('start_accepted', 'hired') then return jsonb_build_object('ok', true, 'already', true, 'name', a.name, 'start_date', a.start_date); end if;
  if a.stage <> 'start_pending' then return jsonb_build_object('ok', false, 'reason', 'not_waiting'); end if;
  update public.recruit_applicants set stage = 'start_accepted', decided_by = 'Applicant', decided_at = now(), updated_at = now() where id = a.id;
  return jsonb_build_object('ok', true, 'already', false, 'name', a.name, 'start_date', a.start_date);
end $$;

-- accepted becomes hired once the first day has passed (Dubai date)
create or replace function public.recruit_auto_hire() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.recruit_applicants
     set stage = 'hired', decided_by = 'Automatic', decided_at = now(), updated_at = now()
   where stage = 'start_accepted' and start_date is not null and start_date < (now() at time zone 'Asia/Dubai')::date;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.recruit_move(uuid, text, text, date) from public, anon;
revoke all on function public.recruit_accept_link(uuid) from public, anon;
revoke all on function public.recruit_accept(uuid) from public, anon, authenticated;
revoke all on function public.recruit_auto_hire() from public, anon;
grant execute on function public.recruit_move(uuid, text, text, date) to authenticated;
grant execute on function public.recruit_accept_link(uuid) to authenticated;
grant execute on function public.recruit_accept(uuid) to service_role;
grant execute on function public.recruit_auto_hire() to authenticated;

-- once a day at 04:30 Dubai, when the database has pg_cron (the page also asks on every load)
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('recruit-auto-hire', '30 0 * * *', 'select public.recruit_auto_hire()');
  end if;
end $do$;
