-- Client Complaints summary: one more tile, "found only in chats, confirmed" (Kate, 13 Nov 2026).
-- The summary counts visit notes (src visit, by event date). The chat complaints Coach Emma or Kate confirmed live in complaint_candidates
-- and were only counted by Detailed complaints, so the two pages did not add up. chat_confirmed follows the branch filter and the window
-- (msg_date), so the summary number can be traced: visit-note complaints + chat_confirmed = the rows of Detailed complaints (client card notes aside).
-- Applied by replacing the text of the live function and raising if it was not found. Levels 3 and up in the UI = level >= 2 here (old numbering).
do $$
declare d text; o text;
begin
  d := pg_get_functiondef('public.client_complaints_summary(text,date,date)'::regprocedure); o := d;
  d := replace(d, $x$      'low_confidence', (select count(*) from v where confidence = 'low'),$x$,
$x$      'chat_confirmed', (select count(*) from public.complaint_candidates cx where cx.status = 'confirmed'
                         and (b = 'all' or cx.branch_code = any(bs)) and (p_from is null or cx.msg_date >= p_from) and (p_to is null or cx.msg_date <= p_to)),
      'low_confidence', (select count(*) from v where confidence = 'low'),$x$);
  if d = o then raise exception 'client_complaints_summary: text not found'; end if;
  execute d;
end $$;
