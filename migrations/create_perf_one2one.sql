-- Monthly 1-to-1 (HR-10) and yearly Goals (HR-09) on My Numbers and Staff Benchmarks
-- (Kate, 7 Oct 2026). Trial with one stylist first (Ibrahim, Coach Emma's call):
-- perf_staff.one2one_on gates everything, so for everyone else the tab, the cards and
-- every function below answer null and nothing changes.
--
-- Who sees what:
--   leader key (perf_admins.role = 'leader': Kate, Tara, Emma)  reads and writes everything,
--     drafts included. The viewer and payroll keys get nothing: the goals hold personal and
--     financial answers.
--   the stylist's own token  reads a record only once a leader has signed it, and can
--     confirm it (her signature). Never a draft.
-- Numbers: the 13-week table is worked out here (perf_o2o_numbers) from the same
-- perf_core / perf_clients the rest of the page uses, with her level's aims, cut for leave
-- and for days before her start. A draft shows the live figures; signing freezes them into
-- `snapshot`, so a signed copy (and its PDF) never changes. Reopening moves the signed
-- version into `history` and the record becomes a draft again.
-- RLS is on with no policies, as for the other perf_ tables: pages go through the functions.

alter table perf_staff add column if not exists one2one_on boolean not null default false;

create table if not exists perf_one2one (
  id            bigint generated always as identity primary key,
  staff_id      uuid not null references perf_staff(id) on delete cascade,
  kind          text not null check (kind in ('monthly', 'goals')),
  period        date not null,                 -- monthly: first of the month; goals: first of the year
  content       jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft', 'signed', 'filed')),
  signed_by     text,
  signed_at     timestamptz,
  confirmed_at  timestamptz,                   -- the stylist's own confirmation
  snapshot      jsonb,                         -- the 13-week numbers, frozen at sign-off
  history       jsonb not null default '[]'::jsonb,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (staff_id, kind, period)
);
alter table perf_one2one enable row level security;

-- The 13 weeks ending on the Sunday of the last complete week, with aims (3 months of her
-- level's monthly aim, cut for leave) and the monthly equivalent of each sum.
create or replace function perf_o2o_numbers(s perf_staff) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  last_d date := least(current_date, coalesce((select max(date) from phorest_staff_daily), current_date));
  d2 date := date_trunc('week', last_d + 1)::date - 1;
  d1 date := date_trunc('week', last_d + 1)::date - 1 - 90;
  st date := perf_start_date(s);
  lv jsonb := perf_leave(s, d1, d2);
  off int;
  fct numeric;
  c jsonb := perf_core(s, d1, d2);
  cl jsonb := perf_clients(s, d1, d2);
  bt jsonb := (select jsonb_object_agg(kpi, target) from perf_benchmarks where level = s.level);
  bm jsonb := (select jsonb_object_agg(kpi, minimum) from perf_benchmarks where level = s.level);
  rws jsonb;
begin
  select coalesce(sum(greatest(0, least(d2, (l->>'to')::date) - greatest(d1, (l->>'from')::date) + 1)), 0)::int
    into off from jsonb_array_elements(coalesce(lv->'leave', '[]'::jsonb)) l;
  if st is not null and st > d1 then off := off + least(91, st - d1); end if;
  off := least(off, 84);
  fct := (91 - off)::numeric / 91 * 3;      -- months of aim in the window

  select jsonb_object_agg(k, jsonb_build_object(
           'a', a,
           't', case when kind = 'sum' then round((bt->>k)::numeric * fct) else (bt->>k)::numeric end,
           'mn', case when kind = 'sum' then round((bm->>k)::numeric * fct) else (bm->>k)::numeric end,
           'm', case when kind = 'sum' then round(a / fct) end))
    into rws
  from (select k, kind, (c->>k)::numeric a
          from (values ('hair_services', 'sum'), ('treatments', 'sum'), ('retail', 'sum'), ('total_revenue', 'sum'),
                       ('clients', 'sum'), ('new_clients', 'sum'),
                       ('avg_bill', 'avg'), ('rebooking_pct', 'avg'), ('column_fill_pct', 'avg')) v(k, kind)) q;

  rws := rws
    || jsonb_build_object('retention_pct', jsonb_build_object('a', (cl->>'retention_pct')::numeric, 't', (bt->>'retention_pct')::numeric,
                           'mn', (bm->>'retention_pct')::numeric, 'n', (cl->>'retention_n')::int))
    || jsonb_build_object('conversion_pct', jsonb_build_object('a', (cl->>'conversion_pct')::numeric, 't', (bt->>'conversion_pct')::numeric,
                           'mn', (bm->>'conversion_pct')::numeric, 'n', (cl->>'conversion_n')::int));

  return jsonb_build_object('from', d1, 'to', d2, 'off_days', off, 'months', round(fct, 2),
                            'level', s.level, 'has_aims', bt is not null, 'rows', rws);
end $$;
revoke all on function perf_o2o_numbers(perf_staff) from public, anon, authenticated;

-- ── The stylist's own link ───────────────────────────────────────────────
create or replace function perf_one2one_me(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s perf_staff;
begin
  select * into s from perf_staff where token = p_token and active;
  if s.id is null or not s.one2one_on then return null; end if;
  return jsonb_build_object(
    'enabled', true,
    'staff', jsonb_build_object('name', s.display_name, 'role', coalesce(s.level, s.dept || ' team'), 'branch', s.branch),
    'records', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', o.kind, 'period', o.period,
        -- a record being updated keeps showing the version she last saw
        'updating', o.status = 'draft',
        'status', case when o.status = 'draft' then (o.history->(-1)->>'status') else o.status end,
        'signed_by', case when o.status = 'draft' then o.history->(-1)->>'signed_by' else o.signed_by end,
        'signed_at', case when o.status = 'draft' then o.history->(-1)->>'signed_at' else o.signed_at::text end,
        'confirmed_at', case when o.status = 'draft' then o.history->(-1)->>'confirmed_at' else o.confirmed_at::text end,
        'content', case when o.status = 'draft' then o.history->(-1)->'content' else o.content end,
        'snapshot', case when o.status = 'draft' then o.history->(-1)->'snapshot' else o.snapshot end)
        order by o.kind, o.period desc), '[]')
      from perf_one2one o
      where o.staff_id = s.id and (o.status in ('signed', 'filed') or jsonb_array_length(o.history) > 0))
  );
end $$;

create or replace function perf_one2one_confirm(p_token uuid, p_kind text, p_period date) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if sid is null then return false; end if;
  update perf_one2one set status = 'filed', confirmed_at = now()
   where staff_id = sid and kind = p_kind and period = p_period and status = 'signed';
  return found;
end $$;

-- ── The leaders' side (Staff Benchmarks) ─────────────────────────────────
create or replace function perf_one2one_get(p_admin uuid, p_token uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  who text; s perf_staff;
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  y1 date := date_trunc('year', coalesce(p_month, current_date))::date;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  if who is null then return null; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null or not s.one2one_on then return null; end if;
  return jsonb_build_object(
    'enabled', true, 'who', who, 'month', m1, 'year', y1,
    'staff', jsonb_build_object('name', s.display_name, 'role', coalesce(s.level, s.dept || ' team'), 'branch', s.branch),
    'numbers', perf_o2o_numbers(s),
    'monthly', (select to_jsonb(o) - 'staff_id' - 'history' from perf_one2one o where o.staff_id = s.id and o.kind = 'monthly' and o.period = m1),
    'goals',   (select to_jsonb(o) - 'staff_id' - 'history' from perf_one2one o where o.staff_id = s.id and o.kind = 'goals' and o.period = y1),
    'previous', (select jsonb_build_object('period', o.period, 'content', o.content) from perf_one2one o
                  where o.staff_id = s.id and o.kind = 'monthly' and o.period < m1 order by o.period desc limit 1),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'period', o.period, 'status', o.status,
                    'signed_by', o.signed_by, 'signed_at', o.signed_at, 'confirmed_at', o.confirmed_at) order by o.period desc), '[]')
               from perf_one2one o where o.staff_id = s.id)
  );
end $$;

create or replace function perf_one2one_save(p_admin uuid, p_token uuid, p_kind text, p_period date, p_content jsonb) returns text
language plpgsql volatile security definer set search_path = public as $$
declare who text; sid uuid; per date; cur text;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null or p_kind not in ('monthly', 'goals') or p_content is null then return 'denied'; end if;
  per := case when p_kind = 'monthly' then date_trunc('month', p_period)::date else date_trunc('year', p_period)::date end;
  select status into cur from perf_one2one where staff_id = sid and kind = p_kind and period = per;
  if cur is not null and cur <> 'draft' then return 'locked'; end if;
  insert into perf_one2one (staff_id, kind, period, content, updated_by)
  values (sid, p_kind, per, p_content, who)
  on conflict (staff_id, kind, period) do update
    set content = excluded.content, updated_by = who, updated_at = now();
  return 'ok';
end $$;

create or replace function perf_one2one_sign(p_admin uuid, p_token uuid, p_kind text, p_period date) returns text
language plpgsql volatile security definer set search_path = public as $$
declare who text; s perf_staff; per date;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  select * into s from perf_staff where token = p_token and active and one2one_on;
  if who is null or s.id is null or p_kind not in ('monthly', 'goals') then return 'denied'; end if;
  per := case when p_kind = 'monthly' then date_trunc('month', p_period)::date else date_trunc('year', p_period)::date end;
  update perf_one2one set status = 'signed', signed_by = who, signed_at = now(), confirmed_at = null,
         snapshot = perf_o2o_numbers(s), updated_by = who, updated_at = now()
   where staff_id = s.id and kind = p_kind and period = per and status = 'draft';
  return case when found then 'ok' else 'nothing to sign' end;
end $$;

create or replace function perf_one2one_reopen(p_admin uuid, p_token uuid, p_kind text, p_period date) returns text
language plpgsql volatile security definer set search_path = public as $$
declare who text; sid uuid; per date;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null or p_kind not in ('monthly', 'goals') then return 'denied'; end if;
  per := case when p_kind = 'monthly' then date_trunc('month', p_period)::date else date_trunc('year', p_period)::date end;
  update perf_one2one set
         history = history || jsonb_build_object('status', status, 'signed_by', signed_by, 'signed_at', signed_at,
                                                 'confirmed_at', confirmed_at, 'content', content, 'snapshot', snapshot),
         status = 'draft', signed_by = null, signed_at = null, confirmed_at = null, snapshot = null,
         updated_by = who, updated_at = now()
   where staff_id = sid and kind = p_kind and period = per and status in ('signed', 'filed');
  return case when found then 'ok' else 'not signed' end;
end $$;

grant execute on function perf_one2one_me(uuid)                        to anon, authenticated;
grant execute on function perf_one2one_confirm(uuid, text, date)       to anon, authenticated;
grant execute on function perf_one2one_get(uuid, uuid, date)           to anon, authenticated;
grant execute on function perf_one2one_save(uuid, uuid, text, date, jsonb) to anon, authenticated;
grant execute on function perf_one2one_sign(uuid, uuid, text, date)    to anon, authenticated;
grant execute on function perf_one2one_reopen(uuid, uuid, text, date)  to anon, authenticated;

-- The trial: Ibrahim Al Mofdi only.
update perf_staff set one2one_on = true where id = '7493f1bf-04a4-4020-99af-550f9947528c';
