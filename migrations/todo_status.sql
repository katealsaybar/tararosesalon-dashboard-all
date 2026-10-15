-- Kate, 15 Oct 2026: two small guards for the To do list, found when the build was stress tested.
--
-- 1. todo_status(): when the hourly and the daily run last finished, so the page can say "this list may be
--    out of date" if either has stopped. Without it a failing refresh is silent: the sync rule that would
--    report a stopped job lives inside the same function. sync_health has no policy for the page, so the
--    answer comes through this function, for whoever may open the To do page.
-- 2. todo_refresh_now(): the Refresh now button no longer reruns everything on every tap. If the list was
--    refreshed in the last 60 seconds it returns the count without rerunning.

create or replace function public.todo_status() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.kb_can_read('todo') then return null; end if;
  return jsonb_build_object(
    'fast',  (select last_ok_at from sync_health where name = 'todo-refresh'),
    'staff', (select last_ok_at from sync_health where name = 'todo-refresh-staff'));
end $$;
revoke all on function public.todo_status() from public, anon;
grant execute on function public.todo_status() to authenticated;

create or replace function public.todo_refresh_now() returns integer
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.kb_can_read('todo') then raise exception 'not allowed'; end if;
  if coalesce((select last_run_at from sync_health where name = 'todo-refresh'), 'epoch') > now() - interval '60 seconds' then
    return (select count(*)::integer from todo_items where status = 'open');
  end if;
  return public.todo_refresh();
end $$;
revoke all on function public.todo_refresh_now() from public, anon;
grant execute on function public.todo_refresh_now() to authenticated;
