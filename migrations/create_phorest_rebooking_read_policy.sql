-- Kate, 8 Oct 2026: the Client Funnel's Phorest view reads rebooked from the Staff
-- Performance Tracker (phorest_staff_rebooking). The table has row security on and no
-- policy, so a signed-in dashboard session could not read it (the pushers write through
-- push_insert and the push pass). This is the same read rule phorest_staff_daily already
-- has for dashboard users: a dashboard user, and only their own branch when their sign-in
-- is scoped to one. Read only; nothing here lets anyone write.
create policy dashboard_users_read on public.phorest_staff_rebooking
  for select to authenticated
  using ((select is_dashboard_user())
         and ((select dashboard_scope()) is null or branch = (select dashboard_scope())));
