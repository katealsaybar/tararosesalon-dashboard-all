-- November database blasts, BLAST 3 (Kate, 27 Nov 2026): the last note on the three offers, to everyone from Blast 2 who is still not booked, in three blasts:
--   T_A  Hair to beauty, last note        (A clients, reached by R_A)    template tr_nov3_lastcall_beauty_bogo
--   T_B  Beauty to hair, last note        (B clients, reached by R_B)    template tr_nov3_lastcall_hair_25
--   T_E3 Occasional hair and beauty       (E3 clients, reached by R_E3)  template tr_nov3_lastcall_beauty_bogo
--   T_C1 Due hair, third message         (reached by R_C1)               template tr_nov_due_hair_reminder   (the approved Blast 1 and 2 Due text again, Kate 27 Nov: "same messaging")
--   T_D1 Due beauty, third message       (reached by R_D1)               template tr_nov_due_beauty_reminder
-- Same offers, same end date as Blast 1 and 2 (30 Nov 2026, Al Quoz 28 Nov). Due has no offer and no end date. Newly due (R_C2, R_D2) are not in Blast 3 (not in nov_client_facts, 3 clients).
-- Appointments: the send already holds back anyone with ANY appointment from today on (client_bookings runs to Apr 2027), which covers the next 90 days and beyond.
-- Send day: Sat 28 Nov 2026, 11:30 am to 4 pm. Nothing here sends anything: sending needs Level 5, the switch on, a live run, an approved template and the typed SEND <blast>.
--
-- WHAT IT CHANGES (the two live functions it rewrites were copied first as <name>_pre_blast3_27nov, no grant to the page):
--   nov_wave(text)           ids that start T_ are wave 3 (R_ wave 2, the rest wave 1). The unique index (phone, wave) needs no rebuild: no T_ row exists yet.
--   nov_blast3_members()     NEW, internal: reached by the Blast 2 message (delivered or read), not booked or come in, not written back since that message, no STOP, not opted out, no Motor City.
--   nov_blast_snap_refresh   also fills the Blast 3 rows next to Blast 1 and 2
--   nov_send_candidates      wave 2 rules now hold for wave 3 against the PREVIOUS wave's message; wave 3 also holds back anyone with a conversation going today (Dubai day)
--   nov_blast_items          rows T_A, T_B, T_E3 (copies of R_A, R_B, R_E3 with the Blast 3 words)
-- ROLLBACK: rename each _pre_blast3_27nov function back (pg_get_functiondef, execute), delete from nov_blast_items where id like 'T\_%', drop function nov_blast3_members().

-- 0) backups
do $do$
declare r record; d text;
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('nov_send_candidates', 'nov_blast_snap_refresh', 'nov_wave') loop
    if not exists (select 1 from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = r.proname || '_pre_blast3_27nov') then
      d := replace(pg_get_functiondef(r.oid), 'FUNCTION public.' || r.proname || '(', 'FUNCTION public.' || r.proname || '_pre_blast3_27nov(');
      execute d;
      execute format('revoke all on function public.%I(%s) from public, anon, authenticated', r.proname || '_pre_blast3_27nov', r.args);
    end if;
  end loop;
end $do$;
create table if not exists public.nov_blast_items_pre_blast3_27nov as select * from public.nov_blast_items;
revoke all on public.nov_blast_items_pre_blast3_27nov from anon, authenticated;
alter table public.nov_blast_items_pre_blast3_27nov enable row level security;

-- 1) the wave of a blast id
create or replace function public.nov_wave(p_blast text) returns int language sql immutable as $$
  select case when p_blast like 'T\_%' then 3 when p_blast like 'R\_%' then 2 else 1 end
$$;

-- 2) who is in Blast 3
create or replace function public.nov_blast3_members()
returns table (blast_id text, k text, client text, branch text, last_visit date, spend numeric, grp text, ext boolean, blonde boolean, colour boolean, wa text)
language sql stable security definer set search_path = public set statement_timeout = '120s' as $$
  with r2 as (
    select distinct on (j.phone) j.blast_id as rid, j.phone, j.sent_at, j.client_name, j.branch
    from nov_send_jobs j
    where not j.dry and not j.is_test and j.status = 'sent' and j.retried_at is null
      and j.blast_id in ('R_A', 'R_B', 'R_E3', 'R_C1', 'R_D1') and j.delivery in ('delivered', 'read') and not coalesce(j.stop, false)
    order by j.phone, j.sent_at
  )
  select distinct on (t.tid, f.k) t.tid::text, f.k, initcap(coalesce(nullif(r2.client_name, ''), f.client_key)), r2.branch, null::date, null::numeric, 'std'::text, false, false, false, 'found'::text
  from r2
  cross join lateral (select case r2.rid when 'R_A' then 'T_A' when 'R_B' then 'T_B' when 'R_E3' then 'T_E3' when 'R_C1' then 'T_C1' else 'T_D1' end as tid,
                             case r2.rid when 'R_A' then 'A' when 'R_B' then 'B' when 'R_E3' then 'E3' when 'R_C1' then 'F' else 'F2' end as b1) t
  join nov_client_facts f on f.phone = r2.phone and f.blast_id = t.b1
  left join lost_wa_status w on w.phone = r2.phone
  where not coalesce(f.stop, false) and not coalesce(f.ahead, false) and not coalesce(f.came_in, false) and not coalesce(f.late, false) and not coalesce(f.booked_since, false)
    and not coalesce(w.last_in > r2.sent_at, false)                           -- she has not written back since the Blast 2 message
    and not coalesce(w.opted_out, false) and not coalesce(w.is_blocked, false)
    and (r2.branch <> 'MC' or r2.rid = 'R_C1')                                 -- Motor City has no beauty team: hair Due only
$$;
revoke all on function public.nov_blast3_members() from public, anon, authenticated;

-- 3) the page's list: Blast 1, 2 and 3 rows
create or replace function public.nov_blast_snap_refresh(p_force boolean default false) returns timestamptz
language plpgsql security definer set search_path to 'public' set statement_timeout to '150s' as $$
declare t timestamptz;
begin
  select m.at into t from public.nov_blast_snap_meta m where m.id = 1;
  if not p_force and t is not null and t > now() - interval '60 minutes' then return t; end if;
  if t is not null and not coalesce((select m.level in (3, 5) from public.dashboard_me() m limit 1), false) then return t; end if;
  if not pg_try_advisory_xact_lock(727001) then return t; end if;
  delete from public.nov_blast_snap where true;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast_members() m;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast2_members() m;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast3_members() m;
  insert into public.nov_blast_snap_meta (id, at) values (1, now()) on conflict (id) do update set at = excluded.at;
  return now();
end $$;

-- 4) who is queued, and why anyone is not: wave 2 rules look at the previous wave's message, wave 3 adds "in a conversation today"
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.nov_send_candidates(text)'::regprocedure);
  if position('td.wv >= 2' in d) > 0 then return; end if;   -- already patched
  n := d;
  n := replace(n, 'where td.wv = 2 and public.nov_wave(j.blast_id) = 1 and j.status', 'where td.wv >= 2 and public.nov_wave(j.blast_id) = td.wv - 1 and j.status');
  n := replace(n, 'when td.wv = 2 and e.b1_stop then ''Said STOP after Blast 1''', 'when td.wv >= 2 and e.b1_stop then ''Said STOP after the last blast''');
  n := replace(n, 'when td.wv = 2 and e.b1_at is not null and e.last_in is not null and e.last_in > e.b1_at then ''Wrote back since Blast 1''',
                  'when td.wv >= 2 and e.b1_at is not null and e.last_in is not null and e.last_in > e.b1_at then ''Wrote back since the last blast''');
  n := replace(n, 'when td.wv = 2 and e.branch = ''AQ'' and td.dow in (0, 1)', 'when td.wv >= 2 and e.branch = ''AQ'' and td.dow in (0, 1)');
  n := replace(n, 'when e.last_out >= now() - interval ''24 hours''',
                  'when td.wv = 3 and ((e.last_in at time zone ''Asia/Dubai'')::date = td.d or (e.last_out at time zone ''Asia/Dubai'')::date = td.d) then ''A conversation is going today, held''' || chr(10) ||
                  '      when e.last_out >= now() - interval ''24 hours''');
  if n = d or position('td.wv >= 2 and public.nov_wave(j.blast_id) = td.wv - 1' in n) = 0 or position('A conversation is going today' in n) = 0 or position('td.wv = 2' in n) > 0 then
    raise exception 'nov_send_candidates patch failed';
  end if;
  execute n;
end $do$;

-- 5) the Blast 3 blasts on the page: copies of R_A, R_B, R_E3 with the Blast 3 words (docs/NOV-2026-BLASTS-2-AND-3-DRAFTS.md in the cowork repo). Re-running changes nothing.
with spec(id, sort, base, tm, title, short, who, who_b, gets, tplname, msg, brand) as (values
 ('T_A', 90, 'R_A', '11:30', $t$Hair to beauty clients, last note$t$, $t$Hair to beauty, last note$t$,
  $t$Clients who were sent the Hair to beauty reminder on 16 Nov and it was delivered, who have not booked or come in since, have not written back and have not said STOP, and who are not in a conversation with us today. One message per phone, to the number the reminder reached. No Motor City.$t$,
  $t$["Was sent the Hair to beauty reminder on 16 Nov and it was delivered","Has not booked or come in since","Has not written back","Has not said STOP","Not in a conversation with us today","The same number as the reminder","Motor City is not in the November blasts"]$t$::jsonb,
  $t$The same offer as Blast 1 and 2: any two beauty services in one visit, she pays for the higher priced one and the other is complimentary. Book and visit by 30 November 2026 (28 November for Al Quoz), T&Cs apply.$t$,
  'tr_nov3_lastcall_beauty_bogo',
  $t$Hi {{1}}, it’s Tara Rose {{2}}. Just a last little note from us about your beauty offer: choose any two beauty services in one visit, and you pay for the higher priced one while the other is complimentary. We’d love to look after you before it ends. Book and visit by {{3}}. Reply and we’ll find you a time. 🤍$t$,
  $t$Blast 3, last note, Kate 27 Nov. Same offer and format as Blast 2. Brand review 27 Nov: PASS (91 of 100). "Last" is a promise: no fourth message about this offer to these clients.$t$),
 ('T_B', 91, 'R_B', '14:15', $t$Beauty clients, first hair visit, last note$t$, $t$Beauty to hair, last note$t$,
  $t$Clients who were sent the Beauty to hair reminder on 16 Nov and it was delivered, who have not booked or come in since, have not written back and have not said STOP, and who are not in a conversation with us today. One message per phone, to the number the reminder reached. No Motor City.$t$,
  $t$["Was sent the Beauty to hair reminder on 16 Nov and it was delivered","Has not booked or come in since","Has not written back","Has not said STOP","Not in a conversation with us today","The same number as the reminder","Motor City is not in the November blasts"]$t$::jsonb,
  $t$The same offer as Blast 1 and 2: 25% off her new-client visit with our hair team, with selected stylists chosen for you by our team. Book and visit by 30 November 2026 (28 November for Al Quoz), T&Cs apply.$t$,
  'tr_nov3_lastcall_hair_25',
  $t$Hi {{1}}, it’s Tara Rose {{2}}. Just a last little note from us about your new-client visit with our hair team: 25% off, with selected stylists chosen for you by our team. We’d love to welcome you in before it ends. Book and visit by {{3}}. Reply and we’ll find you a time. 🤍$t$,
  $t$Blast 3, last note, Kate 27 Nov. Same offer and format as Blast 2. Brand review 27 Nov: ESCALATE (82 of 100) on "25% off" only: Emma's 4 Nov ruling covers the Blast 1 template and is still to be written down for all the hair texts. Kate kept the existing offer wording.$t$),
 ('T_E3', 92, 'R_E3', '13:30', $t$Hair and beauty clients, occasional, last note$t$, $t$Hair and beauty, occasional, last note$t$,
  $t$Clients who were sent the occasional Hair and beauty reminder on 16 Nov and it was delivered, who have not booked or come in since, have not written back and have not said STOP, and who are not in a conversation with us today. One message per phone, to the number the reminder reached. No Motor City.$t$,
  $t$["Was sent the occasional hair and beauty reminder on 16 Nov and it was delivered","Has not booked or come in since","Has not written back","Has not said STOP","Not in a conversation with us today","The same number as the reminder","Motor City is not in the November blasts"]$t$::jsonb,
  $t$The same offer as Blast 1 and 2: any two beauty services in one visit, she pays for the higher priced one and the other is complimentary. Book and visit by 30 November 2026 (28 November for Al Quoz), T&Cs apply.$t$,
  'tr_nov3_lastcall_beauty_bogo',
  $t$Hi {{1}}, it’s Tara Rose {{2}}. Just a last little note from us about your beauty offer: choose any two beauty services in one visit, and you pay for the higher priced one while the other is complimentary. We’d love to look after you before it ends. Book and visit by {{3}}. Reply and we’ll find you a time. 🤍$t$,
  $t$Blast 3, last note, Kate 27 Nov. Same text and template as Hair to beauty, last note. Brand review 27 Nov: PASS (91 of 100).$t$)
)
insert into public.nov_blast_items (id, sort, data)
select s.id, s.sort,
  (b.data || jsonb_build_object('title', s.title, 'short', s.short, 'who', s.who, 'who_b', s.who_b, 'gets', s.gets,
    'msg', jsonb_build_object('warm', s.msg), 'tpl', jsonb_build_object('warm', jsonb_build_object('n', s.tplname, 's', 'todo')),
    'date', '2026-11-28', 'time', s.tm, 'end', '30 November 2026',
    'valid', $v$30 November 2026, to book and to have the appointment. Al Quoz clients: 28 November 2026, the day of the send. Send on Saturday 28 November, 11:30 am to 4 pm.$v$,
    'arms', 'One message, the same for everyone', 'gold', $g$A last note is expected to do less than the reminder before it.$g$,
    'brand', jsonb_build_array('good', s.brand))) - 'aq_date'
from spec s join public.nov_blast_items b on b.id = s.base
on conflict (id) do nothing;

-- 6) Due, third message (Kate 27 Nov: same messaging as the Due text sent on 4 and 16 Nov). Copies of R_C1 and R_D1 with the same approved template.
with spec(id, sort, base, tm, title, short, who, who_b) as (values
 ('T_C1', 93, 'R_C1', '14:30', $t$Due hair clients, third message$t$, $t$Due, hair, third$t$,
  $t$Clients who were sent the Due, hair reminder on 16 Nov and it was delivered, who have not booked or come in since, have no appointment in the next 90 days or later, have not written back and have not said STOP, and who are not in a conversation with us today. One message per phone, to the number Blast 2 reached. Motor City is included for hair.$t$,
  $t$["Was sent the Due, hair reminder on 16 Nov and it was delivered","Has not booked or come in since","No appointment booked, in the next 90 days or after","Has not written back","Has not said STOP","Not in a conversation with us today","The same number as Blast 2","Includes Motor City"]$t$::jsonb),
 ('T_D1', 94, 'R_D1', '15:00', $t$Due beauty clients, third message$t$, $t$Due, beauty, third$t$,
  $t$Clients who were sent the Due, beauty reminder on 16 Nov and it was delivered, who have not booked or come in since, have no appointment in the next 90 days or later, have not written back and have not said STOP, and who are not in a conversation with us today. One message per phone, to the number Blast 2 reached. Motor City is not part of the beauty blasts.$t$,
  $t$["Was sent the Due, beauty reminder on 16 Nov and it was delivered","Has not booked or come in since","No appointment booked, in the next 90 days or after","Has not written back","Has not said STOP","Not in a conversation with us today","The same number as Blast 2","Motor City is not in the beauty blasts"]$t$::jsonb)
)
insert into public.nov_blast_items (id, sort, data)
select s.id, s.sort,
  (b.data || jsonb_build_object('title', s.title, 'short', s.short, 'who', s.who, 'who_b', s.who_b,
    'date', '2026-11-28', 'time', s.tm,
    'valid', $v$No offer in this message, so no end date. Send on Saturday 28 November, 11:30 am to 4 pm.$v$,
    'arms', 'One message, the same for everyone', 'gold', $g$Due answered least in Blast 1 and 2. A third message is expected to do the same or less.$g$,
    'brand', jsonb_build_array('good', $b$Blast 3 for Due, Kate 27 Nov: "same messaging", the approved Due text (the Blast 1 and 2 template) again, no new template. It carries Emma's wording (an exclamation mark, a sparkle emoji) that the guardian would normally block, already approved. STOP on Due, hair was 2.7% on Blast 1: hold the send if STOP passes 2% in the first 100. The send checks that she has nothing booked from today on (this covers the next 90 days and beyond).$b$))) - 'aq_date'
from spec s join public.nov_blast_items b on b.id = s.base
on conflict (id) do nothing;
