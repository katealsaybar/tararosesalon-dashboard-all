-- Out of Stock, the weeks AFTER next week too (Kate, 26 Nov 2026: "if naka x4 ibase mo pa rin sa succeeding next weeks yung oorderin, basta x2 weeks pataas").
--
-- STATUS: APPLIED on 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_demand_weeks), on Kate's word. Read only: replaces oos_demand(), nothing is written.
--
-- oos_demand() v1 gave next week only. v2 keeps every v1 field (now, hist as [week, done, booked by the lead of week 1], grp) so the page that is live keeps working, and adds the four weeks ahead:
--   weeks     [{k, from, to, lead}] for k = 1..4: next Monday to Sunday, then the three weeks after it; lead = days from today to that Monday
--   per salon now_k      colour services booked for each of the four weeks, as of now
--             hist       [week start, done in the week, booked by (week start - lead1), by (- lead2), by (- lead3), by (- lead4)] for the last 12 finished weeks; the booked columns are cut at each week's own lead,
--                        so a week 3 figure is compared with weeks that were 18 days away on the same weekday
--             grp_k      the booked colour services by kind, for each of the four weeks
-- Colour services, the colour pattern and the gate are the same as v1 (see out_of_stock_demand.sql).

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
    select branch, date, booked_at, service, synced_at
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
  grp as (
    select branch, ((date - nxt) / 7 + 1) k,
           case when service ~* 'toner|gloss' then 'Toner and gloss'
                when service ~* 'root|hairline|stretch|face frame' then 'Roots'
                when service ~* 'balayage|ombre' then 'Balayage and ombre'
                when service ~* 'foils|partial|3/4|FH ' then 'Foils'
                when service ~* 'bleach' then 'Bleach'
                else 'All over and other colour' end g,
           count(*) n
      from a where date between nxt and nxt + 27 group by 1, 2, 3
  ),
  ks as (select generate_series(1, 4) k),
  sal as (select unnest(array['KCA', 'SAA', 'MC', 'AQ']) b)
  select jsonb_build_object(
    'today', today, 'week_from', nxt, 'week_to', nxt + 6, 'lead', lead,
    'weeks', (select jsonb_agg(jsonb_build_object('k', k, 'from', nxt + 7 * (k - 1), 'to', nxt + 7 * (k - 1) + 6, 'lead', lead + 7 * (k - 1)) order by k) from ks),
    'synced', (select max(synced_at) from public.phorest_appointments),
    'salons', (select jsonb_object_agg(s.b, jsonb_build_object(
        'now', coalesce((select n1 from now_ where branch = s.b), 0),
        'now_k', jsonb_build_array(coalesce((select n1 from now_ where branch = s.b), 0), coalesce((select n2 from now_ where branch = s.b), 0), coalesce((select n3 from now_ where branch = s.b), 0), coalesce((select n4 from now_ where branch = s.b), 0)),
        'hist', coalesce((select jsonb_agg(jsonb_build_array(to_char(wk, 'YYYY-MM-DD'), done, b1, b2, b3, b4) order by wk) from hist12 where branch = s.b), '[]'::jsonb),
        'grp', coalesce((select jsonb_agg(jsonb_build_array(g, n) order by n desc, g) from grp where branch = s.b and k = 1), '[]'::jsonb),
        'grp_k', (select jsonb_agg(coalesce((select jsonb_agg(jsonb_build_array(g, n) order by n desc, g) from grp where branch = s.b and grp.k = ks.k), '[]'::jsonb) order by ks.k) from ks)))
      from sal s))
  into res;
  return res;
end $$;
revoke all on function public.oos_demand() from public, anon;
grant execute on function public.oos_demand() to authenticated;
