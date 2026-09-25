-- Phase A of the dashboard sign-in (Kate, 25 Sep 2026). Applied live on 25 Sep 2026.
-- The list of people allowed in, and a matching "signed in and on the list" policy on
-- every table the dashboard reads or the Upload Portal writes. Nothing anon can do is
-- taken away here; dashboard_sign_in_phase_b.sql does that.
-- To add someone later: -- The 20 people Kate listed on 25 Sep 2026 were inserted live. The list is kept out of
-- this file because the repo is public; read it with: select * from public.dashboard_users;

-- The signed-in person's dashboard role, or null. Only a confirmed email counts, so
-- nobody can sign up as tara@ with a password without owning that inbox.
create or replace function public.dashboard_role() returns text
language sql stable security definer set search_path = '' as $$
  select d.role from public.dashboard_users d
  join auth.users u on lower(u.email) = d.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
create or replace function public.is_dashboard_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.dashboard_role() is not null
$$;
revoke all on function public.dashboard_role() from public, anon;
revoke all on function public.is_dashboard_user() from public, anon;
grant execute on function public.dashboard_role() to authenticated;
grant execute on function public.is_dashboard_user() to authenticated;

-- Lets the sign-up screen say "that email isn't on the list" before creating an account.
create or replace function public.dashboard_email_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dashboard_users where email = lower(trim(p_email)))
$$;
revoke all on function public.dashboard_email_allowed(text) from public;
grant execute on function public.dashboard_email_allowed(text) to anon, authenticated;

-- The "Data as of" line on the sign-in card, readable before signing in (a timestamp only).
create or replace function public.dashboard_data_asof() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(
    (select max(created_at) from public.branch_staff_daily),
    (select max(created_at) from public.phorest_staff_daily))
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
    execute format('create policy dashboard_users_all on public.%I for all to authenticated
      using ((select public.is_dashboard_user())) with check ((select public.is_dashboard_user()))', t);
  end loop;
  foreach t in array array['google_reviews','staff_name_variants']
  loop
    execute format('drop policy if exists dashboard_users_read on public.%I', t);
    execute format('create policy dashboard_users_read on public.%I for select to authenticated
      using ((select public.is_dashboard_user()))', t);
  end loop;
end $$;
