-- Branch scope on dashboard_users (Kate, 30 Sep 2026).
--   scope null   everyone who was already on the list: every branch, as before.
--   scope 'BAH'  Tara Rose Salon Bahrain's team: Bahrain rows only.
-- The page reads it through dashboard_me() and shows a scoped person their one
-- branch on the four Bahrain pages (index.html applyScope). This file is the
-- server's half: a scoped session's reads return that branch's rows and nothing
-- else, so hiding the UAE is not left to the page alone.
-- Who has a scope lives in public.dashboard_users (kept out of this public repo):
--   update public.dashboard_users set scope = 'BAH' where email = '...';
--
-- Not covered, on purpose, to be closed with the anon key (Phase B):
--   * anon_all / "Public" policies. anon_all is the anon role only, so a signed-in
--     scoped session never gets it; daily_data, weekly_data and weekly_totals still
--     carry "Public" (all roles) read policies. The page filters those itself.
--   * security definer RPCs (get_top_services, get_top_clients, get_product_spend,
--     perf_*): they bypass RLS. The pages that call them are not offered to a
--     scoped sign-in.

alter table public.dashboard_users add column if not exists scope text;
alter table public.dashboard_users drop constraint if exists dashboard_users_scope_check;
alter table public.dashboard_users add constraint dashboard_users_scope_check
  check (scope is null or scope in ('BAH'));

create or replace function public.dashboard_scope() returns text
language sql stable security definer set search_path = '' as $$
  select d.scope from public.dashboard_users d
  join auth.users u on lower(u.email) = d.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
revoke all on function public.dashboard_scope() from public, anon;
grant execute on function public.dashboard_scope() to authenticated;

-- The header greeting, now with the scope beside the role.
drop function if exists public.dashboard_me();
create function public.dashboard_me() returns table (name text, role text, scope text)
language sql stable security definer set search_path = '' as $$
  select d.name, d.role, d.scope from public.dashboard_users d
  join auth.users u on lower(u.email) = d.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
revoke all on function public.dashboard_me() from public, anon;
grant execute on function public.dashboard_me() to authenticated;

do $$
declare t text;
begin
  -- Tables with a branch column: a scoped reader gets their branch's rows.
  foreach t in array array['branch_staff_daily','branch_targets','closed_days','daily_data',
    'financial_totals','google_reviews','phorest_staff_daily','sales_transaction_lines',
    'service_data','staff_financial_totals','staff_targets','staff_utilisation',
    'stock_order_lines','top_services','weekly_data','weekly_totals']
  loop
    execute format('drop policy if exists dashboard_users_read on public.%I', t);
    execute format('create policy dashboard_users_read on public.%I for select to authenticated
      using ((select public.is_dashboard_user())
             and ((select public.dashboard_scope()) is null or branch = (select public.dashboard_scope())))', t);
  end loop;
  -- No branch column (UAE staff and product lists): nothing for a scoped reader.
  foreach t in array array['product_usage','staff_status']
  loop
    execute format('drop policy if exists dashboard_users_read on public.%I', t);
    execute format('create policy dashboard_users_read on public.%I for select to authenticated
      using ((select public.is_dashboard_user()) and (select public.dashboard_scope()) is null)', t);
  end loop;
end $$;
