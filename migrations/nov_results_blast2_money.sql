-- Database Blasts, November, Results: Blast 2 bookings (Kate, 17 Nov 2026: "build na sa dashboard yung section 5").
-- APPLIED 19 Nov 2026 on gvijxenafoowajqktqvd with Kate's word ("a, i-apply mo na"), as two migrations: this one, then nov_results_blast2_money_no_double_rc2.
-- FOLLOW-UP FIX (applied right after): 4 clients had R_C2 as their FIRST message, so nov_client_facts already carried an R_C2 row and the union doubled it.
--   The first select now has `having blast_id is null or blast_id not like 'R\_%'`, so R_ ids come only from the second select. The statement is included below.
-- WHY: section 5 "By blast" now shows Blast 1 and its reminder side by side. nov_results_core already returns one row per blast_id for every sent message, so the reminders
--      (R_A, R_B, R_E3, R_C1, R_D1, R_C2) arrive with sent, read, delivered, failed, stop and replied. What they do NOT carry is `money` (booked or came in, paid), because
--      `money` is built from nov_client_facts, which holds one row per client under the blast of her FIRST message. So the reminder cards cannot show bookings.
-- WHAT: the `money` CTE gains a second set of rows for the R_ ids: the distinct clients of each reminder joined to nov_client_facts on client_key, counted with the same
--       rules as the Blast 1 rows (booked or came in, ahead, late, came in, booked since, paid). A client who booked after the reminder is therefore counted in her Blast 1 row
--       and in her reminder row, which is the point (the page says so). The ALL row is untouched: it still counts each client once.
-- Everything else is the live function text with one exact-match replacement; a replacement that finds nothing aborts the whole migration. Read only for existing callers.
-- Rollback: re-run the last restatement of nov_results_core (migrations/nov_results_deposits_bookdays.sql then nov_after_deadline.sql).

create or replace function pg_temp.rep(src text, a text, b text) returns text language plpgsql as $f$
begin
  if position(a in src) = 0 then raise exception 'pattern not found: %', left(a, 80); end if;
  return replace(src, a, b);
end $f$;

do $do$
declare d text;
begin
  d := pg_get_functiondef('public.nov_results_core()'::regprocedure);
  d := pg_temp.rep(d,
    E'from public.nov_client_facts group by rollup (blast_id)),',
    E'from public.nov_client_facts group by rollup (blast_id)\n'
    || E'    union all\n'
    || E'    select rj.blast_id as id, count(*) as clients, count(*) filter (where f.ahead) as ahead, count(*) filter (where f.late) as late,\n'
    || E'           coalesce(sum(f.appts) filter (where f.ahead), 0) as appts, count(*) filter (where f.came_in) as came_in, count(*) filter (where f.booked_since) as booked_since,\n'
    || E'           count(*) filter (where f.ahead or f.booked_since or f.came_in) as booked_or_in,\n'
    || E'           count(*) filter (where f.spent > 0) as paid_clients, round(coalesce(sum(f.spent), 0), 2) as paid_aed\n'
    || E'    from (select distinct blast_id, client_key from s where blast_id like ''R\\_%'') rj join public.nov_client_facts f on f.client_key = rj.client_key\n'
    || E'    group by rj.blast_id),');
  execute d;
end $do$;

-- Follow-up (applied 19 Nov 2026): stop the R_C2 row appearing twice.
do $do$
declare d text; a text := E'group by rollup (blast_id)
    union all'; b text;
begin
  d := pg_get_functiondef('public.nov_results_core()'::regprocedure);
  if position(a in d) = 0 then raise exception 'pattern not found'; end if;
  b := E'group by rollup (blast_id) having blast_id is null or blast_id not like ''R\_%''
    union all';
  execute replace(d, a, b);
end $do$;
