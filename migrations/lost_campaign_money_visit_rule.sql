-- Kate, 27 Oct 2026: the "visited" count in Lost Client Blasts money (lost_campaign_money) follows the same visit
-- rule as clients through the door (door_clients_payment_entry.sql).
--
-- A messaged client now counts as visited only when she has a sale since the first message that has an entry in
-- Payment Type, is not a deposit, balance payment or voucher, and is not rung to BUSINESS TRS; names with the word
-- Staff in them are left out. Before, any line above AED 0 counted, so a retail-only BUSINESS TRS line could do it.
-- The money (actual, the hair / beauty / retail split) is what was paid and is not changed.
--
-- Run this file as it is; it replaces the live definition.

create or replace function public.lost_campaign_money(p_type text DEFAULT NULL::text, p_rate numeric DEFAULT 0.17)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare out jsonb;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with sent as (
    select f.client_key as k, f.branch, f.sent_at
    from public.lost_send_flags f
    where f.status = 'sent' and (nullif(p_type, '') is null or f.qtype = p_type)),
  cost as (select branch, count(*) as n from sent group by branch),
  bk as (
    select distinct on (f.client_key) f.client_key as k, f.branch
    from public.lost_send_flags f where f.booked and (nullif(p_type, '') is null or f.qtype = p_type) order by f.client_key, f.sent_at desc),
  pr as (
    select s.item, percentile_cont(0.5) within group (order by s.total) as med
    from public.sales_transaction_lines s
    where s.date >= current_date - 120 and s.total > 0 and s.item !~* '^\s*(deposit|outstanding balance payment)'
    group by s.item having count(*) >= 3),
  pl as (
    select bk.k, bk.branch, b.date, trim(sv) as svc
    from bk
    join public.client_bookings b on public.stl_key_fold(b.client_key) = bk.k and b.date >= current_date
    cross join lateral unnest(string_to_array(b.services, ', ')) as sv
    where nullif(trim(sv), '') is not null),
  pp as (select pl.*, pr.med from pl left join pr on pr.item = pl.svc),
  pb as (
    select branch, count(distinct k) as clients, count(distinct (k, date)) as appts, coalesce(sum(med), 0) as proj,
           count(*) as svcs, count(*) filter (where med is null) as unpriced
    from pp group by branch),
  fs as (select distinct on (k) k, branch, (sent_at at time zone 'Asia/Dubai')::date as d0 from sent order by k, sent_at),
  sl as (
    select s.date, s.item, s.total, public.stl_key_fold(public.stl_client_key(s.client_name)) as k,
           (coalesce(s.employee_name, '') !~* '^\s*business\M' and s.client_name !~* '\mstaff\M'
            and public.stl_item_kind(s.item) not in ('non_sale', 'voucher')
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as vis_ok
    from public.sales_transaction_lines s
    where s.date >= (select min(d0) from fs) and nullif(trim(s.client_name), '') is not null),
  ln as (select fs.k, fs.branch, sl.item, sl.total, sl.vis_ok from fs join sl on sl.k = fs.k and sl.date >= fs.d0),
  cl as (select * from public.item_classes(coalesce((select array_agg(distinct item) from ln), '{}'::text[]))),
  bt as (select public.stl_name_key(product) as k, bool_or(brand ~* '(matis|image skin|pca skin|xitronix|nouveau|iolite|kinetics|alessandro|madi international|^luk\M|luke''s food)') as beauty
         from public.stock_levels group by 1),
  ac as (
    select ln.k, ln.branch, ln.total, ln.vis_ok,
           case c.family when 'colour' then 'hair_services' when 'cut' then 'hair_services' when 'extensions' then 'hair_services'
                         when 'treat' then 'hair_treat' when 'beauty' then 'beauty_services' when 'nails' then 'beauty_services'
                         when 'retail' then case when bt.k is not null then (case when bt.beauty then 'retail_beauty' else 'retail_hair' end)
                                                 when ln.item ~* '(\mopi\M|\mlash|\mnail|cuticle|facial|sheet mask|\mpeel\M|nutrient toner|\mspf|ormedic|\mskin\M|\meyes\M|papaya mask)' then 'retail_beauty'
                                                 else 'retail_hair' end
                         else 'other' end as b
    from ln join cl c on c.item = ln.item left join bt on bt.k = public.stl_name_key(ln.item)
    where c.category <> 'SKIP' and c.family <> 'skip'),
  ak as (select k, branch, sum(total) as spent, bool_or(vis_ok) as vis from ac group by k, branch),
  ab as (
    select branch, count(distinct k) filter (where spent > 0 and vis) as visited, coalesce(sum(spent), 0) as actual
    from ak group by branch),
  ax as (
    select branch,
           coalesce(sum(total) filter (where b = 'hair_services'), 0) as hair_services, coalesce(sum(total) filter (where b = 'hair_treat'), 0) as hair_treat,
           coalesce(sum(total) filter (where b = 'beauty_services'), 0) as beauty_services, coalesce(sum(total) filter (where b = 'retail_hair'), 0) as retail_hair, coalesce(sum(total) filter (where b = 'retail_beauty'), 0) as retail_beauty,
           coalesce(sum(total) filter (where b = 'other'), 0) as other
    from ac group by branch),
  brs as (select branch from cost union select branch from pb union select branch from ab)
  select jsonb_build_object(
    'at', now(), 'rate', p_rate,
    'cost', jsonb_build_object('sent', (select coalesce(sum(n), 0) from cost), 'aed', (select coalesce(sum(n), 0) from cost) * p_rate),
    'booked', (select jsonb_build_object('clients', (select count(*) from bk), 'with_services', coalesce(sum(clients), 0), 'appts', coalesce(sum(appts), 0),
                 'proj', coalesce(sum(proj), 0), 'svcs', coalesce(sum(svcs), 0), 'unpriced', coalesce(sum(unpriced), 0)) from pb),
    'actual', jsonb_build_object(
      'visited', (select coalesce(sum(visited), 0) from ab), 'total', (select coalesce(sum(actual), 0) from ab),
      'messaged', (select count(*) from fs),
      'hair_services', (select coalesce(sum(hair_services), 0) from ax), 'hair_treat', (select coalesce(sum(hair_treat), 0) from ax),
      'beauty_services', (select coalesce(sum(beauty_services), 0) from ax), 'retail', (select coalesce(sum(retail_hair + retail_beauty), 0) from ax),
      'retail_hair', (select coalesce(sum(retail_hair), 0) from ax), 'retail_beauty', (select coalesce(sum(retail_beauty), 0) from ax),
      'other', (select coalesce(sum(other), 0) from ax)),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', brs.branch, 'sent', coalesce(cost.n, 0), 'cost', coalesce(cost.n, 0) * p_rate,
                   'booked', coalesce(pb.clients, 0), 'appts', coalesce(pb.appts, 0), 'proj', coalesce(pb.proj, 0),
                   'visited', coalesce(ab.visited, 0), 'actual', coalesce(ab.actual, 0)) order by coalesce(cost.n, 0) desc, brs.branch), '[]'::jsonb)
                  from brs left join cost on cost.branch = brs.branch left join pb on pb.branch = brs.branch left join ab on ab.branch = brs.branch))
  into out;
  return out;
end $function$;
