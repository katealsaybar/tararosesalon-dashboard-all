-- Dashboard access levels (Kate, 25 Sep 2026). Applied live on 25 Sep 2026.
--   owner    Kate. Everything, including every Upload Portal tab.
--   payroll  The accounts and admin team. The dashboard, plus the Upload Portal's
--            Payslips tab only (payslips themselves are still checked by the
--            payslips edge function's payroll key).
--   team     Everyone else on the list. The whole dashboard, no Upload Portal.
-- Reading dashboard data stays open to every level; changing it is owner only.
-- Until Phase B drops the anon policies, the public key can still write.
-- Who has which role lives in public.dashboard_users (kept out of this public repo):
--   update public.dashboard_users set role = 'payroll' where email = '...';

alter table public.dashboard_users drop constraint if exists dashboard_users_role_check;
alter table public.dashboard_users alter column role set default 'team';
alter table public.dashboard_users add constraint dashboard_users_role_check
  check (role in ('owner', 'payroll', 'team'));

create or replace function public.is_dashboard_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.dashboard_role() = 'owner'
$$;
revoke all on function public.is_dashboard_owner() from public, anon;
grant execute on function public.is_dashboard_owner() to authenticated;

-- The header greeting.
create or replace function public.dashboard_me() returns table (name text, role text)
language sql stable security definer set search_path = '' as $$
  select d.name, d.role from public.dashboard_users d
  join auth.users u on lower(u.email) = d.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
revoke all on function public.dashboard_me() from public, anon;
grant execute on function public.dashboard_me() to authenticated;

-- The sign-in card: newest day per feed, not the newest insert time.
drop function if exists public.dashboard_data_asof();
create function public.dashboard_data_asof() returns table (ledger date, phorest date)
language sql stable security definer set search_path = '' as $$
  select (select max(date) from public.branch_staff_daily),
         (select max(date) from public.phorest_staff_daily)
$$;
revoke all on function public.dashboard_data_asof() from public;
grant execute on function public.dashboard_data_asof() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['branch_staff_daily','branch_targets','closed_days','daily_data',
    'financial_totals','phorest_staff_daily','product_usage','sales_transaction_lines',
    'service_data','staff_financial_totals','staff_status','staff_targets','staff_utilisation',
    'top_services','weekly_data','weekly_totals']
  loop
    execute format('drop policy if exists dashboard_users_all on public.%I', t);
    execute format('drop policy if exists dashboard_users_read on public.%I', t);
    execute format('drop policy if exists dashboard_owner_insert on public.%I', t);
    execute format('drop policy if exists dashboard_owner_update on public.%I', t);
    execute format('drop policy if exists dashboard_owner_delete on public.%I', t);
    execute format('create policy dashboard_users_read on public.%I for select to authenticated
      using ((select public.is_dashboard_user()))', t);
    execute format('create policy dashboard_owner_insert on public.%I for insert to authenticated
      with check ((select public.is_dashboard_owner()))', t);
    execute format('create policy dashboard_owner_update on public.%I for update to authenticated
      using ((select public.is_dashboard_owner())) with check ((select public.is_dashboard_owner()))', t);
    execute format('create policy dashboard_owner_delete on public.%I for delete to authenticated
      using ((select public.is_dashboard_owner()))', t);
  end loop;
end $$;
