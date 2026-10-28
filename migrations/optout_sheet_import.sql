-- Kate, 28 Oct 2026: Belle's Client Marketing Opt-Out List sheet feeds lost_send_optout on its own (scripts/optout-sheet/pull_optout_sheet.py, daily).
-- Insert only: a number already in lost_send_optout (same last 9 digits) is left as it is, and nothing is ever removed, so a name taken off the sheet
-- stays opted out until someone clears it by hand. Same push pass as the other pushers. p_dry true counts and names what would be added, writes nothing.
-- Applied live 28 Oct 2026.
create or replace function public.optout_sheet_import(p_pass uuid, p_rows jsonb, p_dry boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; d text; added jsonb := '[]'::jsonb; known int := 0; stamp text;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'rows must be a non-empty array'; end if;
  stamp := to_char(now() at time zone 'Asia/Dubai', 'FMDD Mon YYYY');
  for r in select * from jsonb_array_elements(p_rows) loop
    d := regexp_replace(coalesce(r->>'phone', ''), '\D', '', 'g');
    if length(d) < 9 then continue; end if;
    if exists (select 1 from lost_send_optout o where right(regexp_replace(o.phone, '\D', '', 'g'), 9) = right(d, 9)) then
      known := known + 1;
    else
      if not p_dry then
        insert into lost_send_optout (phone, reason, added_at, added_by)
          values ('+' || d, 'Marketing opt-out list kept by reception (' || coalesce(r->>'name', '') || '), added ' || stamp, now(), 'opt-out sheet sync');
      end if;
      added := added || jsonb_build_array(coalesce(r->>'name', '') || ' ' || coalesce(r->>'branch', ''));
    end if;
  end loop;
  return jsonb_build_object('dry', p_dry, 'already_there', known, 'added', jsonb_array_length(added), 'names', added);
end $$;
revoke all on function public.optout_sheet_import(uuid, jsonb, boolean) from public;
grant execute on function public.optout_sheet_import(uuid, jsonb, boolean) to anon;
