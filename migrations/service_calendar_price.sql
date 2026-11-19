-- Service Calendar: the price of each service (Kate, 19 Nov 2026: "there should already be a price, lagay mo kasunod ng group").
-- WRITTEN ONLY, NOT APPLIED. It needs Kate's word first (it changes a table and a live function).
--
-- Phorest's appointment answer carries a price for every service (checked 19 Nov 2026: the fields include price, serviceId, serviceName, state, staffRequest).
-- The first version of the table left it out on purpose; the detail window of a service block now shows it after Group.
--
-- What this does, in order:
--   1. adds a price column to phorest_appointments (numeric, empty until the next sync fills it);
--   2. service_calendar() returns the price as the 13th item of each row (index 12), only to Level 2 and up (the same people who may open the page, v_dash),
--      and nothing else in the function changes. The page shows the Price line only when a price came back, so it is safe to push the page first.
-- After it is applied, the appointments-sync edge function (supabase/functions/appointments-sync, now sends price) must be deployed, and a backfill run once
-- ("phorest data export/appointments/sync_appointments.py --from <first day> --to <last day>") so the days already stored get their prices.

alter table public.phorest_appointments add column if not exists price numeric;

create or replace function public.service_calendar(p_branch text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare
  v_to date;
  v_book boolean;
  v_dash boolean;
  v_fv date;
  out jsonb;
begin
  if public.kb_me_email() is null or not public.kb_can_read_for(public.kb_me_email(), 'servicecal') then return null; end if;
  if p_branch not in ('SAA', 'KCA', 'MC', 'AQ') then return null; end if;
  v_to := least(coalesce(p_to, p_from), p_from + 30);
  v_book := coalesce((select m.level from public.dashboard_me() m limit 1), 0) >= 5;
  v_dash := coalesce((select m.level from public.dashboard_me() m limit 1), 0) >= 2;
  v_fv := (select max(first_date) from public.door_first_visits);

  with r as (
    select a.*, dense_rank() over (order by a.staff_name, a.staff_id) - 1 as si,
           case when f.first_date is null then (a.client_id is not null and a.date > v_fv) else f.first_date = a.date end as is_new,
           (a.client_id is not null and exists (select 1 from public.phorest_appointments b
              where b.client_id = a.client_id and b.staff_id = a.staff_id and b.date > a.date and (b.booked_at at time zone 'Asia/Dubai')::date = a.date)) as is_rebooked
    from public.phorest_appointments a
    left join public.door_first_visits f on f.cn = a.client_id
    where a.branch = p_branch and a.date between p_from and v_to
  ),
  s as (select distinct si, staff_name n, staff_id sid from r),
  led as (
    select l.date, s.si, sum(l.total) total, sum(l.new_client) new_c, sum(l.ncr) ncr, sum(l.req) req, sum(l.salon) salon, sum(l.rebooked) rebooked
    from public.branch_staff_daily l
    join s on case lower(split_part(trim(l.staff_name), ' ', 1)) when 'virginia' then 'virginija' when 'tammy' then 'tamryn' else lower(split_part(trim(l.staff_name), ' ', 1)) end
              = lower(split_part(trim(s.n), ' ', 1))
    where v_dash and l.branch = p_branch and l.date between p_from and v_to and l.total > 0
    group by l.date, s.si
  ),
  led_all as (
    select l.date, sum(l.total) total, sum(l.new_client) new_c, sum(l.ncr) ncr, sum(l.req) req, sum(l.salon) salon, sum(l.rebooked) rebooked
    from public.branch_staff_daily l
    where v_dash and l.branch = p_branch and l.date between p_from and v_to and upper(trim(l.staff_name)) <> 'BUSINESS'
    group by l.date having sum(l.total) > 0
  )
  select jsonb_build_object(
    'branch', p_branch,
    'from', p_from,
    'to', v_to,
    'staff', coalesce((select jsonb_agg(s.n order by s.si) from s), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(coalesce((select p.photo from public.leave_calendar_people p
                                                    where coalesce(p.photo, '') <> '' and regexp_replace(trim(p.name), '\s+', ' ', 'g') = regexp_replace(trim(s.n), '\s+', ' ', 'g') limit 1), '') order by s.si) from s), '[]'::jsonb),
    'a', coalesce((select jsonb_agg(jsonb_build_array(to_char(r.date, 'YYYY-MM-DD'), to_char(r.start_time, 'HH24:MI'), to_char(r.end_time, 'HH24:MI'),
                                                      r.si, r.service, r.state, r.staff_request, r.client_name, case when v_book then r.client_id else null end,
                                                      r.is_new, left(md5(coalesce(r.client_id, r.client_name)), 10), r.is_rebooked,
                                                      case when v_dash then r.price else null end)
                                    order by r.date, r.start_time) from r), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(jsonb_build_array(to_char(led.date, 'YYYY-MM-DD'), led.si, led.total, led.new_c, led.ncr, led.req, led.salon, led.rebooked)) from led), '[]'::jsonb),
    'ledger_all', coalesce((select jsonb_agg(jsonb_build_array(to_char(led_all.date, 'YYYY-MM-DD'), led_all.total, led_all.new_c, led_all.ncr, led_all.req, led_all.salon, led_all.rebooked)) from led_all), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(jsonb_build_array(to_char(h.date, 'YYYY-MM-DD'), s.si, h.kind, to_char(h.start_time, 'HH24:MI'), to_char(h.end_time, 'HH24:MI'), h.note) order by h.date, s.si)
                        from public.phorest_shifts h join s on s.sid = h.staff_id where h.branch = p_branch and h.date between p_from and v_to), '[]'::jsonb),
    'shifts_synced', (select max(synced_at) from public.phorest_shifts where branch = p_branch),
    'synced', (select max(synced_at) from public.phorest_appointments where branch = p_branch),
    'first', (select min(date) from public.phorest_appointments),
    'last',  (select max(date) from public.phorest_appointments)
  ) into out;
  return out;
end
$function$;
