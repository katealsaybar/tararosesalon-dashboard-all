-- Complaint triage, batch 2, steps 3 to 8 (Kate, 29 Oct 2026). Run after complaint_code_dupes.sql.
--
-- Who can be tagged   complaint_taggers: only people who work in Log a Complaint. A small table you edit as data (add a row, set active = false).
--                     cmp_people_options() reads it, with whether each person is on the site now.
-- Online dots         site_presence + site_ping(): the site tells the database it is open (at most every 2 minutes per person, one row per person,
--                     so no per-minute logging). Green = on the site now (the page also joins a Realtime Presence channel), grey = not on it with the
--                     time of the last visit, hollow = no confirmed sign-in yet. It only informs: it never skips anyone in the chain.
-- Tag, any time       cmp_tag(): copied (one message, batched, quiet hours respected, by the worker) or involved (recorded, never messaged).
-- Notes with @        cmp_note(): a note on the complaint; each @name in it is tagged as copied.
-- Assign              cmp_assign(): leadership, the branch coordinator and whoever has it hand it to a person on the list; the clock stops and the
--                     person is told. cmp_pass() lets the assignee hand it back to the chain.
-- Urgent numbers      cmp_urgent_numbers(): only for the person who has just logged a skin reaction or injury, and only when
--                     complaint_triage_config.show_urgent_numbers is true (false until Kate says yes).

alter table public.complaint_triage_config
  add column if not exists show_urgent_numbers boolean not null default false,
  add column if not exists tag_batch_minutes int not null default 10;
alter table public.complaint_triage_events add column if not exists to_email text;
alter table public.complaint_people
  add column if not exists by_email text, add column if not exists by_name text,
  add column if not exists added_at timestamptz not null default now(), add column if not exists seen_at timestamptz;
create index if not exists complaint_people_email on public.complaint_people (lower(email)) where email is not null;

-- ---------------------------------------------------------------- who can be tagged
create table if not exists public.complaint_taggers (
  email text primary key check (email = lower(email)),
  name text not null,
  short_name text not null,
  grp text not null check (grp in ('leadership', 'educator', 'coordinator', 'reception', 'callcentre')),
  role text not null,
  branch_code text,
  active boolean not null default true,
  note text,
  sort int not null default 100
);
alter table public.complaint_taggers enable row level security;

insert into public.complaint_taggers (email, name, short_name, grp, role, branch_code, note, sort) values
  ('kate@tararosesalon.com', 'Kate Alsaybar', 'Kate', 'leadership', 'Leadership', null, null, 10),
  ('haxthausen.partners@gmail.com', 'Mette Haxthausen', 'Mette', 'leadership', 'Leadership', null, null, 20),
  ('emmalouise@tararosesalon.com', 'Emma Usher', 'Coach Emma', 'leadership', 'Leadership', null, null, 30),
  ('ashleighfairgrieve@hotmail.com', 'Ashleigh Fairgrieve', 'Ashleigh', 'educator', 'Hair educator', null, null, 10),
  ('emmawilliamson2107@gmail.com', 'Emma Williamson', 'Emma W', 'educator', 'Hair educator', null, null, 20),
  ('monashona030@gmail.com', 'Mona Soba', 'Mona', 'educator', 'Beauty educator (to be confirmed)', null, 'On the nail and skin chain. Kate has not confirmed her yet (29 Oct 2026).', 30),
  ('cristine.tararose@gmail.com', 'Cristine Bracamonte', 'Cristine', 'coordinator', 'Coordinator, Saadiyat', 'SAA', null, 10),
  ('jho.tararose@gmail.com', 'Jhoana Cairel', 'Jho', 'coordinator', 'Coordinator, Khalifa City A', 'KCA', null, 20),
  ('shiela.tararose@gmail.com', 'Shiela Avena', 'Shiela', 'coordinator', 'Coordinator, Motor City', 'MC', null, 30),
  ('frances.tararose@gmail.com', 'Frances Pia Sergio', 'Frances', 'coordinator', 'Coordinator, Al Quoz', 'AQ', null, 40),
  ('hazel.alcala@outlook.com', 'Hazel Alcala', 'Hazel', 'callcentre', 'Call centre', null, null, 10),
  ('belle.tararose@gmail.com', 'Christabelle Bustos', 'Belle', 'callcentre', 'Call centre team lead', null, null, 20)
on conflict (email) do nothing;

-- receptionists of every branch: Team Home staff list, category Receptionist, active, with an email. Josil Ararao is terminated, so she is left out.
-- Receptionists who are only in Phorest (no email) cannot be picked yet. kb_staff has no branch, so only the one noted as Bahrain gets one.
insert into public.complaint_taggers (email, name, short_name, grp, role, branch_code, sort)
select lower(s.email), s.name, split_part(trim(s.name), ' ', 1), 'reception',
       case when s.note ilike '%Bahrain%' then 'Reception, Bahrain' else 'Reception' end,
       case when s.note ilike '%Bahrain%' then 'BAH' end, 50
  from public.kb_staff s
 where s.category = 'Receptionist' and s.active and s.email is not null and s.name not ilike 'Josil%'
on conflict (email) do nothing;

-- ---------------------------------------------------------------- presence
create table if not exists public.site_presence (email text primary key, last_seen timestamptz not null default now());
alter table public.site_presence enable row level security;

create or replace function public.site_ping() returns void
language plpgsql security definer set search_path = '' as $$
declare me text := lower(coalesce(public.kb_me_email(), ''));
begin
  if me = '' then return; end if;
  insert into public.site_presence as sp (email, last_seen) values (me, now())
    on conflict (email) do update set last_seen = now() where sp.last_seen < now() - interval '2 minutes';
end $$;
revoke all on function public.site_ping() from public, anon;
grant execute on function public.site_ping() to authenticated;

-- ---------------------------------------------------------------- names
create or replace function public.cmp_email_name(p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select t.short_name from public.complaint_taggers t where t.email = lower(coalesce(p_email, ''))),
    (select coalesce(r.short_name, r.name) from public.complaint_notify_recipients r where lower(r.email) = lower(coalesce(p_email, '')) limit 1),
    (select s.name from public.kb_staff s where lower(s.email) = lower(coalesce(p_email, '')) limit 1),
    split_part(coalesce(p_email, 'someone'), '@', 1))
$$;
revoke all on function public.cmp_email_name(text) from public, anon;
grant execute on function public.cmp_email_name(text) to authenticated;

-- ---------------------------------------------------------------- who can open a complaint
-- Copied people can open it (the client's name and number stay hidden, see cmp_reveal). Involved people are only recorded: they cannot open it.
-- Whoever it has been assigned to can open it too.
create or replace function public.cmp_can(p_id bigint) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare c record; me text := lower(coalesce(public.kb_me_email(), '#none'));
begin
  if me = '#none' then return false; end if;
  select id, branch_code, submitted_email into c from public.client_complaints where id = p_id;
  if not found then return false; end if;
  return public.cmp_leader()
    or lower(coalesce(c.submitted_email, '')) = me
    or public.cmp_coord(c.branch_code)
    or exists (select 1 from public.complaint_triage_events e
                where e.complaint_id = p_id and e.kind in ('notified', 'cc') and e.recipient_id = any (public.cmp_my_ids()))
    or exists (select 1 from public.complaint_people pp where pp.complaint_id = p_id and pp.kind = 'cc' and lower(coalesce(pp.email, '')) = me)
    or exists (select 1 from public.complaint_triage t where t.complaint_id = p_id and t.state = 'claimed' and t.claimed_by = any (public.cmp_my_ids()));
end $$;

-- ---------------------------------------------------------------- the pickers' list
create or replace function public.cmp_people_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.kb_me_email() is null or coalesce(public.kb_level(), 0) < 1 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', t.name, 'short', t.short_name, 'email', t.email, 'role', t.role, 'grp', t.grp, 'branch', t.branch_code,
             'last_seen', p.last_seen,
             'ever', exists (select 1 from auth.users u where lower(u.email) = t.email and u.email_confirmed_at is not null))
           order by case t.grp when 'leadership' then 1 when 'educator' then 2 when 'coordinator' then 3 when 'reception' then 4 else 5 end, t.sort, t.name)
      from public.complaint_taggers t left join public.site_presence p on p.email = t.email
     where t.active), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- the form: who was involved, who else should know (right after the save)
create or replace function public.cmp_set_people(p_id bigint, p_involved jsonb, p_cc jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c record; me text := lower(coalesce(public.kb_me_email(), '#none')); nm text := public.cmp_me_name(); j jsonb; em text; tg record;
begin
  select submitted_email, submitted_at into c from public.client_complaints where id = p_id;
  if not found or not (lower(coalesce(c.submitted_email, '')) = me or public.cmp_leader()) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  if c.submitted_at < now() - interval '30 minutes' then return jsonb_build_object('ok', false, 'why', 'it is too late to change this here, use Tag on the complaint'); end if;
  -- check everyone first, so nothing is half saved
  for j in select * from jsonb_array_elements(coalesce(p_cc, '[]'::jsonb)) loop
    em := lower(trim(coalesce(j->>'email', '')));
    if not exists (select 1 from public.complaint_taggers t where t.email = em and t.active) then
      return jsonb_build_object('ok', false, 'why', coalesce(nullif(j->>'name', ''), 'someone') || ' is not on the list of people who can be tagged');
    end if;
  end loop;
  for j in select * from jsonb_array_elements(coalesce(p_involved, '[]'::jsonb)) loop
    em := lower(trim(coalesce(j->>'email', '')));
    if em <> '' and not exists (select 1 from public.complaint_taggers t where t.email = em and t.active) then
      return jsonb_build_object('ok', false, 'why', coalesce(nullif(j->>'name', ''), 'someone') || ' is not on the list of people who can be tagged');
    end if;
    if em = '' and length(trim(coalesce(j->>'name', ''))) < 2 then return jsonb_build_object('ok', false, 'why', 'write a name for who was involved'); end if;
  end loop;
  delete from public.complaint_people where complaint_id = p_id;
  for j in select * from jsonb_array_elements(coalesce(p_involved, '[]'::jsonb)) loop
    em := lower(trim(coalesce(j->>'email', '')));
    select * into tg from public.complaint_taggers t where t.email = em;
    insert into public.complaint_people (complaint_id, kind, name, email, by_email, by_name)
      values (p_id, 'involved', left(coalesce(tg.short_name, trim(j->>'name')), 80), nullif(em, ''), me, nm);
  end loop;
  for j in select * from jsonb_array_elements(coalesce(p_cc, '[]'::jsonb)) loop
    em := lower(trim(j->>'email'));
    select * into tg from public.complaint_taggers t where t.email = em;
    insert into public.complaint_people (complaint_id, kind, name, email, by_email, by_name) values (p_id, 'cc', tg.short_name, em, me, nm);
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- tag, any time
create or replace function public.cmp_tag_inner(p_id bigint, p_email text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tg record; k text := case p_kind when 'copied' then 'cc' when 'involved' then 'involved' end;
        me text := lower(coalesce(public.kb_me_email(), '#none')); nm text := public.cmp_me_name();
begin
  if k is null then return jsonb_build_object('ok', false, 'why', 'pick copied or involved'); end if;
  select * into tg from public.complaint_taggers where email = lower(trim(coalesce(p_email, ''))) and active;
  if not found then return jsonb_build_object('ok', false, 'why', 'that person is not on the list of people who can be tagged'); end if;
  if exists (select 1 from public.complaint_people where complaint_id = p_id and kind = k and lower(coalesce(email, '')) = tg.email) then
    return jsonb_build_object('ok', true, 'already', true, 'name', tg.short_name);
  end if;
  insert into public.complaint_people (complaint_id, kind, name, email, by_email, by_name) values (p_id, k, tg.short_name, tg.email, me, nm);
  if k = 'cc' then
    -- handled = true when you tag yourself: nothing to send
    insert into public.complaint_triage_events (complaint_id, kind, by_email, detail, handled, to_email) values (p_id, 'tagged', me, nm, tg.email = me, tg.email);
  else
    insert into public.complaint_triage_events (complaint_id, kind, by_email, detail, to_email) values (p_id, 'tagged_involved', me, nm, tg.email);
  end if;
  return jsonb_build_object('ok', true, 'name', tg.short_name);
end $$;
revoke all on function public.cmp_tag_inner(bigint, text, text) from public, anon, authenticated;

create or replace function public.cmp_tag(p_id bigint, p_email text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  return public.cmp_tag_inner(p_id, p_email, p_kind);
end $$;

-- a note on the complaint; p_mentions is the list of emails picked after an @ (each becomes "copied", with one message)
create or replace function public.cmp_note(p_id bigint, p_text text, p_mentions jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := lower(coalesce(public.kb_me_email(), '#none')); nm text := public.cmp_me_name(); e jsonb; r jsonb; names text[] := '{}'; tx text := left(trim(coalesce(p_text, '')), 2000);
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  if length(tx) < 2 then return jsonb_build_object('ok', false, 'why', 'write the note first'); end if;
  insert into public.client_complaint_updates (complaint_id, by_name, by_email, note, status) values (p_id, nm, me, tx, 'note');
  for e in select * from jsonb_array_elements(coalesce(p_mentions, '[]'::jsonb)) loop
    r := public.cmp_tag_inner(p_id, e #>> '{}', 'copied');
    if (r->>'ok')::boolean then names := names || (r->>'name'); end if;
  end loop;
  return jsonb_build_object('ok', true, 'tagged', to_jsonb(names));
end $$;

create or replace function public.cmp_seen(p_id bigint) returns void
language sql security definer set search_path = '' as $$
  update public.complaint_people set seen_at = now()
   where complaint_id = p_id and kind = 'cc' and seen_at is null and lower(coalesce(email, '')) = lower(coalesce(public.kb_me_email(), '#none'))
$$;

-- ---------------------------------------------------------------- assign
create or replace function public.cmp_assign(p_id bigint, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c record; tg record; rid bigint; t record; me text := lower(coalesce(public.kb_me_email(), '#none')); nm text := public.cmp_me_name();
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  select * into c from public.client_complaints where id = p_id and submitted_at is not null;
  if not found then return jsonb_build_object('ok', false, 'why', 'only a complaint logged on the form can be assigned'); end if;
  if c.duplicate_of is not null then return jsonb_build_object('ok', false, 'why', 'it is linked as a duplicate of another complaint'); end if;
  if c.status <> 'open' then return jsonb_build_object('ok', false, 'why', 'it is closed'); end if;
  if not public.cmp_manage(p_id) then return jsonb_build_object('ok', false, 'why', 'only leadership, the coordinator or whoever has it can assign it'); end if;
  select * into tg from public.complaint_taggers where email = lower(trim(coalesce(p_email, ''))) and active;
  if not found then return jsonb_build_object('ok', false, 'why', 'that person is not on the list'); end if;
  -- the triage keeps one row per person in complaint_notify_recipients; a person without one gets a quiet one (no emails, no alerts on every complaint)
  select id into rid from public.complaint_notify_recipients where lower(email) = tg.email limit 1;
  if rid is null then
    insert into public.complaint_notify_recipients (name, email, email_on, wa_on, short_name) values (tg.name, tg.email, false, false, tg.short_name) returning id into rid;
  end if;
  select * into t from public.complaint_triage where complaint_id = p_id for update;
  if not found then
    insert into public.complaint_triage (complaint_id, grp, state, step, claimed_by, claimed_at, due_at) values (p_id, public.cmp_group(c.complaint_type), 'claimed', 1, rid, now(), null);
  else
    update public.complaint_triage set state = 'claimed', claimed_by = rid, claimed_at = now(), due_at = null where complaint_id = p_id;
  end if;
  update public.client_complaints set responsible = tg.short_name where id = p_id;
  insert into public.client_complaint_updates (complaint_id, by_name, by_email, note, status, responsible)
    values (p_id, nm, me, 'Assigned to ' || tg.short_name || ' by ' || nm || '. The clock stopped.', 'note', tg.short_name);
  insert into public.complaint_triage_events (complaint_id, kind, recipient_id, by_email, detail, handled, to_email)
    values (p_id, 'assigned', rid, me, nm, tg.email = me, tg.email);
  return jsonb_build_object('ok', true, 'name', tg.short_name);
end $$;

-- "Not mine, pass it on": from the chain as before; from an assignment it goes back to the chain (the next tick moves it on)
create or replace function public.cmp_pass(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t record; me bigint[] := public.cmp_my_ids(); who bigint; br text;
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  select * into t from public.complaint_triage where complaint_id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'why', 'nothing to pass'); end if;
  if t.state = 'claimed' then
    if not (t.claimed_by is not null and t.claimed_by = any (me)) then return jsonb_build_object('ok', false, 'why', 'it is not with you right now'); end if;
    if exists (select 1 from public.client_complaints where id = p_id and first_response_at is not null) then
      return jsonb_build_object('ok', false, 'why', 'you have already replied to her, ask leadership or the coordinator to assign it'); end if;
    update public.complaint_triage set state = 'active', claimed_by = null, claimed_at = null, due_at = now() where complaint_id = p_id;
    insert into public.complaint_triage_events (complaint_id, kind, recipient_id, by_email, detail) values (p_id, 'passed', t.claimed_by, public.kb_me_email(), 'gave it back');
    return jsonb_build_object('ok', true);
  end if;
  if t.state <> 'active' then return jsonb_build_object('ok', false, 'why', 'nothing to pass'); end if;
  select branch_code into br from public.client_complaints where id = p_id;
  select r.recipient_id into who from public.complaint_triage_routes r
   where r.grp = t.grp and r.step = t.step and r.recipient_id = any (me) and (r.branch_code is null or r.branch_code = br) limit 1;
  if who is null then return jsonb_build_object('ok', false, 'why', 'it is not with you right now'); end if;
  update public.complaint_triage set due_at = now() where complaint_id = p_id;
  insert into public.complaint_triage_events (complaint_id, kind, recipient_id, by_email, detail) values (p_id, 'passed', who, public.kb_me_email(), null);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- urgent: the numbers, only for the person who has just logged one
create or replace function public.cmp_urgent_numbers(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record; flag boolean; out jsonb;
begin
  select complaint_type, submitted_email, submitted_at into c from public.client_complaints where id = p_id and submitted_at is not null;
  if not found or c.complaint_type <> 'skin_reaction_or_injury' or lower(coalesce(c.submitted_email, '')) <> lower(coalesce(public.kb_me_email(), '#none'))
     or c.submitted_at < now() - interval '60 minutes' then return null; end if;
  select show_urgent_numbers into flag from public.complaint_triage_config where id = 1;
  select jsonb_agg(jsonb_build_object('name', coalesce(r.short_name, r.name),
           'phone', case when coalesce(flag, false) then (select sp.phone from public.staff_phones sp where lower(sp.email) = lower(r.email) limit 1) end) order by r.id)
    into out
    from public.complaint_triage_routes tr join public.complaint_notify_recipients r on r.id = tr.recipient_id
   where tr.grp = 'urgent' and tr.step = 1 and tr.branch_code is null and coalesce(r.short_name, '') in ('Coach Emma', 'Mette');
  return jsonb_build_object('enabled', coalesce(flag, false), 'people', coalesce(out, '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- the timeline of one complaint
create or replace function public.cmp_timeline(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare dry boolean := coalesce((select dry_run from public.complaint_triage where complaint_id = p_id), false);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', x.at, 'kind', x.kind, 'by', x.who, 'text', x.txt) order by x.at desc, x.ord desc)
    from (
      select u.at, case when u.status = 'responded' then 'reply' else 'note' end as kind, u.by_name as who, u.note as txt, 1 as ord
        from public.client_complaint_updates u where u.complaint_id = p_id
      union all
      select c.submitted_at, 'logged', c.submitted_by, 'Logged by ' || coalesce(c.submitted_by, 'someone') || '.', 0
        from public.client_complaints c where c.id = p_id and c.submitted_at is not null
      union all
      select e.at, e.kind, null,
        case e.kind
          when 'notified' then 'Message sent to ' || coalesce(public.cmp_rname(e.recipient_id), 'someone') || case when dry then ' (dry run, it went to Kate).' else '.' end
          when 'cc' then coalesce(public.cmp_rname(e.recipient_id), e.detail, 'Someone') || ' was told about it (copied).'
          when 'escalated' then 'Moved on to ' || coalesce(public.cmp_rname(e.recipient_id), 'the next person') || '.'
          when 'passed' then coalesce(public.cmp_rname(e.recipient_id), 'Someone') || ' passed it on.'
          when 'claimed' then coalesce(public.cmp_rname(e.recipient_id), 'Someone') || ' took it. The clock stopped.'
          when 'tagged' then coalesce(e.detail, 'Someone') || ' tagged ' || public.cmp_email_name(e.to_email) || ' (copied).'
          when 'tagged_involved' then coalesce(e.detail, 'Someone') || ' marked ' || public.cmp_email_name(e.to_email) || ' as involved. They are not messaged.'
          when 'tag_sent' then 'A message went to ' || public.cmp_email_name(e.to_email) || ' about being tagged' || case when dry then ' (dry run, it went to Kate).' else '.' end
          when 'assigned_sent' then 'A message went to ' || public.cmp_email_name(e.to_email) || ' about being assigned' || case when dry then ' (dry run, it went to Kate).' else '.' end
          when 'failed' then 'A message did not reach ' || coalesce(public.cmp_rname(e.recipient_id), public.cmp_email_name(e.to_email), 'someone')
                             || coalesce(': ' || regexp_replace(e.detail, '\+?\d[\d ]{6,}\d', '[number]', 'g'), '.')
          when 'stuck' then 'Nobody took it. It needs a person now.'
          when 'remind_reply' then 'Reminder sent: no reply to the client yet (day 2).'
          when 'remind_close' then 'Reminder sent: still open at day 7.'
          when 'question_sent' then 'The question was sent to the person who logged it.'
        end, 1
        from public.complaint_triage_events e
       where e.complaint_id = p_id
         and e.kind in ('notified', 'cc', 'escalated', 'passed', 'claimed', 'tagged', 'tagged_involved', 'tag_sent', 'assigned_sent', 'failed', 'stuck', 'remind_reply', 'remind_close', 'question_sent')
    ) x where x.txt is not null), '[]'::jsonb);
end $$;
revoke all on function public.cmp_timeline(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------- what the complaint page reads (replaces the batch 1 version)
create or replace function public.cmp_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record; t record; me bigint[] := public.cmp_my_ids(); rev boolean; cur bigint[]; mine boolean; later boolean; out jsonb; em text := lower(coalesce(public.kb_me_email(), '#none'));
begin
  if not public.cmp_can(p_id) then return null; end if;
  select * into c from public.client_complaints where id = p_id;
  select * into t from public.complaint_triage where complaint_id = p_id;
  rev := public.cmp_reveal(p_id);
  if t.complaint_id is not null and t.state = 'active' then
    select coalesce(array_agg(recipient_id), '{}') into cur from public.complaint_triage_routes
     where grp = t.grp and step = t.step and (branch_code is null or branch_code = c.branch_code);
    mine := cur && me;
    later := exists (select 1 from public.complaint_triage_routes r where r.grp = t.grp and r.step > t.step and r.recipient_id = any (me)
                      and (r.branch_code is null or r.branch_code = c.branch_code));
  end if;
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'duplicate_of', c.duplicate_of,
    'duplicate_code', (select dd.code from public.client_complaints dd where dd.id = c.duplicate_of),
    'branch', c.branch_code, 'type', c.complaint_type, 'detail', c.detail, 'status', c.status,
    'event_date', c.event_date, 'complaint_date', coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date),
    'by', c.submitted_by, 'by_at', c.submitted_at, 'stylists', c.stylists, 'services', c.services, 'responsible', c.responsible,
    'client', case when rev then c.client_name end, 'phone', case when rev then c.client_phone end, 'revealed', rev,
    'first_response_at', c.first_response_at, 'resolved_at', c.resolved_at,
    'reply_due', (coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date) + 2),
    'close_due', (coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date) + 7),
    'needs_revisit', public.cq_needs_revisit(c.complaint_type, c.resolution),
    'triage', case when t.complaint_id is null then null else jsonb_build_object(
        'grp', t.grp, 'state', t.state, 'step', t.step, 'due_at', t.due_at, 'dry_run', t.dry_run,
        'claimed_at', t.claimed_at,
        'claimed_by', (select coalesce(short_name, name) from public.complaint_notify_recipients where id = t.claimed_by),
        'mine', coalesce(mine, false), 'can_claim', coalesce(mine or later, false), 'can_pass', coalesce(mine, false) or (t.state = 'claimed' and t.claimed_by = any (me) and c.first_response_at is null),
        'i_claimed', t.claimed_by is not null and t.claimed_by = any (me),
        'holder', public.cmp_holder(p_id),
        'next', (select coalesce(r.short_name, r.name) from public.complaint_triage_routes tr join public.complaint_notify_recipients r on r.id = tr.recipient_id
                  where tr.grp = t.grp and tr.step = t.step + 1 and (tr.branch_code is null or tr.branch_code = c.branch_code) order by r.id limit 1)) end,
    'people', coalesce((select jsonb_agg(jsonb_build_object('kind', case pp.kind when 'cc' then 'copied' else 'involved' end, 'name', pp.name, 'email', pp.email, 'by', pp.by_name, 'at', pp.added_at) order by pp.id)
                          from public.complaint_people pp where pp.complaint_id = p_id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object('at', u.at, 'by', u.by_name, 'note', u.note) order by u.at, u.id)
                           from public.client_complaint_updates u where u.complaint_id = p_id), '[]'::jsonb),
    'timeline', public.cmp_timeline(p_id),
    'tagged_me', (select jsonb_build_object('by', pp.by_name, 'at', pp.added_at) from public.complaint_people pp
                   where pp.complaint_id = p_id and pp.kind = 'cc' and lower(coalesce(pp.email, '')) = em and pp.by_name is not null order by pp.id desc limit 1),
    'can_manage', public.cmp_manage(p_id),
    'is_filer', lower(coalesce(c.submitted_email, '')) = em,
    'file_count', (select count(*) from public.client_complaint_files f where f.complaint_id = p_id),
    'dupes', coalesce((select jsonb_agg(jsonb_build_object('code', d.code, 'holder', d.holder, 'by_phone', d.by_phone,
                          'text', public.cq_dupe_text(d.event_date, d.branch_code, d.src_logged, d.submitted_by, d.status)))
                         from public.cq_dupes(c.client_name, c.branch_code, c.event_date, c.client_phone) d where d.id <> p_id and d.code is not null), '[]'::jsonb),
    'me', jsonb_build_object('email', em, 'name', public.cmp_me_name())
  ) into out;
  return out;
end $$;

-- ---------------------------------------------------------------- My complaints (replaces the batch 1 version): adds who holds it and a dot for "you were tagged"
create or replace function public.cmp_my_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me bigint[] := public.cmp_my_ids(); em text := lower(coalesce(public.kb_me_email(), '#none')); out jsonb;
begin
  if public.kb_me_email() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by (x->>'rank')::int, x->>'at' desc), '[]'::jsonb) into out
  from (
    select jsonb_build_object(
      'id', c.id, 'code', c.code, 'branch', c.branch_code, 'type', c.complaint_type, 'detail', left(coalesce(c.detail, ''), 140), 'status', c.status,
      'at', c.submitted_at, 'state', t.state, 'due_at', t.due_at, 'dry_run', t.dry_run,
      'claimed_by', (select coalesce(short_name, name) from public.complaint_notify_recipients where id = t.claimed_by),
      'holder', public.cmp_holder(c.id),
      'waiting_on_me', t.state = 'active' and exists (select 1 from public.complaint_triage_routes r where r.grp = t.grp and r.step = t.step and r.recipient_id = any (me) and (r.branch_code is null or r.branch_code = c.branch_code)),
      'tagged_me', exists (select 1 from public.complaint_people pp where pp.complaint_id = c.id and pp.kind = 'cc' and lower(coalesce(pp.email, '')) = em and pp.seen_at is null and pp.by_name is not null),
      'flag', case when c.status = 'open' then public.cq_flag(c.status, coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date), c.first_response_at) end,
      'rank', case when t.state = 'active' and exists (select 1 from public.complaint_triage_routes r where r.grp = t.grp and r.step = t.step and r.recipient_id = any (me) and (r.branch_code is null or r.branch_code = c.branch_code)) then 0
                   when t.state = 'stuck' then 1
                   when exists (select 1 from public.complaint_people pp where pp.complaint_id = c.id and pp.kind = 'cc' and lower(coalesce(pp.email, '')) = em and pp.seen_at is null and pp.by_name is not null) then 2
                   when c.status = 'open' then 3 else 4 end) as x
    from public.client_complaints c
    join public.complaint_triage t on t.complaint_id = c.id
    where c.submitted_at is not null and c.duplicate_of is null and public.cmp_can(c.id)
    order by c.submitted_at desc limit 60
  ) q;
  return out;
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function public.cmp_people_options(), public.cmp_set_people(bigint, jsonb, jsonb), public.cmp_tag(bigint, text, text), public.cmp_note(bigint, text, jsonb),
  public.cmp_seen(bigint), public.cmp_assign(bigint, text), public.cmp_pass(bigint), public.cmp_urgent_numbers(bigint), public.cmp_get(bigint), public.cmp_my_list() from public, anon;
grant execute on function public.cmp_people_options(), public.cmp_set_people(bigint, jsonb, jsonb), public.cmp_tag(bigint, text, text), public.cmp_note(bigint, text, jsonb),
  public.cmp_seen(bigint), public.cmp_assign(bigint, text), public.cmp_pass(bigint), public.cmp_urgent_numbers(bigint), public.cmp_get(bigint), public.cmp_my_list() to authenticated;
