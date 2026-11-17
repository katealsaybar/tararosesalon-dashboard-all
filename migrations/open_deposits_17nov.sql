-- Open deposits (Kate, 17 Nov 2026): the second tab of Stripe vs Phorest. A deposit the client paid that has not been taken off a bill yet.
-- Read from the Phorest sales lines (sales_transaction_lines): a 'Deposit' line is a deposit taken (a 'Deposit (Refund)' line is negative and nets it off);
-- a deposit counts as taken off when a LATER sale of the same client at the same salon carries an A(...) tender (the account tender Phorest uses when it
-- redeems a deposit; checked on Shoq Alhosani, KCA, 22 Oct 2026: deposit 400 on 11 Oct, A(400.00) on the bill of 22 Oct). Sales that carry a Deposit line
-- themselves are never counted as a deduction. The four UAE salons only (Bahrain has no Stripe account, Fratelli is closed). Rolling 90 days.
-- CANDIDATES, not proof: the sales lines carry no appointment date, so a client with a booking still ahead is simply 'waiting'. The page says so.
-- Same lock and same speed approach as stripe_vs_phorest: the matching is worked out ahead and kept (open_deposits_cache), refreshed hourly at minute 50
-- by cron, and the page reads it in milliseconds. Nothing is written back to Phorest or Stripe.
-- Who may open it: its own page, Deposit Checking ('depositcheck'): Level 3 and 5, and anyone given 'depositcheck' in dashboard_users.extra_pages (deposit_guard(), below).
-- It was first a tab on Stripe vs Phorest (guarded by stripe_guard()); Kate moved it to its own page the same day.

create table if not exists public.open_deposits_cache (
  branch text not null, client_id text not null, client_name text,
  first_dep date not null, last_dep date not null,
  dep_net numeric not null, a_used numeric not null default 0,
  first_visit_after date,
  computed_at timestamptz not null default now(),
  primary key (branch, client_id));
alter table public.open_deposits_cache enable row level security;

-- p_branch null = all four salons; one salon at a time is used for the first fill, so a signed-in editor call stays short.
create or replace function public.open_deposits_refresh(p_branch text default null) returns jsonb
language plpgsql security definer set search_path to 'public' set statement_timeout to '180s' as $fn$
declare b text; n int := 0; k int;
begin
  for b in select x from unnest(case when p_branch is null then array['KCA','AQ','SAA','MC'] else array[p_branch] end) x loop
    delete from open_deposits_cache where branch = b;
    with dep as materialized (
      select client_id, max(client_name) client_name, min(date) first_dep, max(date) last_dep, sum(total) dep_net
      from sales_transaction_lines
      where branch = b and date >= current_date - 90 and client_id is not null and item ilike 'Deposit%'
      group by 1 having sum(total) > 0),
    dsale as materialized (
      select distinct sale_id from sales_transaction_lines where branch = b and date >= current_date - 90 and item ilike 'Deposit%'),
    sales as materialized (
      select distinct on (l.sale_id) l.sale_id, l.client_id, l.date, l.payment_raw
      from sales_transaction_lines l
      where l.branch = b and l.date >= current_date - 90 and l.client_id in (select client_id from dep) and l.sale_id not in (select sale_id from dsale)),
    red as (
      select d.client_id, sum((m.arr[2])::numeric) a_used
      from dep d join sales s on s.client_id = d.client_id and s.date >= d.first_dep
      cross join lateral regexp_matches(s.payment_raw, '(^|,)A\((-?[0-9.]+)\)', 'g') m(arr)
      group by 1)
    insert into open_deposits_cache (branch, client_id, client_name, first_dep, last_dep, dep_net, a_used, first_visit_after)
      select b, d.client_id, d.client_name, d.first_dep, d.last_dep, d.dep_net, coalesce(r.a_used, 0),
             (select min(s.date) from sales s where s.client_id = d.client_id and s.date > d.last_dep)
      from dep d left join red r using (client_id)
      where d.dep_net - coalesce(r.a_used, 0) > 0;
    get diagnostics k = row_count; n := n + k;
  end loop;
  return jsonb_build_object('rows', n, 'at', now());
end $fn$;
revoke all on function public.open_deposits_refresh(text) from public, anon, authenticated;
-- select cron.schedule('open-deposits-refresh-hourly', '50 * * * *', $$ select public.open_deposits_refresh(); $$);   -- applied live 17 Nov 2026; first fill by salon, 101 clients in 90 days (KCA 46, SAA 33, MC 13, AQ 9)

create or replace function public.deposit_guard() returns text language plpgsql stable security definer set search_path to 'public' as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.name is null or not (m.level in (3, 5) or 'depositcheck' = any (coalesce(m.extra_pages, '{}'::text[]))) then
    raise exception 'Not open to your account';
  end if;
  return m.name;
end $$;

create or replace function public.open_deposits() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare who text := public.deposit_guard();
begin
  return jsonb_build_object('ok', true, 'at', (select max(computed_at) from open_deposits_cache),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('b', branch, 'id', client_id, 'n', client_name, 'f', first_dep, 'l', last_dep,
              'a', dep_net, 'u', a_used, 'v', first_visit_after) order by last_dep) from open_deposits_cache), '[]'::jsonb));
end $$;
grant execute on function public.open_deposits() to authenticated;

-- the page is marked Under construction (page_status), applied live 17 Nov 2026:
-- insert into public.page_status (page_id, status, updated_at, updated_by) values ('depositcheck', 'construction', now(), 'kate@tararosesalon.com') on conflict (page_id) do update set status = 'construction', updated_at = now();

-- Click a number on Deposit Checking to see what the deposit was for (17 Nov 2026): the bills behind one client's open deposit at one salon. Same guard. Phorest sales hold what was rung
-- through, not what was booked, so 'lines' (everything rung through for her after the deposit, except the sale that carries a Deposit line itself, first 120 lines) is the best read of the service.
create or replace function public.open_deposit_detail(p_branch text, p_client text, p_from date) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare who text := public.deposit_guard();
begin
  if p_branch is null or p_branch not in ('KCA','AQ','SAA','MC') or p_client is null or p_from is null then
    raise exception 'Not open to your account';
  end if;
  return jsonb_build_object(
    'deposits', coalesce((select jsonb_agg(jsonb_build_object('d', l.date, 'item', l.item, 't', l.total, 'pay', l.payment_raw) order by l.date, l.id)
        from sales_transaction_lines l where l.branch = p_branch and l.client_id = p_client and l.date >= p_from and l.item ilike 'Deposit%'), '[]'::jsonb),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('d', l.date, 'sale', l.sale_id, 'item', l.item, 'staff', l.employee_name, 't', l.total, 'pay', l.payment_raw) order by l.date, l.id)
        from (select * from sales_transaction_lines x
              where x.branch = p_branch and x.client_id = p_client and x.date >= p_from and x.item not ilike 'Deposit%'
                and x.sale_id not in (select y.sale_id from sales_transaction_lines y where y.branch = p_branch and y.client_id = p_client and y.date >= p_from and y.item ilike 'Deposit%')
              order by x.date, x.id limit 120) l), '[]'::jsonb));
end $$;
grant execute on function public.open_deposit_detail(text, text, date) to authenticated;

-- Next appointment (17 Nov 2026: "next appointment date wala beh dapat meron"): the earliest booking from today in client_bookings (the Phorest diary, read each morning) for the same salon,
-- matched by client name (stl_client_key), with what she is booked for and with whom. Applied live 17 Nov 2026; 60 of the 101 clients had one. A booked client is 'waiting' on the page, not overdue.
alter table public.open_deposits_cache add column if not exists next_appt date, add column if not exists next_services text, add column if not exists next_staff text;
-- open_deposits_refresh() above gains a 'bk' CTE and a lateral join that fill next_appt, next_services and next_staff; open_deposits() returns them as na, ns, nst.
-- (The live definitions are the ones in the database; this file keeps the first version of the refresh body.)
