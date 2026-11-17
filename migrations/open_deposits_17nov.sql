-- Open deposits (Kate, 17 Nov 2026): the second tab of Stripe vs Phorest. A deposit the client paid that has not been taken off a bill yet.
-- Read from the Phorest sales lines (sales_transaction_lines): a 'Deposit' line is a deposit taken (a 'Deposit (Refund)' line is negative and nets it off);
-- a deposit counts as taken off when a LATER sale of the same client at the same salon carries an A(...) tender (the account tender Phorest uses when it
-- redeems a deposit; checked on Shoq Alhosani, KCA, 22 Oct 2026: deposit 400 on 11 Oct, A(400.00) on the bill of 22 Oct). Sales that carry a Deposit line
-- themselves are never counted as a deduction. The four UAE salons only (Bahrain has no Stripe account, Fratelli is closed). Rolling 90 days.
-- CANDIDATES, not proof: the sales lines carry no appointment date, so a client with a booking still ahead is simply 'waiting'. The page says so.
-- Same lock and same speed approach as stripe_vs_phorest: the matching is worked out ahead and kept (open_deposits_cache), refreshed hourly at minute 50
-- by cron, and the page reads it in milliseconds. Nothing is written back to Phorest or Stripe.
-- Who may open it: the same people as Stripe vs Phorest (stripe_guard(): Level 3 and 5, and anyone given 'stripedeposits' in dashboard_users.extra_pages).

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

create or replace function public.open_deposits() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare who text := public.stripe_guard();
begin
  return jsonb_build_object('ok', true, 'at', (select max(computed_at) from open_deposits_cache),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('b', branch, 'id', client_id, 'n', client_name, 'f', first_dep, 'l', last_dep,
              'a', dep_net, 'u', a_used, 'v', first_visit_after) order by last_dep) from open_deposits_cache), '[]'::jsonb));
end $$;
grant execute on function public.open_deposits() to authenticated;
