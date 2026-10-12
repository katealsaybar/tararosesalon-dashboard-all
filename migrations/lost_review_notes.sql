-- Lost Clients review: notes, and the review file upload (Kate, 12 Oct 2026).
-- lost_excluded already had a note column; this lets it be filled from the two new places:
--   lost_exclude_bulk(items, clear)   the page's Upload review file (Level 2 and above): items = [{"k": client_key,
--                                     "r": reason, "n": note}], clear = client keys to put back. One call, one transaction.
--   lost_sheet_rows / lost_sheet_apply  the reception Sheets now carry a Note column: rows return excluded_note, and the
--                                     apply call takes a note per item (n). A change is a new reason OR a new note.
-- Additive; same signatures.

create or replace function public.lost_exclude_bulk(p_items jsonb, p_clear text[]) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare who text; ns int := 0; nc int := 0;
begin
  select m.name into who from public.dashboard_me() m limit 1;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 3000 or coalesce(array_length(p_clear, 1), 0) > 3000 then raise exception 'too many at once'; end if;
  insert into lost_excluded (client_key, reason, note, set_by)
    select distinct on (x->>'k') x->>'k', x->>'r', nullif(btrim(left(coalesce(x->>'n', ''), 200)), ''), who
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
    where coalesce(x->>'k', '') <> '' and x->>'r' in ('Visiting regularly','Stylist knows her','Do not contact','Wrong number','Other')
  on conflict (client_key) do update set reason = excluded.reason, note = excluded.note, set_by = excluded.set_by, set_at = now()
    where (lost_excluded.reason, lost_excluded.note) is distinct from (excluded.reason, excluded.note);
  get diagnostics ns = row_count;
  delete from lost_excluded where client_key = any(coalesce(p_clear, '{}'::text[]));
  get diagnostics nc = row_count;
  return jsonb_build_object('set', ns, 'cleared', nc);
end $function$;
revoke all on function public.lost_exclude_bulk(jsonb, text[]) from public, anon;
grant execute on function public.lost_exclude_bulk(jsonb, text[]) to authenticated;

create or replace function public.lost_sheet_rows(p_pass uuid, p_branch text) returns jsonb
language plpgsql stable security definer
set search_path to 'public' set statement_timeout to '60s'
as $function$
declare out jsonb;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_branch not in ('SAA','KCA','MC','AQ') then raise exception 'unknown branch'; end if;
  with c as (select * from public.lost_lists_core_x(2) co where co.branch = p_branch and (co.f1 or co.f2 or co.f3 or co.f4 or co.f5))
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', c.client_key, 'client_name', c.client_name, 'area', c.area, 'last_visit', c.last_visit,
      'last_service', greatest(c.last_keratin, c.last_colour, c.last_toner, b.last_other),
      'stylist', c.stylist, 'booked_on', c.booked_on,
      'excluded', e.reason, 'excluded_note', e.note, 'excluded_by', e.set_by) order by lower(c.client_name)), '[]'::jsonb)
  into out
  from c left join lost_lists_base b on b.client_key = c.client_key
         left join lost_excluded e on e.client_key = c.client_key;
  return out;
end $function$;

create or replace function public.lost_sheet_apply(p_pass uuid, p_set jsonb, p_clear text[], p_by text) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare ns int := 0; nc int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if jsonb_array_length(coalesce(p_set, '[]'::jsonb)) > 3000 or coalesce(array_length(p_clear, 1), 0) > 3000 then raise exception 'too many at once'; end if;
  insert into lost_excluded (client_key, reason, note, set_by)
    select distinct on (x->>'k') x->>'k', x->>'r', nullif(btrim(left(coalesce(x->>'n', ''), 200)), ''), left(coalesce(p_by, 'Sheet'), 80)
    from jsonb_array_elements(coalesce(p_set, '[]'::jsonb)) x
    where coalesce(x->>'k', '') <> '' and x->>'r' in ('Visiting regularly','Stylist knows her','Do not contact','Wrong number','Other')
  on conflict (client_key) do update set reason = excluded.reason, note = excluded.note, set_by = excluded.set_by, set_at = now()
    where (lost_excluded.reason, lost_excluded.note) is distinct from (excluded.reason, excluded.note);
  get diagnostics ns = row_count;
  delete from lost_excluded where client_key = any(coalesce(p_clear, '{}'::text[]));
  get diagnostics nc = row_count;
  return jsonb_build_object('set', ns, 'cleared', nc);
end $function$;
