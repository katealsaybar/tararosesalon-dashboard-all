-- Leave & Holiday Calendar (Kate, 16 Nov 2026).
--
-- A Team Home page for Level 4 and 5 (Accounts and Admin, and Kate): who is on leave, sick leave with a medical certificate, absences without one,
-- the usual day offs from the Phorest rosters, and the public holidays, for the four UAE salons. hub/leavecal.html reads it all from leave_calendar().
--
-- Nothing personal is in this file or in the page: the repo is public. The people, leave, sick-day and name-alias rows are in the five tables below, which have
-- row level security on and no policy, so the only way to read them is leave_calendar(), and that answers Level 4 and up only (it returns null otherwise).
-- The rows are loaded straight into the database, never committed.
--
-- The day offs and the holiday trading are not stored: leave_calendar() works them out from staff_utilisation (available hours per day) and
-- phorest_staff_daily (visits) every time, so they stay current. Day off = rostered in 25% of weeks or fewer (the page applies that), counting only weeks
-- with at least two rostered days so a week of leave is not read as a week off.

create table if not exists public.leave_calendar_people (
  name        text primary key,         -- the Phorest name, or the dashboard name for head office
  position    text,                     -- the Phorest category without its number, or the org chart title
  branch      text,                     -- home salon (SAA, KCA, MC, AQ) when there is one
  branches    text[] not null default '{}',   -- every UAE salon Phorest lists them in
  photo       text,                     -- repo path of the cutout, e.g. assets/staff/ara.png
  head_office boolean not null default false,
  schedule    text,                     -- head office working pattern
  resigned    boolean not null default false,
  resigned_on date,
  created_at  timestamptz not null default now()
);

create table if not exists public.leave_calendar_entries (
  id         bigserial primary key,
  staff_name text not null,             -- as written on the source; the page maps it to a person
  branch     text,
  kind       text not null check (kind in ('approved', 'planned', 'requested')),
  leave_type text,
  date_from  date not null,
  date_to    date not null,
  source     text,
  created_at timestamptz not null default now()
);

create table if not exists public.leave_calendar_blocked (
  id        bigserial primary key,
  date_from date not null,
  date_to   date not null,
  note      text
);

create table if not exists public.leave_calendar_sick (
  staff_name  text not null,
  year        int  not null,
  month       int  not null check (month between 1 and 12),
  sick_days   int  not null default 0,   -- with a medical certificate
  absent_days int  not null default 0,   -- without one, marked absent
  primary key (staff_name, year, month)
);

create table if not exists public.leave_calendar_alias (
  name         text primary key,        -- a name as written on the sheets, Bayzat or payroll
  phorest_name text not null            -- the Phorest name it stands for
);

alter table public.leave_calendar_alias   enable row level security;
alter table public.leave_calendar_people  enable row level security;
alter table public.leave_calendar_entries enable row level security;
alter table public.leave_calendar_blocked enable row level security;
alter table public.leave_calendar_sick    enable row level security;
revoke all on public.leave_calendar_alias, public.leave_calendar_people, public.leave_calendar_entries, public.leave_calendar_blocked, public.leave_calendar_sick from anon, authenticated;
revoke all on sequence public.leave_calendar_entries_id_seq, public.leave_calendar_blocked_id_seq from anon, authenticated;

insert into public.kb_sections (key, dept, min_level, staff_dept, sort)
values ('leavecal', 'Management', 4, null, 86)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level, staff_dept = excluded.staff_dept;

create or replace function public.leave_calendar(p_from date default null, p_to date default null, p_dates date[] default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  lv int := public.kb_level();
  v_t date;
  v_f date;
  out jsonb;
begin
  if lv is null or lv < 4 then return null; end if;
  v_t := coalesce(p_to, current_date - 1);
  v_f := coalesce(p_from, (date_trunc('week', v_t::timestamp) - interval '11 weeks')::date);

  select jsonb_build_object(
    'range', jsonb_build_object('from', v_f, 'to', v_t),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('n', p.name, 'p', coalesce(p.position, ''), 'b', coalesce(p.branch, ''), 'a', to_jsonb(p.branches),
                                          'ph', coalesce(p.photo, ''), 'ho', p.head_office, 's', coalesce(p.schedule, ''),
                                          'res', p.resigned, 'rd', p.resigned_on) order by p.name)
      from public.leave_calendar_people p), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('n', e.staff_name, 'b', coalesce(e.branch, 'X'), 'ty', coalesce(e.leave_type, 'Leave'),
                                          'f', e.date_from, 't', e.date_to, 's', e.kind, 'src', coalesce(e.source, '')) order by e.date_from, e.staff_name)
      from public.leave_calendar_entries e), '[]'::jsonb),
    'alias', coalesce((select jsonb_object_agg(a.name, a.phorest_name) from public.leave_calendar_alias a), '{}'::jsonb),
    'blocked', coalesce((
      select jsonb_agg(jsonb_build_object('f', b.date_from, 't', b.date_to, 'note', coalesce(b.note, '')) order by b.date_from)
      from public.leave_calendar_blocked b), '[]'::jsonb),
    'sick', coalesce((
      select jsonb_agg(jsonb_build_object('n', z.staff_name, 'sl', z.sl, 'ab', z.ab) order by z.staff_name)
      from (select s.staff_name,
                   jsonb_object_agg(s.month, s.sick_days)   filter (where s.sick_days > 0)   sl,
                   jsonb_object_agg(s.month, s.absent_days) filter (where s.absent_days > 0) ab
            from public.leave_calendar_sick s
            where s.year = extract(year from current_date)::int
            group by s.staff_name) z), '[]'::jsonb),
    'dayoffs', coalesce((
      with d as (
        select u.staff_name, u.branch, u.date_from dt, max(u.available_hours) hrs
        from public.staff_utilisation u
        where u.date_from = u.date_to and not coalesce(u.is_archived, false) and u.date_from between v_f and v_t
        group by 1, 2, 3
      ), dd as (
        select staff_name, dt, max(hrs) > 0 rostered from d group by 1, 2
      ), wk as (
        select staff_name, date_trunc('week', dt)::date w, count(*) filter (where rostered) rdays from dd group by 1, 2
      ), act as (
        select staff_name, count(*) filter (where rdays >= 2) active_weeks from wk group by 1
      ), sh as (
        select y.staff_name, extract(isodow from y.dt)::int dow,
               count(distinct date_trunc('week', y.dt)) filter (where y.rostered and w.rdays >= 2) rw
        from dd y join wk w on w.staff_name = y.staff_name and w.w = date_trunc('week', y.dt)::date
        group by 1, 2
      ), mb as (
        select distinct on (staff_name) staff_name, branch
        from (select staff_name, branch, sum(hrs) h from d group by 1, 2) q
        order by staff_name, h desc
      )
      select jsonb_agg(jsonb_build_object('n', a.staff_name, 'b', m.branch, 'w', a.active_weeks,
               's', (select jsonb_agg(coalesce(round(100.0 * s2.rw / nullif(a.active_weeks, 0)), 0) order by g.dow)
                     from generate_series(1, 7) g(dow)
                     left join sh s2 on s2.staff_name = a.staff_name and s2.dow = g.dow)) order by m.branch, a.staff_name)
      from act a join mb m using (staff_name)
      where a.active_weeks >= 4 and m.branch in ('SAA', 'KCA', 'MC', 'AQ')
    ), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_object_agg(q.dt::text, q.br)
      from (select p.date dt, jsonb_object_agg(p.branch, p.v) br
            from (select f.date, f.branch, coalesce(sum(f.visits), 0) v
                  from public.phorest_staff_daily f
                  where not f.is_total and f.date = any (p_dates) and f.branch in ('SAA', 'KCA', 'MC', 'AQ')
                  group by f.date, f.branch) p
            group by p.date) q), '{}'::jsonb)
  ) into out;
  return out;
end
$$;
revoke all on function public.leave_calendar(date, date, date[]) from public, anon;
grant execute on function public.leave_calendar(date, date, date[]) to authenticated;
