-- Kate, 17 Nov 2026: push_replace, an atomic "replace this branch-day" for the cloud sync. DRAFT, NOT APPLIED.
-- The PC pushers and the first cloud runner delete a branch-day and then insert it, as two separate calls. If the insert fails after the delete,
-- that branch-day is blank until the next sync. push_replace does both in ONE call, so one transaction: if the insert fails, the delete is undone.
-- It reuses push_delete and push_insert, so it only touches the six push tables, needs the same pass, and a delete still needs a branch.
-- It refuses to run with no rows, so an empty list can never blank a day by accident.
--
-- Used for: Staff Daily, Staff Financial Totals, Sales Transaction lines, Utilisation, Tracker (Financial Totals is already an upsert).
--
-- To undo: drop function if exists public.push_replace(uuid, text, jsonb, jsonb, text[]);

create or replace function public.push_replace(p_pass uuid, p_table text, p_eq jsonb, p_rows jsonb, p_conflict text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d int; i int;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'push_replace needs at least one row; nothing was deleted';
  end if;
  d := public.push_delete(p_pass, p_table, p_eq);
  i := public.push_insert(p_pass, p_table, p_rows, p_conflict);
  return jsonb_build_object('deleted', d, 'inserted', i);
end $$;

revoke all on function public.push_replace(uuid, text, jsonb, jsonb, text[]) from public;
grant execute on function public.push_replace(uuid, text, jsonb, jsonb, text[]) to anon;   -- the runner sends the public key plus its pass, like push_insert
