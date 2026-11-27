-- November database blasts, BLAST 3 for Newly due, hair (Kate, 27 Nov 2026: "Yes, add them").
-- Blast 3 (nov_blast3.sql) left out the Newly due, hair clients (R_C2, Phorest overdue list, 4 clients on 16 Nov) with the note "not in nov_client_facts". They ARE in
-- nov_client_facts, under blast_id R_C2 (they had no Blast 1, so no F row). 3 of the 4 reminders were delivered or read; none booked, wrote back or said STOP.
--   T_C2  Newly due hair, second message (reached by R_C2)   template tr_nov_due_hair_reminder   (same approved Due text, same as T_C1: "same messaging")
-- Newly due beauty (R_D2) had no send, so it is not added.
-- WHAT IT CHANGES: nov_blast3_members() now also reads R_C2 and maps it to T_C2 (Blast 1 lookup in nov_client_facts is the R_C2 row), Motor City stays allowed for hair
-- (R_C1 and R_C2). One new row in nov_blast_items (T_C2, a copy of R_C2). Nothing here sends anything: sending needs Level 5, the switch on, a live run, the approved
-- template and the typed SEND T_C2. The page's own refresh (nov_blast_snap_refresh) picks the T_C2 members up; they are also put in the snapshot here.
-- ROLLBACK: rename nov_blast3_members_pre_newlydue_27nov back (pg_get_functiondef, execute), delete from nov_blast_items where id = 'T_C2', delete from nov_blast_snap where blast_id = 'T_C2'.

-- 0) backup of the function
do $do$
declare d text;
begin
  if not exists (select 1 from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = 'nov_blast3_members_pre_newlydue_27nov') then
    d := replace(pg_get_functiondef('public.nov_blast3_members()'::regprocedure), 'FUNCTION public.nov_blast3_members(', 'FUNCTION public.nov_blast3_members_pre_newlydue_27nov(');
    execute d;
    execute 'revoke all on function public.nov_blast3_members_pre_newlydue_27nov() from public, anon, authenticated';
  end if;
end $do$;

-- 1) who is in Blast 3: add R_C2 -> T_C2
do $do$
declare d text; n text;
begin
  d := pg_get_functiondef('public.nov_blast3_members()'::regprocedure);
  if position('T_C2' in d) > 0 then return; end if;   -- already patched
  n := d;
  n := replace(n, '''R_C1'', ''R_D1'')', '''R_C1'', ''R_C2'', ''R_D1'')');
  n := replace(n, 'when ''R_C1'' then ''T_C1'' else ''T_D1'' end', 'when ''R_C1'' then ''T_C1'' when ''R_C2'' then ''T_C2'' else ''T_D1'' end');
  n := replace(n, 'when ''R_C1'' then ''F'' else ''F2'' end', 'when ''R_C1'' then ''F'' when ''R_C2'' then ''R_C2'' else ''F2'' end');
  n := replace(n, '(r2.branch <> ''MC'' or r2.rid = ''R_C1'')', '(r2.branch <> ''MC'' or r2.rid in (''R_C1'', ''R_C2''))');
  if n = d or position('''R_C2'', ''R_D1''' in n) = 0 or position('then ''T_C2''' in n) = 0 or position('then ''R_C2'' else' in n) = 0 or position('''R_C1'', ''R_C2''))' in n) = 0 then
    raise exception 'nov_blast3_members patch failed';
  end if;
  execute n;
  execute 'revoke all on function public.nov_blast3_members() from public, anon, authenticated';
end $do$;

-- 2) the T_C2 blast on the page: a copy of R_C2 with the Blast 3 words
with spec(id, sort, base, tm, title, short, who, who_b) as (values
 ('T_C2', 95, 'R_C2', '15:30', $t$Newly due hair clients, second message$t$, $t$Newly due, hair, second$t$,
  $t$Clients who were sent the Newly due, hair reminder on 16 Nov (the Phorest overdue list, no Blast 1) and it was delivered, who have not booked or come in since, have no appointment in the next 90 days or later, have not written back and have not said STOP, and who are not in a conversation with us today. One message per phone, to the number the reminder reached. Motor City is included for hair.$t$,
  $t$["Was sent the Newly due, hair reminder on 16 Nov and it was delivered","Has not booked or come in since","No appointment booked, in the next 90 days or after","Has not written back","Has not said STOP","Not in a conversation with us today","The same number as the reminder","Includes Motor City"]$t$::jsonb)
)
insert into public.nov_blast_items (id, sort, data)
select s.id, s.sort,
  (b.data || jsonb_build_object('title', s.title, 'short', s.short, 'who', s.who, 'who_b', s.who_b,
    'date', '2026-11-28', 'time', s.tm,
    'valid', $v$No offer in this message, so no end date.$v$,
    'arms', 'One message, the same for everyone', 'gold', $g$Due answered least in Blast 1 and 2. A second message to the Newly due is expected to do the same or less.$g$,
    'brand', jsonb_build_array('good', $b$Blast 3 for Newly due hair, Kate 27 Nov: "yes, add them". They were left out of Blast 3 by mistake (the note said they were not in nov_client_facts; they are, under R_C2). Same approved Due text and template as T_C1, no new wording.$b$))) - 'aq_date'
from spec s join public.nov_blast_items b on b.id = s.base
on conflict (id) do nothing;

-- 3) put the T_C2 members in the page's list now (the hourly refresh would do it too)
delete from public.nov_blast_snap where blast_id = 'T_C2';
insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
  select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast3_members() m where m.blast_id = 'T_C2';
