-- Level 2 (coordinators) opens the campaign performance reports (Kate, 28 Oct 2026).
-- Glow Club Performance and the Wellness Voucher (3rd/4th blast) performance report now ask for Level 2 instead of Level 3. All five return counts, money
-- and branch/wave/tier splits only, no client names, except wv_blast_depth, which has a names flag: it was "everyone but Level 4", it is now Level 3 and 5
-- only, so Level 2 gets no names (the same view Level 4 has). wv_blast_get (the list with who bought, phone numbers) and every send function stay Level 3 and up.
-- Patched in place, the same way as lost_performance_report_level2.sql, so the rest of each function is untouched.
-- Undo: replace the 2 back to 3 in the five guards (glow_club_performance, wv_blast_performance: "< 2"; wv_blasts_history, wv_lastpush_performance, wv_blast_depth: "lvl < 2")
-- and put wv_blast_depth's names line back to "nm := lvl <> 4".
do $patch$
declare f text; d text;
begin
  foreach f in array array['glow_club_performance', 'wv_blast_performance'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f limit 1;
    if d like '%dashboard_me() m limit 1), 0) < 3 then raise exception%' then
      execute replace(d, 'dashboard_me() m limit 1), 0) < 3 then raise exception', 'dashboard_me() m limit 1), 0) < 2 then raise exception');
    end if;
  end loop;
  foreach f in array array['wv_blasts_history', 'wv_lastpush_performance', 'wv_blast_depth'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f limit 1;
    if d like '%if lvl < 3 then raise exception%' then
      d := replace(d, 'if lvl < 3 then raise exception', 'if lvl < 2 then raise exception');
      if f = 'wv_blast_depth' then d := replace(d, 'nm := lvl <> 4;', 'nm := lvl >= 3 and lvl <> 4;'); end if;
      execute d;
    end if;
  end loop;
end $patch$;
