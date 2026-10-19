-- Lost Client Blasts: a failed send says which template it was (Kate, 19 Oct 2026).
-- The four "Will fail again" sends (respond.io 404, not a contact any more) are sent by hand, and the person picking the template in respond.io needs
-- its exact Meta name and the values for {{1}}, {{2}}. lost_send_jobs_get() now also returns each job's template key and the values it was queued with;
-- the page turns the key into the respond.io name (lost_send_info().templates) and shows both on the failed row. Nothing else about the function changes.
do $patch$
declare d text;
begin
  select pg_get_functiondef('public.lost_send_jobs_get'::regproc) into d;
  if position('''tkey''' in d) = 0 then
    d := replace(d, '''scheduled_for'', j.scheduled_for, ''next_try_at'', j.next_try_at,', '''scheduled_for'', j.scheduled_for, ''next_try_at'', j.next_try_at, ''tkey'', j.tkey, ''params'', j.params,');
    execute d;
  end if;
end $patch$;
