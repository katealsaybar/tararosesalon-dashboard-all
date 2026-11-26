-- Out of Stock, how many CLIENTS are behind the booked colour services (Kate, 26 Nov 2026: "tapos add ka pa isa column for no. of clients").
--
-- STATUS: APPLIED on 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_demand_clients), on Kate's word. Read only: replaces oos_demand(), nothing is written.
--
-- Booked on the page means booked colour SERVICES: every phorest_appointments row is one booked service with its own appt_id, and the same client can hold several
-- (next week 26 Nov: Khalifa City A 86 services for 77 clients, Saadiyat 99 for 85, Motor City 72 for 42, Al Quoz 51 for 42). So v3 adds DISTINCT client counts, counts only, never a name:
--   per salon and in 'all' (the four salons together, one client counted once even across salons):
--     cl_k       distinct clients booked in each of the four weeks ahead
--     cl_cum     distinct clients booked in weeks 1, 1 to 2, 1 to 3, 1 to 4 (a client in two weeks counts once)
--     grp_k      [kind, services, distinct clients] per week (the third item is new)
--     grp_cum    per j = 1..4: [[kind, distinct clients in weeks 1 to j]]
-- Everything v2 returned is unchanged (now, now_k, hist, grp, weeks, synced), so the live page keeps working. Across salons only 1 of about 1,000 clients books at two salons in the same weeks,
-- so the page adds the salons picked when it is not all four.
-- Gate and the colour pattern are the same as v1 (see out_of_stock_demand.sql).

create or replace function public.oos_demand()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  today   date := (now() at time zone 'Asia/Dubai')::date;
  nxt     date := date_trunc('week', (now() at time zone 'Asia/Dubai')::date)::date + 7;
  lead    int  := ((date_trunc('week', (now() at time zone 'Asia/Dubai')::date)::date + 7) - (now() at time zone 'Asia/Dubai')::date);
  col     text := '(toner|colou?r|foils|balayage|root|bleach|ombre|face frame|partial|stretch|hairline|gloss|3/4|FH )';
  nocol   text := '(lock trt|polish|gel|nail|eyebrow|tint|lash|treatment)';
  res     jsonb;
  first_full date;
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;

  select case when extract(isodow from min(date)) = 1 then min(date) else date_trunc('week', min(date))::date + 7 end into first_full
    from public.phorest_appointments where branch in ('KCA', 'SAA', 'MC', 'AQ');

  with a as (
    select branch, date, booked_at, service, synced_at, client_id,
           case when service ~* 'toner|gloss' then 'Toner and gloss'
                when service ~* 'root|hairline|stretch|face frame' then 'Roots'
                when service ~* 'balayage|ombre' then 'Balayage and ombre'
                when service ~* 'foils|partial|3/4|FH ' then 'Foils'
                when service ~* 'bleach' then 'Bleach'
                else 'All over and other colour' end g
      from public.phorest_appointments
     where branch in ('KCA', 'SAA', 'MC', 'AQ')
       and date >= nxt - 7 * 13 and date < nxt + 28
       and service ~* col and service !~* nocol
  ),
  hist as (
    select branch, date_trunc('week', date)::date wk, count(*) done,
           count(*) filter (where booked_at::date <= date_trunc('week', date)::date - lead) b1,
           count(*) filter (where booked_at::date <= date_trunc('week', date)::date - (lead + 7)) b2,
           count(*) filter (where booked_at::date <= date_trunc('week', date)::date - (lead + 14)) b3,
           count(*) filter (where booked_at::date <= date_trunc('week', date)::date - (lead + 21)) b4
      from a
     where date_trunc('week', date)::date + 6 < today and date_trunc('week', date)::date >= nxt - 7 * 13
       and date_trunc('week', date)::date >= first_full
     group by 1, 2
  ),
  hist12 as (select * from (select h.*, row_number() over (partition by branch order by wk desc) rn from hist h) q where rn <= 12),
  now_ as (
    select branch,
           count(*) filter (where date between nxt and nxt + 6) n1,
           count(*) filter (where date between nxt + 7 and nxt + 13) n2,
           count(*) filter (where date between nxt + 14 and nxt + 20) n3,
           count(*) filter (where date between nxt + 21 and nxt + 27) n4
      from a group by 1
  ),
  -- the next four weeks only, per salon and 'ALL' (the four salons together)
  f as (select branch, date, client_id, g from a where date between nxt and nxt + 27
        union all select 'ALL', date, client_id, g from a where date between nxt and nxt + 27),
  ks as (select generate_series(1, 4) k),
  grp as (
    select branch, ((date - nxt) / 7 + 1) k, g, count(*) n, count(distinct client_id) cl from f group by 1, 2, 3
  ),
  grpc as (
    select f.branch, ks.k j, f.g, count(distinct f.client_id) cl from f join ks on f.date between nxt and nxt + 7 * ks.k - 1 group by 1, 2, 3
  ),
  clk as (
    select branch, ks.k, count(distinct client_id) filter (where date between nxt + 7 * (ks.k - 1) and nxt + 7 * ks.k - 1) cl,
           count(distinct client_id) filter (where date between nxt and nxt + 7 * ks.k - 1) cum
      from f cross join ks group by 1, 2
  ),
  sal as (select unnest(array['KCA', 'SAA', 'MC', 'AQ']) b)
  select jsonb_build_object(
    'today', today, 'week_from', nxt, 'week_to', nxt + 6, 'lead', lead,
    'weeks', (select jsonb_agg(jsonb_build_object('k', k, 'from', nxt + 7 * (k - 1), 'to', nxt + 7 * (k - 1) + 6, 'lead', lead + 7 * (k - 1)) order by k) from ks),
    'synced', (select max(synced_at) from public.phorest_appointments),
    'all', jsonb_build_object(
        'cl_k', (select jsonb_agg(cl order by k) from clk where branch = 'ALL'),
        'cl_cum', (select jsonb_agg(cum order by k) from clk where branch = 'ALL'),
        'grp_k', (select jsonb_agg(coalesce((select jsonb_agg(jsonb_build_array(g, n, cl) order by n desc, g) from grp where branch = 'ALL' and grp.k = ks.k), '[]'::jsonb) order by ks.k) from ks),
        'grp_cum', (select jsonb_agg(coalesce((select jsonb_agg(jsonb_build_array(g, cl) order by cl desc, g) from grpc where branch = 'ALL' and grpc.j = ks.k), '[]'::jsonb) order by ks.k) from ks)),
    'salons', (select jsonb_object_agg(s.b, jsonb_build_object(
        'now', coalesce((select n1 from now_ where branch = s.b), 0),
        'now_k', jsonb_build_array(coalesce((select n1 from now_ where branch = s.b), 0), coalesce((select n2 from now_ where branch = s.b), 0), coalesce((select n3 from now_ where branch = s.b), 0), coalesce((select n4 from now_ where branch = s.b), 0)),
        'hist', coalesce((select jsonb_agg(jsonb_build_array(to_char(wk, 'YYYY-MM-DD'), done, b1, b2, b3, b4) order by wk) from hist12 where branch = s.b), '[]'::jsonb),
        'grp', coalesce((select jsonb_agg(jsonb_build_array(g, n, cl) order by n desc, g) from grp where branch = s.b and k = 1), '[]'::jsonb),
        'grp_k', (select jsonb_agg(coalesce((select jsonb_agg(jsonb_build_array(g, n, cl) order by n desc, g) from grp where branch = s.b and grp.k = ks.k), '[]'::jsonb) order by ks.k) from ks),
        'cl_k', (select jsonb_agg(cl order by k) from clk where branch = s.b),
        'cl_cum', (select jsonb_agg(cum order by k) from clk where branch = s.b),
        'grp_cum', (select jsonb_agg(coalesce((select jsonb_agg(jsonb_build_array(g, cl) order by cl desc, g) from grpc where branch = s.b and grpc.j = ks.k), '[]'::jsonb) order by ks.k) from ks)))
      from sal s))
  into res;
  return res;
end $$;
revoke all on function public.oos_demand() from public, anon;
grant execute on function public.oos_demand() to authenticated;
