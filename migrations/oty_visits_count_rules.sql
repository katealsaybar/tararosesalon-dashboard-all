-- Kate, 27 Oct 2026: Over the Years "Clients · per visit" (oty_year_branch.vis, vis_y) counts clients through the
-- door by the same rules as door_clients (door_clients_payment_entry.sql).
--
-- Before it was count(distinct sale_id): one number per sale, so a client with a deposit sale, a balance sale and
-- a service sale counted three times, and staff bookings, BUSINESS TRS retail and AED 0 consultations counted too.
-- Now one count per client per day, only when she has a sale with an entry in Payment Type and a line that is not a
-- deposit, balance payment or voucher and is not rung to BUSINESS TRS; walk-ins and names with the word Staff in
-- them are left out.
--
-- Only the v step of oty_refresh changes. Run this file as it is, then select public.oty_refresh() to rebuild
-- oty_year_branch (the cron does the same on its schedule).

create or replace function public.oty_refresh()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET work_mem TO '128MB'
AS $function$
declare v_cut date; v_m int; v_d int;
begin
  select max(date) into v_cut from public.financial_totals where date >= date_trunc('year', current_date)::date;
  v_cut := coalesce(v_cut, current_date - 1);
  v_m := extract(month from v_cut)::int; v_d := extract(day from v_cut)::int;

  create temp table _oty on commit drop as
  with c as (select * from public.oty_cuts(v_m, v_d)),
  m as (select extract(year from f.date)::int y, f.branch b, round(sum(f.sales_net)) net,
               round(sum(f.sales_net) filter (where f.date <= c.c)) net_y, count(distinct f.date)::int days
        from public.financial_totals f join c on c.y = extract(year from f.date)::int
        where f.branch in ('SAA','KCA','MC','AQ','FRT','MRY') and f.date >= '2021-01-01' group by 1, 2),
  kk as materialized (
        select ik, public.stl_item_kind(ik) as kind
        from (select distinct coalesce(item, '') as ik from public.sales_transaction_lines where date >= '2021-01-01') d),
  vl as (select l.branch b, l.date d, lower(trim(l.client_name)) cn,
               (kk.kind not in ('non_sale', 'voucher') and coalesce(l.employee_name, '') !~* '^\s*business\M') as is_real,
               bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid
        from public.sales_transaction_lines l join kk on kk.ik = coalesce(l.item, '')
        where l.branch in ('SAA','KCA','MC','AQ','FRT','MRY') and l.date >= '2021-01-01'
          and coalesce(trim(l.client_name), '') <> ''
          and l.client_name !~* '^\s*walk[\s-]*in\M' and l.client_name !~* '\mstaff\M'),
  vd as (select b, d, cn from vl group by b, d, cn having bool_or(is_real and sale_paid)),
  v as (select extract(year from vd.d)::int y, vd.b, count(*)::int vis,
               (count(*) filter (where vd.d <= c.c))::int vis_y
        from vd join c on c.y = extract(year from vd.d)::int group by 1, 2),
  s as (select extract(year from p.date)::int y, p.branch b, sum(p.visits)::int stf,
               (sum(p.visits) filter (where p.date <= c.c))::int stf_y
        from public.phorest_staff_daily p join c on c.y = extract(year from p.date)::int
        where not p.is_total and p.branch in ('SAA','KCA','MC','AQ','FRT','MRY') and p.date >= '2021-01-01' group by 1, 2),
  r as (select extract(year from g.review_date)::int y, g.b, count(*)::int rev_n, round(avg(g.stars)::numeric, 2) rev_st,
               (count(*) filter (where g.review_date <= c.c))::int rev_n_y,
               round((avg(g.stars) filter (where g.review_date <= c.c))::numeric, 2) rev_st_y
        from (select case branch when 'Saadiyat, Abu Dhabi' then 'SAA' when 'Khalifa City A, Abu Dhabi' then 'KCA'
                                 when 'Motor City, Dubai' then 'MC' when 'Al Quoz, Dubai' then 'AQ' when 'Marasy, Abu Dhabi' then 'MRY' end b, review_date, stars
              from public.google_reviews where review_date >= '2021-01-01') g
        join c on c.y = extract(year from g.review_date)::int where g.b is not null group by 1, 2),
  g as (select extract(year from d.date)::int y, d.branch b, count(distinct d.date)::int led_days
        from public.branch_staff_daily d
        where d.branch in ('SAA','KCA','MC','AQ','FRT','MRY') and d.date >= '2021-01-01' and d.date <= current_date group by 1, 2),
  k as (select y, b from m union select y, b from v union select y, b from s union select y, b from r union select y, b from g)
  select k.y, k.b, m.net, m.net_y, m.days, v.vis, v.vis_y, s.stf, s.stf_y, r.rev_n, r.rev_st, r.rev_n_y, r.rev_st_y, g.led_days
  from k left join m using (y, b) left join v using (y, b) left join s using (y, b) left join r using (y, b) left join g using (y, b);

  insert into public.oty_year_branch (y, b, net, net_y, days, vis, vis_y, stf, stf_y, rev_n, rev_st, rev_n_y, rev_st_y, led_days, cut, refreshed_at)
  select y, b, net, net_y, days, vis, vis_y, stf, stf_y, rev_n, rev_st, rev_n_y, rev_st_y, led_days, v_cut, now() from _oty
  on conflict (y, b) do update set net = excluded.net, net_y = excluded.net_y, days = excluded.days, vis = excluded.vis,
    vis_y = excluded.vis_y, stf = excluded.stf, stf_y = excluded.stf_y, rev_n = excluded.rev_n, rev_st = excluded.rev_st,
    rev_n_y = excluded.rev_n_y, rev_st_y = excluded.rev_st_y, led_days = excluded.led_days, cut = excluded.cut, refreshed_at = excluded.refreshed_at;
  delete from public.oty_year_branch o where not exists (select 1 from _oty t where t.y = o.y and t.b = o.b);
end;
$function$;
