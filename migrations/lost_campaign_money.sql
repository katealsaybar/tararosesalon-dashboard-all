-- Lost Clients, Performance report: the money (Kate, 22 Oct 2026).
-- NOT applied yet: Kate said to build it and not deploy. Run this, then ship lost-report.js (the page copes with the function not
-- being there yet: the section and the spend card just stay out).
--
-- Four numbers, all in AED, all cut by the Which message picker (p_type = 'smoothing' | 'colour' | 'due', null = all, same as the other report functions):
--
--   cost      An ESTIMATE of what the blast cost on respond.io / Meta: real messages sent (lost_send_flags.status = 'sent') times p_rate.
--             The dashboard stores no billing data. 0.17 AED a message is the rate measured on 19 Oct 2026 (about USD 0.046, the vendor's own
--             figure for a UAE marketing message). Meta's invoice has the exact amount. Same rate for both WABAs.
--   proj      The projected spend of the clients who booked after our message (lost_send_flags.booked, the same clients as Booked and deposits):
--             every service on their bookings from today on in client_bookings, priced at the MEDIAN of what that exact service was charged
--             (sales_transaction_lines.total, VAT included, above zero) in the last 120 days, at least 3 sales. Item names match Phorest's
--             exactly, so there is no price list to keep. A service with no price yet (a package, a free item, a new name) counts 0 and is
--             counted in unpriced, so the figure runs low rather than high. Deposits are not taken off: it is what the visit is worth.
--   actual    What clients we messaged have really spent since. Every client with a real message in scope, every sales line from the Dubai
--             date of her first message on, total (VAT included) net of refunds. Deposits, vouchers sold and prepaid courses are left out
--             (a deposit is counted again on the service it pays for), the same rule as Top Clients. Split by the family each item belongs to
--             in Client Mix (item_classes): hair_services = colour, cut, extensions; hair_treat = treatments; beauty_services = beauty and nails;
--             retail = products (a sales line has no hair or beauty department, so retail is one line); other = anything left (consult, unmapped).
--             This is every client messaged who came in, not only those still holding a booking, so it also counts the ones who have
--             already been and left no future booking.
--   by_branch The branch the message came from (the first message for actual), like the other By branch tables.
--
-- A booking or a visit may have nothing to do with our message (made before it, or she was coming anyway), the same caveat the page already
-- carries under Booked. Level 3 and above, money is not shown to coordinators.

create or replace function public.lost_campaign_money(p_type text default null, p_rate numeric default 0.17) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with sent as (
    select f.client_key as k, f.branch, f.sent_at
    from public.lost_send_flags f
    where f.status = 'sent' and (nullif(p_type, '') is null or f.qtype = p_type)),
  cost as (select branch, count(*) as n from sent group by branch),
  -- the clients who booked after our message, and what their bookings from today on are worth
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
  -- what the clients we messaged have spent since
  fs as (select distinct on (k) k, branch, (sent_at at time zone 'Asia/Dubai')::date as d0 from sent order by k, sent_at),
  sl as (
    select s.date, s.item, s.total, public.stl_key_fold(public.stl_client_key(s.client_name)) as k
    from public.sales_transaction_lines s
    where s.date >= (select min(d0) from fs) and nullif(trim(s.client_name), '') is not null),
  ln as (select fs.k, fs.branch, sl.item, sl.total from fs join sl on sl.k = fs.k and sl.date >= fs.d0),
  cl as (select * from public.item_classes(coalesce((select array_agg(distinct item) from ln), '{}'::text[]))),
  ac as (
    select ln.k, ln.branch, ln.total,
           case c.family when 'colour' then 'hair_services' when 'cut' then 'hair_services' when 'extensions' then 'hair_services'
                         when 'treat' then 'hair_treat' when 'beauty' then 'beauty_services' when 'nails' then 'beauty_services'
                         when 'retail' then 'retail' else 'other' end as b
    from ln join cl c on c.item = ln.item
    where c.category <> 'SKIP' and c.family <> 'skip'),
  ak as (select k, branch, sum(total) as spent from ac group by k, branch),
  ab as (
    select branch, count(distinct k) filter (where spent > 0) as visited, coalesce(sum(spent), 0) as actual
    from ak group by branch),
  ax as (
    select branch,
           coalesce(sum(total) filter (where b = 'hair_services'), 0) as hair_services, coalesce(sum(total) filter (where b = 'hair_treat'), 0) as hair_treat,
           coalesce(sum(total) filter (where b = 'beauty_services'), 0) as beauty_services, coalesce(sum(total) filter (where b = 'retail'), 0) as retail,
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
      'beauty_services', (select coalesce(sum(beauty_services), 0) from ax), 'retail', (select coalesce(sum(retail), 0) from ax),
      'other', (select coalesce(sum(other), 0) from ax)),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', brs.branch, 'sent', coalesce(cost.n, 0), 'cost', coalesce(cost.n, 0) * p_rate,
                   'booked', coalesce(pb.clients, 0), 'appts', coalesce(pb.appts, 0), 'proj', coalesce(pb.proj, 0),
                   'visited', coalesce(ab.visited, 0), 'actual', coalesce(ab.actual, 0)) order by coalesce(cost.n, 0) desc, brs.branch), '[]'::jsonb)
                  from brs left join cost on cost.branch = brs.branch left join pb on pb.branch = brs.branch left join ab on ab.branch = brs.branch))
  into out;
  return out;
end $$;

revoke all on function public.lost_campaign_money(text, numeric) from public, anon;
grant execute on function public.lost_campaign_money(text, numeric) to authenticated;
