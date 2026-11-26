-- Out of Stock follows the Weekly Product Plan while it is open (Kate, 26 Nov 2026: "whatever changes ate tine makes (lalo na changing prio a or b on a product) sa weekly product plan eh reflected agad ASAP dito sa OOS").
-- The page already reads the plan live (oos_plan() calls spend_plan_core(), which applies the plan's own edits: Priority, Min, Max, type, name, category). The only delay was the page's memory.
-- oos_plan_stamp() is one cheap call the page makes every 45 seconds and when the tab is looked at again. It returns when the plan was last edited, how many edits, extra rows and scope rows it holds,
-- the newest price list and the newest finished Phorest sync. When it differs from what the page read the data with, the page reads everything again and redraws.
-- Same gate as oos_plan(): oos_access(). Applied to the live project on 26 Nov 2026.
create or replace function public.oos_plan_stamp()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object(
    'plan',   greatest((select max(updated_at) from public.plan_overrides), (select max(edited_at) from public.plan_edit_log)),
    'edits',  (select count(*) from public.plan_overrides),
    'extra',  (select count(*) from public.plan_extra_rows),
    'scope',  (select count(*) from public.plan_scope),
    'prices', (select max(created_at) from public.price_lists),
    'sync',   (select max(finished_at) from public.sync_runs where status = 'done'));
end $function$;
revoke all on function public.oos_plan_stamp() from public, anon;
grant execute on function public.oos_plan_stamp() to authenticated, service_role;
