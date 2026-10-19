-- Lost Client Blasts: the Performance report opens to Level 2 (Kate, 19 Oct 2026).
-- The coordinators (Level 2) could open the groups but not the report. The four functions behind it now ask for Level 2 instead of Level 3:
--   lost_send_report_get, lost_send_log_get, lost_delivery_report, lost_booked_deposits
-- Nothing else changes: To message, Templates and the send panel (lost_send_info, lost_send_jobs_get, lost_queue, the waves) stay Level 3 and up, because
-- they show phone numbers, and a login scoped to one branch (Bahrain) is still refused where the function already said so. The page shows Level 2 a
-- rail with just The five groups and Performance report (lost-queue.js, lqTabOk). Patched in place so the rest of each function is untouched.
do $patch$
declare f text; d text;
begin
  foreach f in array array['lost_send_report_get', 'lost_send_log_get', 'lost_delivery_report', 'lost_booked_deposits'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f limit 1;
    if d like '%lost_send_level() < 3%' then
      execute replace(d, 'lost_send_level() < 3', 'lost_send_level() < 2');
    end if;
  end loop;
end $patch$;
