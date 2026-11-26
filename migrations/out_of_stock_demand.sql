-- Out of Stock, next week's bookings (Kate, 26 Nov 2026, "dapat ang bilang ng order ay base sa next week, Monday to Sunday, ayon sa future appointments").
--
-- STATUS: APPLIED on 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_demand), on Kate's word after the local mockup
-- docs/mockups/out-of-stock-demand.html. Read only: one function, no table, nothing written.
--
-- What it returns (js/out-of-stock.js turns it into a factor per salon; the rule is in the page so it can be read and shown):
--   week_from / week_to   next Monday to Sunday (Dubai). On a Monday "next week" is the Monday after it.
--   lead                  days from today to that Monday (1 to 7). The history is cut at the same lead, so a Thursday figure is compared with Thursdays.
--   synced                when Phorest Staff Appointments was last read
--   salons                per UAE salon: now = colour services booked for next week as of now; hist = the last 12 finished weeks,
--                         [week start, colour services done in the week, colour services booked by (week start - lead)]; grp = next week's booked colour services by kind
--
-- Colour services = toners and gloss, roots (incl. hairline, stretch, face frame), foils (incl. partial, 3/4, FH), balayage, ombre, all over and other colour, bleach.
-- Colour lock treatments, polish, brows, tints, lashes and other treatments do NOT count. The same pattern is used for every figure so booked and history are like for like.
-- phorest_appointments has one row per booked service; Phorest drops cancelled appointments, so history is of appointments that were kept.
-- Same gate as oos_plan(): oos_access() (old Level 2 and up, or a spend viewer).

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
       and date >= nxt - 7 * 13
       and service ~* col and service !~* nocol
  ),
  hist as (
    select branch, date_trunc('week', date)::date wk,
           count(*) done,
           count(*) filter (where booked_at::date <= date_trunc('week', date)::date - lead) booked
      from a
     where date_trunc('week', date)::date + 6 < today and date_trunc('week', date)::date >= nxt - 7 * 13
       and date_trunc('week', date)::date >= first_full   -- the first week the table holds only counts from its first Monday
     group by 1, 2
  ),
  hist12 as (select * from (select h.*, row_number() over (partition by branch order by wk desc) rn from hist h) q where rn <= 12),
  now_ as (
    select branch, count(*) n from a where date between nxt and nxt + 6 group by 1
  ),
  grp as (
    select branch,
           case when service ~* 'toner|gloss' then 'Toner and gloss'
                when service ~* 'root|hairline|stretch|face frame' then 'Roots'
                when service ~* 'balayage|ombre' then 'Balayage and ombre'
                when service ~* 'foils|partial|3/4|FH ' then 'Foils'
                when service ~* 'bleach' then 'Bleach'
                else 'All over and other colour' end g,
           count(*) n
      from a where date between nxt and nxt + 6 group by 1, 2
  ),
  sal as (select unnest(array['KCA', 'SAA', 'MC', 'AQ']) b)
  select jsonb_build_object(
    'today', today, 'week_from', nxt, 'week_to', nxt + 6, 'lead', lead,
    'synced', (select max(synced_at) from public.phorest_appointments),
    'salons', (select jsonb_object_agg(s.b, jsonb_build_object(
        'now', coalesce((select n from now_ where branch = s.b), 0),
        'hist', coalesce((select jsonb_agg(jsonb_build_array(to_char(wk, 'YYYY-MM-DD'), done, booked) order by wk) from hist12 where branch = s.b), '[]'::jsonb),
        'grp', coalesce((select jsonb_agg(jsonb_build_array(g, n) order by n desc, g) from grp where branch = s.b), '[]'::jsonb)))
      from sal s))
  into res;
  return res;
end $$;
revoke all on function public.oos_demand() from public, anon;
grant execute on function public.oos_demand() to authenticated;
