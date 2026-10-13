-- Lost Clients review sheets: say which Smoothing clients still visit (Kate, 13 Oct 2026).
-- Groups 1 and 2 were merged on 12 Oct, so the Smoothing list holds two kinds of client: lost ones (no visit in 6+ months) and
-- ones who still come in for other services but have had no smoothing in 6+ months. Shiela (Motor City) asked why "still
-- visiting" clients are on a lost-clients sheet.
--
--   lost_sheet_rows()   gains still_smoothing: true for a client on the Smoothing list (f2) whose last visit is inside lost_days.
--
-- Additive: one new key in each row. Patches the live definition in place, like lost_multi_numbers.sql.

do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.lost_sheet_rows(uuid,text)'::regprocedure);
  if d not like '%still_smoothing%' then
    if position('''recent'', (c.last_visit >= current_date - rd),' in d) = 0 then
      raise exception 'lost_sheet_rows(uuid,text) is not the shape this migration expects';
    end if;
    d := replace(d, '''recent'', (c.last_visit >= current_date - rd),',
                    '''recent'', (c.last_visit >= current_date - rd),' || chr(10) ||
                    '      ''still_smoothing'', (c.f2 and c.last_visit >= current_date - (select l.lost_days from lost_lists_config l where l.id = 1)),');
    execute d;
  end if;
end
$mig$;
