-- Service Calendar (Kate, 17 Nov 2026).
--
-- A Team Home page (hub/servicecal.html): Phorest's Day and Week calendar for the four UAE salons, stylists across and time down the side.
-- Our other Phorest tables hold the DATE of a service but never its start time or length, so this keeps the appointments themselves.
--
-- Source: Phorest's official API, GET /branch/{id}/appointment (startTime, endTime, staffId, serviceName, state, staffRequest, clientId), /staff and /client-batch.
-- Loaded by "phorest data export/appointments/sync_appointments.py" in the cowork repo (upsert on branch + appointment id; a booking Phorest no longer returns is
-- deleted from the window that was pulled). Cancelled and no-show bookings are not in the API answer, so they are not here. Price is not stored on purpose.
--
-- The client is stored as first name and last initial only. The repo is public, so nothing personal is in this file or in the page: the table has row level
-- security on and no policy, and the only way to read it is service_calendar(), which answers Levels 2, 3 and 5 (Accounts, old Level 4, skipped) and returns
-- null for anyone else. Applied live 17 Nov 2026.

create table if not exists public.phorest_appointments (
  branch         text        not null,                 -- SAA, KCA, MC, AQ
  appt_id        text        not null,                 -- Phorest appointmentId
  date           date        not null,
  start_time     time        not null,
  end_time       time        not null,
  staff_id       text,
  staff_name     text        not null default '',
  service        text        not null default '',
  state          text        not null default '',      -- PAID, CHECKED_IN, BOOKED
  staff_request  boolean     not null default false,   -- the client asked for this stylist
  client_id      text,
  client_name    text        not null default '',      -- first name + last initial
  synced_at      timestamptz not null default now(),
  primary key (branch, appt_id)
);
create index if not exists phorest_appointments_day on public.phorest_appointments (branch, date);

alter table public.phorest_appointments enable row level security;
revoke all on public.phorest_appointments from anon, authenticated;

insert into public.kb_sections (key, dept, min_level, staff_dept, sort, skip_levels)
values ('servicecal', 'Management', 2, null, 87, '{4}')
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level, staff_dept = excluded.staff_dept, skip_levels = excluded.skip_levels;

-- One branch, a date range of at most 31 days. Rows are arrays to keep the answer small:
--   [date, start 'HH:MM', end 'HH:MM', staff index, service, state, asked-for, client]
create or replace function public.service_calendar(p_branch text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  lv int := public.kb_level();
  v_to date;
  out jsonb;
begin
  if lv is null or lv < 2 or lv = 4 then return null; end if;
  if p_branch not in ('SAA', 'KCA', 'MC', 'AQ') then return null; end if;
  v_to := least(coalesce(p_to, p_from), p_from + 30);

  with r as (
    select a.*, dense_rank() over (order by a.staff_name, a.staff_id) - 1 as si
    from public.phorest_appointments a
    where a.branch = p_branch and a.date between p_from and v_to
  )
  select jsonb_build_object(
    'branch', p_branch,
    'from', p_from,
    'to', v_to,
    'staff', coalesce((select jsonb_agg(n order by si) from (select distinct si, staff_name n from r) s), '[]'::jsonb),
    'a', coalesce((select jsonb_agg(jsonb_build_array(to_char(r.date, 'YYYY-MM-DD'), to_char(r.start_time, 'HH24:MI'), to_char(r.end_time, 'HH24:MI'),
                                                      r.si, r.service, r.state, r.staff_request, r.client_name)
                                    order by r.date, r.start_time) from r), '[]'::jsonb),
    'synced', (select max(synced_at) from public.phorest_appointments where branch = p_branch),
    'first', (select min(date) from public.phorest_appointments),
    'last',  (select max(date) from public.phorest_appointments)
  ) into out;
  return out;
end
$$;
revoke all on function public.service_calendar(text, date, date) from public, anon;
grant execute on function public.service_calendar(text, date, date) to authenticated;

-- Let the Phorest sync scripts write the table through push_insert and push_delete (the same lock as every other pulled table).
create or replace function public.push_tables()
returns text[] language sql immutable as $$
  select array['sales_transaction_lines','staff_financial_totals','phorest_staff_daily',
               'staff_utilisation','financial_totals','stock_order_lines','client_contacts',
               'phorest_staff_rebooking','client_bookings','stock_levels','phorest_client_emails',
               'phorest_client_branches','phorest_client_notes','phorest_visit_notes','product_usage_lines',
               'phorest_client_since','phorest_appt_requests','phorest_visit_clients','ledger_ncr_clients',
               'phorest_appointments']
$$;

-- 17 Nov 2026 (Kate: "open to everyone Level 2 and up"), applied live. Level numbers as people see them: 2 Reception & Call Centre, 3 Leadership, 4 Executives & Marketing,
-- 5 Accounts & Admin, 6 Kate. In the database that is Level 1 with a Front Desk or Call Centre department (staff_dept 'Reception'), and old Levels 2 to 5, with nobody skipped.
-- service_calendar() now asks the same question as every Team Home page, kb_can_read_for(email, 'servicecal'), so the kb_sections row below (and Page Access) decide who reads it.
update public.kb_sections set min_level = 2, staff_dept = 'Reception', skip_levels = '{}' where key = 'servicecal';
-- (the function body changed only in its first line: the old test "kb_level() is null or < 2 or = 4" became "kb_me_email() is null or not kb_can_read_for(kb_me_email(), 'servicecal')")
