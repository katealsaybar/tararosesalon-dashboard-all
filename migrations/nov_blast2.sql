-- November database blasts, BLAST 2 (Kate, 13 Nov 2026): the reminders to everyone from Blast 1 who has not booked, in seven blasts:
--   R_A  Hair to beauty reminder          (A clients)     template tr_nov2_reminder_beauty_bogo
--   R_B  Beauty to hair reminder          (B clients)     template tr_nov2_reminder_hair_25
--   R_E3 Occasional hair and beauty       (E3 clients)    template tr_nov2_reminder_beauty_bogo
--   R_C1 Due hair, not booked             (F clients)     template tr_nov_due_hair_reminder   (the Blast 1 Due text again, Kate's call)
--   R_D1 Due beauty, not booked           (F2 clients)    template tr_nov_due_beauty_reminder
--   R_C2 Newly due hair, Phorest overdue list, not in Blast 1     template tr_nov_due_hair_reminder
--   R_D2 Newly due beauty, Phorest overdue list, not in Blast 1   template tr_nov_due_beauty_reminder
-- APPLIED LIVE 13 Nov 2026 (in pieces, each checked). Counts that day: R_A 689, R_B 56, R_E3 273, R_C1 257, R_D1 3, R_C2 4, R_D2 0 = 1,282.
--
-- WHY THIS EXISTS: the send machinery was built for ONE message per client in the whole of November. Blast 2 is a deliberate second message, so the guards that said
-- "one per phone" and "already sent in a November blast" are now "one per phone PER WAVE" (wave 1 = A to F2, wave 2 = ids that start R_). Everything else stays: the 24 hour
-- rule, a failed message is never retried, opt-outs, STOP, bookings, a usable first name, the gate (STOP 2%, failed), Level 5 only, the typed SEND <blast>.
-- Tested in a rolled-back block: a wave 2 message to a phone that already has a wave 1 message is allowed once, a second one in either wave is refused.
--
-- WHAT IT CHANGES (the five live functions were copied first under the same name plus _pre_blast2_13nov, no grant to the page):
--   nov_wave(text)              NEW, 2 for ids that start R_, else 1
--   nov_send_jobs_one_per_phone the unique index is now (phone, wave) instead of (phone)
--   nov_send_candidates         wave aware (the Already sent reason only looks at the same wave); wave 2 also drops anyone who wrote back since Blast 1 or said STOP, and sends to
--                               the number Blast 1 reached; Al Quoz is held back on its shut days (Sunday and Monday, Dubai) and goes on the next send of the same blast
--   nov_send_enqueue            same text, with the ON CONFLICT target of the new index
--   nov_blast_snap_refresh      also fills the Blast 2 rows (nov_blast2_members) next to the Blast 1 rows; statement timeout 150 s
--   nov_blast_audience, nov_blast_clients   a client counts as sent only when she was sent in the SAME wave, so Blast 2 does not show as already sent
--   nov_blast2_members, nov_blast2_phorest_due, nov_blast2_due_refresh, table nov_blast2_due   NEW, internal (no grant to the page)
--   nov_blast_items             nine rows R_A to R_D2 (copies of A, B, E3, F, F2 with the Blast 2 words, day Mon 16 Nov, Al Quoz Tue 17 Nov); backup of the table nov_blast_items_pre_blast2_13nov
-- Results (nov_client_facts) is untouched: it keeps one row per client from her FIRST message, so the Blast 1 results do not move. Blast 2 results are a later job.
-- Newly due (R_C2, R_D2) follows Phorest's own Client Reconnect overdue list (nov_blast_due_list, pulled 4 Nov). That rebuild takes about 100 s, so it is NOT part of the page's
-- count: run  select nov_blast2_due_refresh();  after pulling the list again (Monday morning before the send), then Count again on the page.
-- Nothing here sends anything. Sending needs Level 5, the switch on, a live (not dry) run and the typed words, as before. The hair template (R_B) is marked submitted in
-- nov_blast_items until Meta approves it: flip data.tpl.warm.s to approved by SQL, and the Send button appears.
--
-- ROLLBACK: take pg_get_functiondef of each _pre_blast2_13nov copy, rename it back, execute it; recreate
--   create unique index nov_send_jobs_one_per_phone on public.nov_send_jobs (phone) where status in ('queued','sending','sent') and not dry and not is_test;
--   (only possible while no wave 2 message to a Blast 1 phone exists, so before the send); delete from nov_blast_items where id like 'R\_%'.

-- 0) backups of the functions this changes (copy of the live text under a new name, no grant to the page)
do $do$
declare r record; d text;
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('nov_send_candidates', 'nov_send_enqueue', 'nov_blast_snap_refresh', 'nov_blast_audience', 'nov_blast_clients') loop
    if not exists (select 1 from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = r.proname || '_pre_blast2_13nov') then
      d := replace(pg_get_functiondef(r.oid), 'FUNCTION public.' || r.proname || '(', 'FUNCTION public.' || r.proname || '_pre_blast2_13nov(');
      execute d;
      execute format('revoke all on function public.%I(%s) from public, anon, authenticated', r.proname || '_pre_blast2_13nov', r.args);
    end if;
  end loop;
end $do$;
create table if not exists public.nov_blast_items_pre_blast2_13nov as select * from public.nov_blast_items;
revoke all on public.nov_blast_items_pre_blast2_13nov from anon, authenticated;
alter table public.nov_blast_items_pre_blast2_13nov enable row level security;

-- 1) the wave of a blast id
create or replace function public.nov_wave(p_blast text) returns int language sql immutable as $$
  select case when p_blast like 'R\_%' then 2 else 1 end
$$;

-- 2) one live message per phone PER WAVE
begin;
drop index if exists public.nov_send_jobs_one_per_phone;
create unique index nov_send_jobs_one_per_phone on public.nov_send_jobs (phone, (public.nov_wave(blast_id)))
  where status in ('queued', 'sending', 'sent') and not dry and not is_test;
commit;

-- 3) the Phorest overdue (newly due) rule: the 4 Nov rules before Due became the 1 Apr to 31 Aug window (the Phorest Client Reconnect list, nov_blast_due_list), as its own function
do $do$
declare d text;
begin
  if not exists (select 1 from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = 'nov_blast2_phorest_due') then
    d := replace(pg_get_functiondef('public.nov_blast_members_pre_duenew_4nov(date)'::regprocedure), 'FUNCTION public.nov_blast_members_pre_duenew_4nov(', 'FUNCTION public.nov_blast2_phorest_due(');
    execute d;
  end if;
end $do$;
revoke all on function public.nov_blast2_phorest_due(date) from public, anon, authenticated;

create table if not exists public.nov_blast2_due (
  blast_id text not null, k text not null, client text, branch text, last_visit date, spend numeric, wa text, built_at timestamptz not null default now(),
  primary key (blast_id, k)
);
alter table public.nov_blast2_due enable row level security;
revoke all on public.nov_blast2_due from anon, authenticated;
create or replace function public.nov_blast2_due_refresh() returns int
language plpgsql security definer set search_path = public set statement_timeout = '280s' as $$
declare n int;
begin
  delete from public.nov_blast2_due where true;
  insert into public.nov_blast2_due (blast_id, k, client, branch, last_visit, spend, wa)
    select case m.blast_id when 'F' then 'R_C2' else 'R_D2' end, m.k, m.client, m.branch, m.last_visit, m.spend, m.wa
    from public.nov_blast2_phorest_due(null) m
    where m.blast_id in ('F', 'F2')
      and not exists (select 1 from nov_send_jobs j where not j.dry and not j.is_test and public.nov_wave(j.blast_id) = 1 and public.stl_key_fold(j.client_key) = public.stl_key_fold(m.k));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.nov_blast2_due_refresh() from public, anon, authenticated;

-- 4) who is in Blast 2
create or replace function public.nov_blast2_members()
returns table (blast_id text, k text, client text, branch text, last_visit date, spend numeric, grp text, ext boolean, blonde boolean, colour boolean, wa text)
language sql stable security definer set search_path = public set statement_timeout = '120s' as $$
  with b1 as (
    select f.k, f.blast_id as bid, f.branch, initcap(coalesce(nullif(j.client_name, ''), f.client_key)) as nm
    from nov_client_facts f
    join nov_send_jobs j on j.id = f.id
    left join lost_wa_status w on w.phone = f.phone
    where f.blast_id in ('A', 'B', 'E3', 'F', 'F2')
      and f.delivery in ('delivered', 'read')
      and not coalesce(f.stop, false) and not coalesce(f.ahead, false) and not coalesce(f.came_in, false) and not coalesce(f.late, false)
      and not coalesce(w.last_in > f.sent_at, false)                           -- she has not written back (the call centre has those)
      and not coalesce(w.opted_out, false) and not coalesce(w.is_blocked, false)
      and not (f.branch = 'MC' and f.blast_id <> 'F')                           -- Motor City has no beauty team: hair Due only
  )
  select (case b1.bid when 'A' then 'R_A' when 'B' then 'R_B' when 'E3' then 'R_E3' when 'F' then 'R_C1' else 'R_D1' end)::text,
         b1.k, b1.nm, b1.branch, null::date, null::numeric, 'std'::text, false, false, false, 'found'::text
  from b1
  union all
  select d.blast_id, d.k, d.client, d.branch, d.last_visit, d.spend, 'std'::text, false, false, false, coalesce(d.wa, 'found')
  from public.nov_blast2_due d
  where not exists (select 1 from nov_send_jobs j where not j.dry and not j.is_test and public.nov_wave(j.blast_id) = 1 and public.stl_key_fold(j.client_key) = public.stl_key_fold(d.k))
$$;
revoke all on function public.nov_blast2_members() from public, anon, authenticated;

-- 5) the page's list: Blast 1 rows as before, plus the Blast 2 rows
create or replace function public.nov_blast_snap_refresh(p_force boolean default false) returns timestamptz
language plpgsql security definer set search_path to 'public' set statement_timeout to '150s' as $$
declare t timestamptz;
begin
  select m.at into t from public.nov_blast_snap_meta m where m.id = 1;
  if not p_force and t is not null and t > now() - interval '60 minutes' then return t; end if;
  -- only an editor rebuilds: the Campaign Blasts audiences are read through blast_plan_members, which checks the level
  if t is not null and not coalesce((select m.level in (3, 5) from public.dashboard_me() m limit 1), false) then return t; end if;
  if not pg_try_advisory_xact_lock(727001) then return t; end if;
  delete from public.nov_blast_snap where true;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast_members() m;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast2_members() m;
  insert into public.nov_blast_snap_meta (id, at) values (1, now()) on conflict (id) do update set at = excluded.at;
  return now();
end $$;

-- 6) who is queued, and why anyone is not (wave aware)
create or replace function public.nov_send_candidates(p_blast text)
returns table (k text, client text, branch text, phone text, first_name text, reason text)
language sql stable security definer set search_path = public set statement_timeout = '60s' as $$
  with td as (select (now() at time zone 'Asia/Dubai')::date as d, public.nov_wave(p_blast) as wv, extract(dow from now() at time zone 'Asia/Dubai')::int as dow),
  s as (select x.k, x.client, x.branch from nov_blast_snap x where x.blast_id = p_blast),
  phall as (
    select stl_key_fold(c.client_key) as k, btrim(p) as phone
    from client_contacts c, unnest(string_to_array(c.mobile, ' / ')) p
    where coalesce(c.mobile, '') <> '' and btrim(p) ~ '^(\+9715\d{8}|\+(?!971)\d{9,15})$'
  ),
  ph as (
    select distinct on (a.k) a.k, a.phone
    from phall a join s on s.k = a.k left join lost_wa_status w on w.phone = a.phone
    order by a.k, (coalesce(w.found, false) and w.last_in is not null) desc, coalesce(w.found, false) desc, w.last_in desc nulls last, a.phone
  ),
  w1 as (   -- wave 2 only: the Blast 1 message she was sent (the number it went to, when, and whether she said STOP)
    select distinct on (stl_key_fold(j.client_key)) stl_key_fold(j.client_key) as k, j.phone, j.sent_at, j.stop
    from nov_send_jobs j, td
    where td.wv = 2 and public.nov_wave(j.blast_id) = 1 and j.status = 'sent' and not j.dry and not j.is_test and j.retried_at is null
    order by stl_key_fold(j.client_key), j.sent_at
  ),
  bk as (select distinct stl_key_fold(b.client_key) as k from client_bookings b, td where b.date >= td.d),
  ex as (select distinct stl_key_fold(e.client_key) as k from lost_excluded e where e.reason in ('Do not contact', 'Wrong number')),
  e as (
    select s.k, s.client, s.branch, coalesce(w1.phone, p.phone) as phone, w.found, w.checked_at, w.err, w.opted_out, w.is_blocked, w.tags, w.last_out, w.last_in,
           w1.sent_at as b1_at, coalesce(w1.stop, false) as b1_stop,
           initcap(lower(regexp_replace(split_part(btrim(s.client), ' ', 1), '[.,]+$', ''))) as fn
    from s left join ph p on p.k = s.k left join w1 on w1.k = stl_key_fold(s.k) left join lost_wa_status w on w.phone = coalesce(w1.phone, p.phone)
  )
  select e.k, e.client, e.branch, e.phone, e.fn,
    case
      when e.phone is null then 'No mobile number on file'
      when e.checked_at is not null and (not coalesce(e.found, false) or e.err ilike 'contact 400%') then 'Not reachable on WhatsApp'
      when exists (select 1 from lost_send_optout o where o.phone = e.phone) or coalesce(e.opted_out, false) or coalesce(e.is_blocked, false)
           or exists (select 1 from unnest(coalesce(e.tags, '{}'::text[])) t where lower(t) in ('dnd', 'do not contact', 'lost-optout'))
           or e.k in (select ex.k from ex) then 'Opted out or do not contact'
      when td.wv = 2 and e.b1_stop then 'Said STOP after Blast 1'
      when e.k in (select bk.k from bk) then 'Has an appointment booked'
      when td.wv = 2 and e.b1_at is not null and e.last_in is not null and e.last_in > e.b1_at then 'Wrote back since Blast 1'
      when exists (select 1 from nov_send_jobs j where not j.dry and not j.is_test and j.status in ('queued', 'sending', 'sent') and public.nov_wave(j.blast_id) = td.wv and (j.phone = e.phone or j.client_key = e.k))
        then 'Already queued or sent in a November blast'
      when exists (select 1 from nov_send_jobs j where not j.dry and not j.is_test and j.status = 'failed' and j.phone = e.phone and j.requested_at > now() - interval '24 hours')
        then 'A message failed in the last 24 hours, not retried'
      when e.last_out >= now() - interval '24 hours'
           or exists (select 1 from lost_send_jobs j where j.phone = e.phone and j.status = 'sent' and not j.is_test and j.sent_at > now() - interval '24 hours')
        then 'Messaged in the last 24 hours'
      when td.wv = 2 and e.branch = 'AQ' and td.dow in (0, 1) then 'Al Quoz is shut today, it goes on its next open day'
      when length(e.fn) < 2 or length(e.fn) > 30 or e.fn ~ '[0-9@/\\]' then 'No usable first name'
    end
  from e, td
$$;
revoke all on function public.nov_send_candidates(text) from public, anon, authenticated;

-- 7) queue a blast (the ON CONFLICT target follows the new index)
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.nov_send_enqueue(text,text,text)'::regprocedure);
  n := replace(d, 'on conflict (phone) where status in (', 'on conflict (phone, (nov_wave(blast_id))) where status in (');
  if n = d then
    if position('nov_wave(blast_id)' in d) > 0 then return; end if;   -- already patched
    raise exception 'nov_send_enqueue patch failed';
  end if;
  execute n;
end $do$;

-- 8) the page's counts and lists: a client is "sent" only when she was sent in the SAME wave
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.nov_blast_audience(boolean)'::regprocedure);
  if position('nov_wave' in d) = 0 then
    n := replace(d, 'select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f from public.nov_send_jobs j',
                    'select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f, public.nov_wave(j.blast_id) as w from public.nov_send_jobs j');
    n := replace(n, '(x.k in (select k from sent) or public.stl_key_fold(x.k) in (select f from sent)) as is_sent',
                    'exists (select 1 from sent s0 where s0.w = public.nov_wave(x.blast_id) and (s0.k = x.k or s0.f = public.stl_key_fold(x.k))) as is_sent');
    if n = d or position('s0.w' in n) = 0 or position('as w from' in n) = 0 then raise exception 'nov_blast_audience patch failed'; end if;
    execute n;
  end if;
  d := pg_get_functiondef('public.nov_blast_clients(text,text,text,text)'::regprocedure);
  if position('nov_wave' in d) = 0 then
    n := replace(d, 'select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f from public.nov_send_jobs j',
                    'select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f, public.nov_wave(j.blast_id) as w from public.nov_send_jobs j');
    n := replace(n, 'and not (x.k in (select k from sent) or public.stl_key_fold(x.k) in (select f from sent)))',
                    'and not exists (select 1 from sent s0 where s0.w = public.nov_wave(x.blast_id) and (s0.k = x.k or s0.f = public.stl_key_fold(x.k))))');
    if n = d or position('s0.w' in n) = 0 or position('as w from' in n) = 0 then raise exception 'nov_blast_clients patch failed'; end if;
    execute n;
  end if;
end $do$;

-- 9) the Blast 2 blasts on the page: copies of A, B, E3, F and F2 with the Blast 2 words. The words and the template names are exactly the ones submitted to Meta on 13 Nov
--    (docs/NOV-2026-BLASTS-2-AND-3-DRAFTS.md in the cowork repo). The send day is Mon 16 Nov, Al Quoz Tue 17 Nov. Re-running this changes nothing (on conflict do nothing).
with spec(id, sort, base, tm, title, short, who, who_b, gets, tplname, tpls, msgkey, msg, brand) as (values
 ('R_A', 80, 'A', '11:30', $t$Hair to beauty clients, reminder$t$, $t$Hair to beauty, reminder$t$,
  $t$Clients who were sent the Hair to beauty message on 4 Nov and it was delivered, who have not booked or come in since (a booking after 30 November counts too), have not written back and have not said STOP. One message per phone, to the number Blast 1 reached. No Motor City.$t$,
  $t$["Was sent Hair to beauty on 4 Nov and it was delivered","Has not booked or come in since","Has not written back","Has not said STOP","The same number as Blast 1","Motor City is not in the November blasts"]$t$::jsonb,
  $t$The same offer as Blast 1: any two beauty services in one visit, she pays for the higher priced one and the other is complimentary. Book and visit by 30 November 2026 (28 November for Al Quoz), T&Cs apply.$t$,
  'tr_nov2_reminder_beauty_bogo', 'approved', 'warm',
  $t$Hi {{1}}, it’s Tara Rose {{2}}. We hope your week is going well. We didn’t want our offer to slip past you: choose any two beauty services in one visit, and you pay for the higher priced one while the other is complimentary. Our beauty team would love to look after you. Book and visit by {{3}}. Reply and we’ll find you a time. 🤍$t$,
  $t$Blast 2 reminder, Kate 13 Nov. Brand review 13 Nov: PASS (90 of 100) on the words. Buy one get one is the same mechanic as Blast 1, so Coach Emma's ruling carries over (on the record, still to be written down).$t$),
 ('R_B', 81, 'B', '14:15', $t$Beauty clients, first hair visit, reminder$t$, $t$Beauty to hair, reminder$t$,
  $t$Clients who were sent the Beauty to hair message on 4 Nov and it was delivered, who have not booked or come in since, have not written back and have not said STOP. One message per phone, to the number Blast 1 reached. No Motor City.$t$,
  $t$["Was sent Beauty to hair on 4 Nov and it was delivered","Has not booked or come in since","Has not written back","Has not said STOP","The same number as Blast 1","Motor City is not in the November blasts"]$t$::jsonb,
  $t$The same offer as Blast 1: 25% off her new-client visit with our hair team, with selected stylists chosen for you by our team. Book and visit by 30 November 2026 (28 November for Al Quoz), T&Cs apply.$t$,
  'tr_nov2_reminder_hair_25', 'submitted', 'warm',
  $t$Hi {{1}}, it’s Tara Rose {{2}}. We hope your week is going well. We didn’t want our offer to slip past you: enjoy 25% off your new-client visit with our hair team, with selected stylists chosen for you by our team. We’d love to welcome you in. Book and visit by {{3}}. Reply and we’ll find you a time. 🤍$t$,
  $t$Blast 2 reminder, Kate 13 Nov. Brand review 13 Nov: ESCALATE (78 of 100). The 25% off is in the message because Coach Emma ruled it on 4 Nov 2026 (the guardian normally blocks "% off"); same words as the approved Blast 1 template, which the checker wanted changed to "cut and colour" (not taken). Emma's ruling still to be written down.$t$),
 ('R_E3', 82, 'E3', '13:30', $t$Hair and beauty clients, occasional, reminder$t$, $t$Hair and beauty, occasional, reminder$t$,
  $t$Clients who were sent the occasional Hair and beauty message on 4 Nov and it was delivered, who have not booked or come in since, have not written back and have not said STOP. One message per phone, to the number Blast 1 reached. No Motor City.$t$,
  $t$["Was sent the occasional hair and beauty message on 4 Nov and it was delivered","Has not booked or come in since","Has not written back","Has not said STOP","The same number as Blast 1","Motor City is not in the November blasts"]$t$::jsonb,
  $t$The same offer as Blast 1: any two beauty services in one visit, she pays for the higher priced one and the other is complimentary. Book and visit by 30 November 2026 (28 November for Al Quoz), T&Cs apply.$t$,
  'tr_nov2_reminder_beauty_bogo', 'approved', 'warm',
  $t$Hi {{1}}, it’s Tara Rose {{2}}. We hope your week is going well. We didn’t want our offer to slip past you: choose any two beauty services in one visit, and you pay for the higher priced one while the other is complimentary. Our beauty team would love to look after you. Book and visit by {{3}}. Reply and we’ll find you a time. 🤍$t$,
  $t$Blast 2 reminder, Kate 13 Nov. Same text and template as Hair to beauty, reminder. Brand review 13 Nov: PASS (90 of 100).$t$)
)
insert into public.nov_blast_items (id, sort, data)
select s.id, s.sort,
  b.data || jsonb_build_object('title', s.title, 'short', s.short, 'who', s.who, 'who_b', s.who_b, 'gets', s.gets,
    'msg', jsonb_build_object(s.msgkey, s.msg), 'tpl', jsonb_build_object(s.msgkey, jsonb_build_object('n', s.tplname, 's', s.tpls)),
    'date', '2026-11-16', 'time', s.tm, 'aq_date', '2026-11-17', 'end', '30 November 2026',
    'valid', $v$30 November 2026, to book and to have the appointment. Al Quoz clients: 28 November 2026. Al Quoz is shut on Sunday and Monday, so the send holds its clients back on a Monday and they go on the next send (Tuesday).$v$,
    'arms', 'One message, the same for everyone', 'gold', $g$Blast 1 got 3.6% of its clients booked or in. A reminder is expected to do less.$g$,
    'brand', jsonb_build_array('good', s.brand))
from spec s join public.nov_blast_items b on b.id = s.base
on conflict (id) do nothing;

with spec(id, sort, base, tm, title, short, who, who_b, brand) as (values
 ('R_C1', 83, 'F', '14:30', $t$Due hair clients, not booked$t$, $t$Due, hair, not booked$t$,
  $t$Clients who were sent the Due, hair reminder on 4 Nov and it was delivered, who have not booked or come in since, have not written back and have not said STOP. One message per phone, to the number Blast 1 reached. Motor City is included for hair.$t$,
  $t$["Was sent the Due, hair reminder on 4 Nov and it was delivered","Has not booked or come in since","Has not written back","Has not said STOP","The same number as Blast 1","Includes Motor City","The Blast 1 Due text again, no offer"]$t$::jsonb,
  $t$Blast 2 for Due, Kate 13 Nov: the approved Blast 1 Due text again, no new template. It carries the October wording (an exclamation mark, "pampering", a sparkle emoji) that the guardian would normally block; it is Emma's approved text, so nothing new to escalate. STOP on Due, hair was 2.7% in Blast 1: hold the send if STOP passes 2% in the first 100.$t$),
 ('R_D1', 84, 'F2', '15:00', $t$Due beauty clients, not booked$t$, $t$Due, beauty, not booked$t$,
  $t$Clients who were sent the Due, beauty reminder on 4 Nov and it was delivered, who have not booked or come in since, have not written back and have not said STOP. One message per phone, to the number Blast 1 reached. Motor City is not part of the beauty blasts.$t$,
  $t$["Was sent the Due, beauty reminder on 4 Nov and it was delivered","Has not booked or come in since","Has not written back","Has not said STOP","The same number as Blast 1","Motor City is not in the beauty blasts","The Blast 1 Due text again, no offer"]$t$::jsonb,
  $t$Blast 2 for Due, Kate 13 Nov: the approved Blast 1 Due text again, no new template. Same October wording as Due, hair (an exclamation mark, "pampering", a sparkle emoji), Emma's approved text.$t$),
 ('R_C2', 85, 'F', '15:00', $t$Newly due hair clients, Phorest$t$, $t$Newly due, hair, Phorest$t$,
  $t$Clients on Phorest's own Client Reconnect overdue list who were not in Blast 1 (a pull stored on 4 Nov, to be pulled again before the send), who have a hair service in their history, nothing booked, nobody messaged since 9 Oct, and who have written to us in respond.io. One message per phone. Motor City is included for hair.$t$,
  $t$["On Phorest's Client Reconnect overdue list","Was not in Blast 1","Has had a hair service","Nothing booked from today","Not messaged since 9 Oct","Has written to us in respond.io","The Blast 1 Due text, no offer"]$t$::jsonb,
  $t$Blast 2 for Due, Kate 13 Nov: newly due follows Phorest's list, not a date window. The approved Due, hair text, no new template. First time these clients read it, so the "!", "pampering" and sparkle emoji in Emma's wording land on them fresh.$t$),
 ('R_D2', 86, 'F2', '15:00', $t$Newly due beauty clients, Phorest$t$, $t$Newly due, beauty, Phorest$t$,
  $t$Clients on Phorest's own Client Reconnect overdue list who were not in Blast 1, beauty or nails only, nothing booked, nobody messaged since 9 Oct, who have written to us in respond.io. One message per phone. Motor City is not part of the beauty blasts.$t$,
  $t$["On Phorest's Client Reconnect overdue list","Was not in Blast 1","Only beauty or nails","Nothing booked from today","Not messaged since 9 Oct","Has written to us in respond.io","The Blast 1 Due text, no offer"]$t$::jsonb,
  $t$Blast 2 for Due, Kate 13 Nov: newly due follows Phorest's list. The approved Due, beauty text, no new template. 0 clients on 13 Nov.$t$)
)
insert into public.nov_blast_items (id, sort, data)
select s.id, s.sort,
  b.data || jsonb_build_object('title', s.title, 'short', s.short, 'who', s.who, 'who_b', s.who_b,
    'date', '2026-11-16', 'time', s.tm, 'aq_date', '2026-11-17',
    'valid', $v$No offer in this message, so no end date. Send on Monday 16 November, 11:30 am to 4 pm. Al Quoz is shut Sunday and Monday, so the send holds its clients back on a Monday and they go on the next send (Tuesday).$v$,
    'arms', 'One message, the same for everyone', 'gold', $g$Blast 1 Due: under 1 booking in 100. A reminder is expected to do the same or less.$g$,
    'brand', jsonb_build_array('good', s.brand))
from spec s join public.nov_blast_items b on b.id = s.base
on conflict (id) do nothing;
