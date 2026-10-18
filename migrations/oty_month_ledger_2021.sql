-- Kate, 18 Oct 2026: Over the Years, Month by month, 2021 January to June.
-- Phorest only holds launch days for Saadiyat, Khalifa City A and Marasy before July 2021 (1 to 6 days a month), but the weekly
-- ledgers hold every day of 2021 (staff, clients) for all three. The ledger has no total takings, only clients and treatment
-- money, so only Clients per staff can be filled for Jan to Jun; Net take and Average bill stay empty for those months.
--
-- The ledger counts about 8 to 20% more clients than Phorest did in Jul to Dec 2021 (ratio 0.79 to 0.93, a different count of
-- who was in the chair). Raw ledger numbers would put a step between June and July, so each branch's Jan to Jun ledger clients are
-- scaled by that branch's own Jul to Dec 2021 ratio (Phorest per staff / ledger clients). The factor is kept on the row (k) and
-- the row is marked src = 'ledger', so the page can say "estimated from the ledger" and show the factor.
--
--   oty_month_branch.src   null for Phorest rows, 'ledger' for the estimated 2021 Jan to Jun rows (net is null on those)
--   oty_month_branch.k     the scaling factor used (Phorest / ledger, Jul to Dec 2021)
-- Rebuilt by oty_month_refresh() hourly like every other row. over_the_years_months() now also returns src and k.
-- Additive: Phorest rows, and every other year, are unchanged.

alter table public.oty_month_branch add column if not exists src text;
alter table public.oty_month_branch add column if not exists k numeric;

create or replace function public.oty_month_refresh()
returns void language plpgsql security definer set search_path to 'public' set work_mem to '128MB'
as $function$
declare v_cut date;
begin
  select max(date) into v_cut from public.financial_totals where date >= date_trunc('year', current_date)::date;
  v_cut := coalesce(v_cut, current_date - 1);

  create temp table _otym on commit drop as
  with m as (select extract(year from f.date)::int y, extract(month from f.date)::int m, f.branch b,
                    round(sum(f.sales_net)) net, (count(distinct f.date) filter (where f.sales_net > 0))::int days
             from public.financial_totals f
             where f.branch in ('SAA','KCA','MC','AQ','MRY') and f.date >= '2021-01-01' group by 1, 2, 3),
  s as (select extract(year from p.date)::int y, extract(month from p.date)::int m, p.branch b, sum(p.visits)::int stf
        from public.phorest_staff_daily p
        where not p.is_total and p.branch in ('SAA','KCA','MC','AQ','MRY') and p.date >= '2021-01-01' group by 1, 2, 3)
  select m.y, m.m, m.b, m.net, m.days, s.stf, null::text src, null::numeric k from m left join s using (y, m, b);

  -- 2021 Jan to Jun from the ledger (Clients per staff only), scaled to Phorest's count by each branch's own Jul to Dec ratio
  create temp table _otyl on commit drop as
  with led as (select b.branch bb, extract(month from b.date)::int m,
                      (count(distinct b.date) filter (where b.total > 0))::int days, sum(b.total) clients
               from public.branch_staff_daily b
               where b.branch in ('SAA','KCA','MRY') and b.date between '2021-01-01' and '2021-12-31' group by 1, 2),
  kk as (select l.bb, sum(o.stf)::numeric / nullif(sum(l.clients), 0) k
         from led l join _otym o on o.y = 2021 and o.m = l.m and o.b = l.bb
         where l.m >= 7 and o.stf > 0 group by 1)
  select 2021 y, l.m, l.bb b, l.days, round(l.clients * kk.k)::int stf, round(kk.k, 3) k
  from led l join kk on kk.bb = l.bb where l.m <= 6 and l.days >= 10;
  delete from _otym o using _otyl l where o.y = l.y and o.m = l.m and o.b = l.b;
  insert into _otym (y, m, b, net, days, stf, src, k) select y, m, b, null, days, stf, 'ledger', k from _otyl;

  insert into public.oty_month_branch (y, m, b, net, days, stf, src, k, cut, refreshed_at)
  select y, m, b, net, days, stf, src, k, v_cut, now() from _otym
  on conflict (y, m, b) do update set net = excluded.net, days = excluded.days, stf = excluded.stf,
    src = excluded.src, k = excluded.k, cut = excluded.cut, refreshed_at = excluded.refreshed_at;
  delete from public.oty_month_branch o where not exists (select 1 from _otym t where t.y = o.y and t.m = o.m and t.b = o.b);
end;
$function$;
revoke all on function public.oty_month_refresh() from public, anon, authenticated;

create or replace function public.over_the_years_months()
returns jsonb language plpgsql stable security invoker set search_path to 'public'
as $function$
declare out jsonb;
begin
  if not public.is_dashboard_user() then raise exception 'Sign in first'; end if;
  select jsonb_build_object(
    'cut', (select max(cut) from public.oty_month_branch),
    'refreshed_at', (select max(refreshed_at) from public.oty_month_branch),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('y', y, 'm', m, 'b', b, 'net', net, 'days', days, 'stf', stf, 'src', src, 'k', k) order by y, m, b), '[]')
               from public.oty_month_branch)
  ) into out;
  return out;
end;
$function$;
grant execute on function public.over_the_years_months() to authenticated;

select public.oty_month_refresh();
