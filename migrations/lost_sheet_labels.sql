-- Lost Clients review sheets, the quick sync (Kate, 12 Oct 2026): what the dashboard says is taken out, for
-- phorest data export/lost review sheets/lost_review_sheets.py to write into just those Take out? and Note cells.
-- Push-pass gated like lost_sheet_rows / lost_sheet_apply. Returns [{"k": client_key, "r": reason, "n": note}]. Applied live.
create or replace function public.lost_sheet_labels(p_pass uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('k', client_key, 'r', reason, 'n', coalesce(note, ''))) from lost_excluded), '[]'::jsonb);
end $function$;
revoke all on function public.lost_sheet_labels(uuid) from public;
grant execute on function public.lost_sheet_labels(uuid) to anon, authenticated;
