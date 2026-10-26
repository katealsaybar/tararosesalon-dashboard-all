-- Blast 4 send panel: wv_last_info returns first_sent_at (when the first message of each list went) next to last_run_at, so a list that has
-- gone shows Send at (Kate, 26 Oct 2026). Applied live 26 Oct as a patch of the live function, so it keeps whatever wv_last_info says today.
do $mig$
declare d text;
begin
  select pg_get_functiondef('public.wv_last_info'::regproc) into d;
  if d not like '%first_sent_at%' then
    d := replace(d, 'max(j.sent_at) as last_run_at,', 'max(j.sent_at) as last_run_at, min(j.sent_at) as first_sent_at,');
    execute d;
  end if;
end $mig$;
