-- Complaint triage (Kate, 29 Oct 2026): a complaint logged on Log a Complaint goes to a first responder by type, with 3 hours to take it
-- before it moves to the next person. Tap to claim, pass it on, ask the filer, tag people involved. Built in dry run first.
-- Everything here is read and written only by the security definer functions below and by the complaint-triage edge function
-- (service role): the tables have RLS on and no policies.
--
-- Who gets it (complaint_triage_routes, edit as data):
--   hair      colour_result, cut_result            Emma W, Ashleigh, Coach Emma, Mette
--   nailskin  nail_service, treatment_result       Jho, Mona, Coach Emma, Mette
--   general   staff_attitude                       Coach Emma, Mette, Kate
--   urgent    skin_reaction_or_injury              Coach Emma, Mette, Kate and the branch coordinator, all at once
--   minor     everything else                      a daily digest, no clock
-- Switches live in complaint_triage_config (one row): enabled, dry_run (messages go to dry_run_to only, steps last dry_minutes),
-- pilot_branches (null = every branch), working hours, the approved WhatsApp template names.

create table if not exists public.complaint_triage_config (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  dry_run boolean not null default true,
  dry_run_to bigint references public.complaint_notify_recipients(id),
  dry_minutes int not null default 2,
  step_minutes int not null default 180,
  hours_from int not null default 9,
  hours_to int not null default 22,
  pilot_branches text[],
  enabled_from timestamptz,
  link_base text not null default 'https://trk-salon-os.com',
  template_alert text,
  template_escalated text,
  template_fyi text
);
alter table public.complaint_triage_config enable row level security;
insert into public.complaint_triage_config (id, dry_run_to, link_base)
select 1, (select id from public.complaint_notify_recipients where name = 'Kate Alsaybar' limit 1),
       'https://complaint-wa-notify.trs-dashboard-staging.pages.dev'
where not exists (select 1 from public.complaint_triage_config);

-- Jho and Mona answer nail and skin complaints. Not emailed about every complaint (email_on false); only the triage reaches them.
insert into public.complaint_notify_recipients (name, email, email_on, wa_on)
select 'Jhoana Cairel (Jho)', 'jho.tararose@gmail.com', false, false
where not exists (select 1 from public.complaint_notify_recipients where lower(email) = 'jho.tararose@gmail.com');
insert into public.complaint_notify_recipients (name, email, email_on, wa_on)
select 'Cristine Bracamonte (Saadiyat coordinator)', 'cristine.tararose@gmail.com', false, false
where not exists (select 1 from public.complaint_notify_recipients where lower(email) = 'cristine.tararose@gmail.com');
insert into public.complaint_notify_recipients (name, email, email_on, wa_on)
select 'Shiela Avena (Motor City coordinator)', 'shiela.tararose@gmail.com', false, false
where not exists (select 1 from public.complaint_notify_recipients where lower(email) = 'shiela.tararose@gmail.com');
insert into public.complaint_notify_recipients (name, email, email_on, wa_on)
select 'Frances Sergio (Al Quoz coordinator)', 'frances.tararose@gmail.com', false, false
where not exists (select 1 from public.complaint_notify_recipients where lower(email) = 'frances.tararose@gmail.com');
insert into public.complaint_notify_recipients (name, email, email_on, wa_on)
select 'Mona Soba', 'monashona030@gmail.com', false, false
where not exists (select 1 from public.complaint_notify_recipients where lower(email) = 'monashona030@gmail.com');

create table if not exists public.complaint_triage_routes (
  id bigserial primary key,
  grp text not null check (grp in ('hair', 'nailskin', 'general', 'urgent')),
  step int not null,
  recipient_id bigint not null references public.complaint_notify_recipients(id),
  branch_code text           -- null = every branch; a branch code = only that branch's complaints (the coordinators on urgent ones)
);
alter table public.complaint_triage_routes enable row level security;
insert into public.complaint_triage_routes (grp, step, recipient_id, branch_code)
select g, s, r.id, b from (values
  ('hair', 1, 'emma w', null), ('hair', 2, 'ashleigh', null), ('hair', 3, 'emma usher', null), ('hair', 4, 'mette', null),
  ('nailskin', 1, 'jhoana', null), ('nailskin', 2, 'mona', null), ('nailskin', 3, 'emma usher', null), ('nailskin', 4, 'mette', null),
  ('general', 1, 'emma usher', null), ('general', 2, 'mette', null), ('general', 3, 'kate', null),
  ('urgent', 1, 'emma usher', null), ('urgent', 1, 'mette', null), ('urgent', 1, 'kate', null),
  ('urgent', 1, 'cristine', 'SAA'), ('urgent', 1, 'jhoana', 'KCA'), ('urgent', 1, 'shiela', 'MC'), ('urgent', 1, 'frances', 'AQ')
) v(g, s, k, b)
join public.complaint_notify_recipients r on lower(r.name) like k || '%'
where not exists (select 1 from public.complaint_triage_routes);

create table if not exists public.complaint_triage (
  complaint_id bigint primary key references public.client_complaints(id) on delete cascade,
  grp text not null,
  state text not null default 'active' check (state in ('active', 'claimed', 'stuck', 'minor', 'done')),
  step int not null default 1,
  step_started_at timestamptz not null default now(),
  due_at timestamptz,
  claimed_by bigint references public.complaint_notify_recipients(id),
  claimed_at timestamptz,
  dry_run boolean not null default true,
  started_at timestamptz not null default now()
);
alter table public.complaint_triage enable row level security;

create table if not exists public.complaint_triage_events (
  id bigserial primary key,
  complaint_id bigint not null,
  at timestamptz not null default now(),
  kind text not null,          -- notified, cc, escalated, passed, claimed, replied, question, failed, stuck, digest
  recipient_id bigint,
  by_email text,
  detail text,
  handled boolean not null default true
);
create index if not exists complaint_triage_events_c on public.complaint_triage_events (complaint_id, id);
alter table public.complaint_triage_events enable row level security;

create table if not exists public.complaint_people (
  id bigserial primary key,
  complaint_id bigint not null references public.client_complaints(id) on delete cascade,
  kind text not null check (kind in ('involved', 'cc')),
  name text not null,
  email text
);
create index if not exists complaint_people_c on public.complaint_people (complaint_id);
alter table public.complaint_people enable row level security;

-- ---------------------------------------------------------------- helpers
create or replace function public.cmp_group(p_type text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_type in ('colour_result', 'cut_result') then 'hair'
    when p_type in ('nail_service', 'treatment_result') then 'nailskin'
    when p_type = 'staff_attitude' then 'general'
    when p_type = 'skin_reaction_or_injury' then 'urgent'
    else 'minor' end
$$;

create or replace function public.cmp_my_ids() returns bigint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id), '{}') from public.complaint_notify_recipients
   where lower(email) = lower(coalesce(public.kb_me_email(), '#none'))
$$;

create or replace function public.cmp_leader() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.kb_level(), 0) >= 3
$$;

create or replace function public.cmp_coord(p_branch text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.kb_positions p
     where lower(p.email) = lower(coalesce(public.kb_me_email(), '#none'))
       and p.position ilike '%coordinator%'
       and p.position ilike '%' || case p_branch when 'SAA' then 'Saadiyat' when 'KCA' then 'Khalifa' when 'MC' then 'Motor' when 'AQ' then 'Al Quoz' when 'BAH' then 'Bahrain' else '#none' end || '%')
$$;

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
    or exists (select 1 from public.complaint_people pp where pp.complaint_id = p_id and lower(coalesce(pp.email, '')) = me);
end $$;

-- the client's name and number show to the person who took it, the filer, the coordinator and leadership
create or replace function public.cmp_reveal(p_id bigint) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare c record; t record; me text := lower(coalesce(public.kb_me_email(), '#none'));
begin
  select id, branch_code, submitted_email into c from public.client_complaints where id = p_id;
  if not found then return false; end if;
  select claimed_by into t from public.complaint_triage where complaint_id = p_id;
  return public.cmp_leader() or lower(coalesce(c.submitted_email, '')) = me or public.cmp_coord(c.branch_code)
    or (t.claimed_by is not null and t.claimed_by = any (public.cmp_my_ids()));
end $$;

-- ---------------------------------------------------------------- what the responder's page calls
create or replace function public.cmp_get(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record; t record; me bigint[] := public.cmp_my_ids(); rev boolean; cur bigint[]; mine boolean; later boolean; out jsonb;
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
    'id', c.id, 'branch', c.branch_code, 'type', c.complaint_type, 'detail', c.detail, 'status', c.status,
    'event_date', c.event_date, 'complaint_date', coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date),
    'by', c.submitted_by, 'by_at', c.submitted_at, 'stylists', c.stylists, 'services', c.services,
    'client', case when rev then c.client_name end, 'phone', case when rev then c.client_phone end, 'revealed', rev,
    'first_response_at', c.first_response_at, 'resolved_at', c.resolved_at,
    'reply_due', (coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date) + 2),
    'close_due', (coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date) + 7),
    'needs_revisit', public.cq_needs_revisit(c.complaint_type, c.resolution),
    'triage', case when t.complaint_id is null then null else jsonb_build_object(
        'grp', t.grp, 'state', t.state, 'step', t.step, 'due_at', t.due_at, 'dry_run', t.dry_run,
        'claimed_at', t.claimed_at,
        'claimed_by', (select name from public.complaint_notify_recipients where id = t.claimed_by),
        'mine', coalesce(mine, false), 'can_claim', coalesce(mine or later, false), 'can_pass', coalesce(mine, false),
        'i_claimed', t.claimed_by is not null and t.claimed_by = any (me),
        'next', (select r.name from public.complaint_triage_routes tr join public.complaint_notify_recipients r on r.id = tr.recipient_id
                  where tr.grp = t.grp and tr.step = t.step + 1 and (tr.branch_code is null or tr.branch_code = c.branch_code) order by r.id limit 1)) end,
    'people', coalesce((select jsonb_agg(jsonb_build_object('kind', pp.kind, 'name', pp.name) order by pp.id) from public.complaint_people pp where pp.complaint_id = p_id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(jsonb_build_object('at', u.at, 'by', u.by_name, 'note', u.note) order by u.at, u.id)
                           from public.client_complaint_updates u where u.complaint_id = p_id), '[]'::jsonb)
  ) into out;
  return out;
end $$;

create or replace function public.cmp_my_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me bigint[] := public.cmp_my_ids(); out jsonb;
begin
  if public.kb_me_email() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by (x->>'rank')::int, x->>'at' desc), '[]'::jsonb) into out
  from (
    select jsonb_build_object(
      'id', c.id, 'branch', c.branch_code, 'type', c.complaint_type, 'detail', left(coalesce(c.detail, ''), 140), 'status', c.status,
      'at', c.submitted_at, 'state', t.state, 'due_at', t.due_at, 'dry_run', t.dry_run,
      'claimed_by', (select name from public.complaint_notify_recipients where id = t.claimed_by),
      'waiting_on_me', t.state = 'active' and exists (select 1 from public.complaint_triage_routes r where r.grp = t.grp and r.step = t.step and r.recipient_id = any (me) and (r.branch_code is null or r.branch_code = c.branch_code)),
      'flag', case when c.status = 'open' then public.cq_flag(c.status, coalesce(c.complaint_date, (c.submitted_at at time zone 'Asia/Dubai')::date), c.first_response_at) end,
      'rank', case when t.state = 'active' and exists (select 1 from public.complaint_triage_routes r where r.grp = t.grp and r.step = t.step and r.recipient_id = any (me) and (r.branch_code is null or r.branch_code = c.branch_code)) then 0
                   when t.state = 'stuck' then 1 when c.status = 'open' then 2 else 3 end) as x
    from public.client_complaints c
    join public.complaint_triage t on t.complaint_id = c.id
    where c.submitted_at is not null and public.cmp_can(c.id)
    order by c.submitted_at desc limit 60
  ) q;
  return out;
end $$;

create or replace function public.cmp_claim(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t record; me bigint[] := public.cmp_my_ids(); who bigint; br text;
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  select * into t from public.complaint_triage where complaint_id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'why', 'not under triage'); end if;
  select branch_code into br from public.client_complaints where id = p_id;
  if t.state = 'claimed' then
    return jsonb_build_object('ok', false, 'why', 'already taken by ' || coalesce((select name from public.complaint_notify_recipients where id = t.claimed_by), 'someone'));
  end if;
  if t.state not in ('active', 'stuck') then return jsonb_build_object('ok', false, 'why', 'nothing to take'); end if;
  select r.recipient_id into who from public.complaint_triage_routes r
   where r.grp = t.grp and r.recipient_id = any (me) and (r.branch_code is null or r.branch_code = br) and (t.state = 'stuck' or r.step >= t.step)
   order by r.step limit 1;
  if who is null then return jsonb_build_object('ok', false, 'why', 'this one is not with you yet'); end if;
  update public.complaint_triage set state = 'claimed', claimed_by = who, claimed_at = now(), due_at = null where complaint_id = p_id;
  update public.client_complaints set responsible = (select name from public.complaint_notify_recipients where id = who)
   where id = p_id and coalesce(responsible, '') = '';
  insert into public.complaint_triage_events (complaint_id, kind, recipient_id, by_email, detail)
    values (p_id, 'claimed', who, public.kb_me_email(), null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cmp_pass(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t record; me bigint[] := public.cmp_my_ids(); who bigint; br text;
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  select * into t from public.complaint_triage where complaint_id = p_id for update;
  if not found or t.state <> 'active' then return jsonb_build_object('ok', false, 'why', 'nothing to pass'); end if;
  select branch_code into br from public.client_complaints where id = p_id;
  select r.recipient_id into who from public.complaint_triage_routes r
   where r.grp = t.grp and r.step = t.step and r.recipient_id = any (me) and (r.branch_code is null or r.branch_code = br) limit 1;
  if who is null then return jsonb_build_object('ok', false, 'why', 'it is not with you right now'); end if;
  update public.complaint_triage set due_at = now() where complaint_id = p_id;   -- the next tick moves it on
  insert into public.complaint_triage_events (complaint_id, kind, recipient_id, by_email, detail)
    values (p_id, 'passed', who, public.kb_me_email(), null);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cmp_replied(p_id bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t record; me bigint[] := public.cmp_my_ids(); nm text;
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  select * into t from public.complaint_triage where complaint_id = p_id;
  if not (public.cmp_leader() or (t.claimed_by is not null and t.claimed_by = any (me))) then
    return jsonb_build_object('ok', false, 'why', 'take it first');
  end if;
  nm := coalesce((select name from public.complaint_notify_recipients where id = any (me) order by id limit 1), public.kb_me_email());
  insert into public.client_complaint_updates (complaint_id, by_name, by_email, note)
    values (p_id, nm, public.kb_me_email(), left(coalesce(nullif(trim(p_note), ''), 'Replied to the client.'), 2000));
  update public.client_complaints set first_response_at = coalesce(first_response_at, now()) where id = p_id;
  insert into public.complaint_triage_events (complaint_id, kind, recipient_id, by_email, detail)
    values (p_id, 'replied', t.claimed_by, public.kb_me_email(), left(coalesce(p_note, ''), 300));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cmp_ask(p_id bigint, p_q text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nm text;
begin
  if not public.cmp_can(p_id) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  if coalesce(trim(p_q), '') = '' then return jsonb_build_object('ok', false, 'why', 'write the question first'); end if;
  nm := coalesce((select name from public.complaint_notify_recipients where id = any (public.cmp_my_ids()) order by id limit 1), public.kb_me_email());
  insert into public.client_complaint_updates (complaint_id, by_name, by_email, note)
    values (p_id, nm, public.kb_me_email(), 'Question for the person who logged it: ' || left(trim(p_q), 1500));
  insert into public.complaint_triage_events (complaint_id, kind, by_email, detail, handled)
    values (p_id, 'question', public.kb_me_email(), left(trim(p_q), 500), false);
  return jsonb_build_object('ok', true);
end $$;

-- the form calls this right after the complaint is saved; the worker waits 45 seconds before it starts, so the tags are in first
create or replace function public.cmp_set_people(p_id bigint, p_involved jsonb, p_cc jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c record; me text := lower(coalesce(public.kb_me_email(), '#none')); j jsonb;
begin
  select submitted_email into c from public.client_complaints where id = p_id;
  if not found or not (lower(coalesce(c.submitted_email, '')) = me or public.cmp_leader()) then return jsonb_build_object('ok', false, 'why', 'not allowed'); end if;
  delete from public.complaint_people where complaint_id = p_id;
  for j in select * from jsonb_array_elements(coalesce(p_involved, '[]'::jsonb)) loop
    insert into public.complaint_people (complaint_id, kind, name, email) values (p_id, 'involved', left(j->>'name', 80), nullif(left(j->>'email', 120), ''));
  end loop;
  for j in select * from jsonb_array_elements(coalesce(p_cc, '[]'::jsonb)) loop
    insert into public.complaint_people (complaint_id, kind, name, email) values (p_id, 'cc', left(j->>'name', 80), nullif(left(j->>'email', 120), ''));
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- who the form can offer under "involved" and "who else should know": names only, no numbers
create or replace function public.cmp_people_options() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.kb_me_email() is null or coalesce(public.kb_level(), 0) < 1 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('name', n, 'email', e, 'role', r) order by r, n) from (
      select coalesce(display_name, phorest_name) n, email e, dept r from public.perf_staff where active and email is not null
      union all select name, email, 'Reception' from public.kb_staff where active and category = 'Receptionist'
      union all select coalesce(full_name, p.email), p.email, 'Coordinator' from public.kb_positions p where p.position ilike '%coordinator%'
    ) s), '[]'::jsonb);
end $$;

revoke all on function public.cmp_group(text), public.cmp_my_ids(), public.cmp_leader(), public.cmp_coord(text), public.cmp_can(bigint), public.cmp_reveal(bigint) from public, anon;
revoke all on function public.cmp_get(bigint), public.cmp_my_list(), public.cmp_claim(bigint), public.cmp_pass(bigint), public.cmp_replied(bigint, text),
  public.cmp_ask(bigint, text), public.cmp_set_people(bigint, jsonb, jsonb), public.cmp_people_options() from public, anon;
grant execute on function public.cmp_get(bigint), public.cmp_my_list(), public.cmp_claim(bigint), public.cmp_pass(bigint), public.cmp_replied(bigint, text),
  public.cmp_ask(bigint, text), public.cmp_set_people(bigint, jsonb, jsonb), public.cmp_people_options() to authenticated;
grant execute on function public.cmp_group(text), public.cmp_my_ids(), public.cmp_leader(), public.cmp_coord(text), public.cmp_can(bigint), public.cmp_reveal(bigint) to authenticated;

-- ---------------------------------------------------------------- the tick (cron, every minute): the edge function does the work
create or replace function public.complaint_triage_tick() returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not coalesce((select enabled from public.complaint_triage_config where id = 1), false) then return null; end if;
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/complaint-triage',
    body := jsonb_build_object('tick', true,
              'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'complaint_hook_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_id;
  return v_id;
end $$;
revoke all on function public.complaint_triage_tick() from public, anon, authenticated;

select cron.unschedule('complaint-triage-tick') where exists (select 1 from cron.job where jobname = 'complaint-triage-tick');
select cron.schedule('complaint-triage-tick', '* * * * *', $$select public.complaint_triage_tick()$$);
