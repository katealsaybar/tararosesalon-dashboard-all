-- Complaint alerts link straight to the complaint (Kate, 29 Oct 2026: "with a direct link to the complaint record"). The alert carries
-- ?view=complaintlog&cid=<id>, and Log a Complaint opens that record. For that client_complaints_list gets one more optional argument, p_id,
-- that keeps only that complaint, whatever the filters and the page. Everything else about the function is unchanged: this takes the live
-- definition, adds the argument and one condition, drops the old signature (so named calls stay unambiguous) and keeps the same grants.
do $m$
declare
  d text;
  old_sig text := 'public.client_complaints_list(text, text, text, text, text, boolean, integer, integer, text, text, text, date, date, text, text)';
begin
  if exists (select 1 from pg_proc where proname = 'client_complaints_list' and pronamespace = 'public'::regnamespace
             and pg_get_function_identity_arguments(oid) like '%p_id bigint%') then
    return;   -- already applied
  end if;
  select pg_get_functiondef(oid) into d from pg_proc
   where proname = 'client_complaints_list' and pronamespace = 'public'::regnamespace;
  d := replace(d, 'p_flag text DEFAULT ''all''::text)', 'p_flag text DEFAULT ''all''::text, p_id bigint DEFAULT NULL::bigint)');
  d := replace(d, '      and (coalesce(p_status, ''all'') = ''all'' or c.status = p_status)' || chr(10),
                  '      and (coalesce(p_status, ''all'') = ''all'' or c.status = p_status)' || chr(10) || '      and (p_id is null or c.id = p_id)' || chr(10));
  if position('p_id bigint' in d) = 0 or position('c.id = p_id' in d) = 0 then raise exception 'client_complaints_list changed shape, edit by hand'; end if;
  execute 'drop function ' || old_sig;
  execute d;
  execute 'revoke all on function public.client_complaints_list(text, text, text, text, text, boolean, integer, integer, text, text, text, date, date, text, text, bigint) from public, anon';
  execute 'grant execute on function public.client_complaints_list(text, text, text, text, text, boolean, integer, integer, text, text, text, date, date, text, text, bigint) to authenticated, service_role';
end
$m$;
