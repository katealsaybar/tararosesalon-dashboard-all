-- Lost Clients review sheets: an opted-out client who has dropped off the lists still says why (Kate, 13 Oct 2026).
-- Max Weiner and Meg Cassavo replied "stop" in respond.io, so they left every group and the sheet said "Off the list now (not messaged)".
-- lost_sheet_optouts(pass) returns the client keys of everyone opted out or blocked in respond.io, listed or not (the wa status of
-- lost_lists_core_x), so lost_review_sheets.py can write "Opted out based on respond.io (not messaged)" for them. Push-pass gated.
-- Applied live 13 Oct 2026.
create or replace function public.lost_sheet_optouts(p_pass uuid) returns jsonb
language plpgsql stable security definer
set search_path to 'public' set statement_timeout to '60s'
as $function$
declare out jsonb;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  select coalesce(jsonb_agg(c.client_key), '[]'::jsonb) into out
  from public.lost_lists_core_x(2) c where c.wa in ('optout', 'blocked');
  return out;
end $function$;
revoke all on function public.lost_sheet_optouts(uuid) from public;
grant execute on function public.lost_sheet_optouts(uuid) to anon, authenticated;
