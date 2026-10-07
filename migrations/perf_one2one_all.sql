-- NOTE (Kate, 7 Oct 2026, later): goals became the stylist's to write. Run perf_one2one_goals_by_staff.sql after this file; it
-- adds the 'submitted' status and redefines perf_one2one_me, _get, _save, _sign and _reopen.
-- Monthly 1-to-1 (HR-10), yearly Goals (HR-09) and 13-week checks: the whole database side in one file
-- (Kate, 7 Oct 2026). This is the REPLAYABLE copy of what is live: the table, the columns added over the
-- day, and the final definition of every function (dumped from the database with pg_get_functiondef).
-- The earlier files (create_perf_one2one.sql, perf_one2one_signatures.sql, perf_one2one_staff_comment.sql)
-- are the history of how it got here; run this one to rebuild.
--
-- Rules it enforces:
--   * perf_staff.one2one_on gates everything (the trial: Ibrahim only).
--   * Only the editor (perf_admins.one2one_editor, Coach Emma) can save, sign and reopen. The other leader
--     keys (Tara, Kate) can read, drafts included. Viewer and payroll keys get nothing.
--   * A stylist's token reads a record only once it is signed, and can acknowledge it (signature + comment).
--   * Signing freezes the 13-week numbers into `snapshot`; reopening moves the signed version into `history`.
--   * kind 'check' is a 13-week check of the year's goals, signed and acknowledged on its own.
--   * Signatures are PNG/JPEG data URLs up to 400 KB; comments up to 2000 characters.
-- RLS is on with no policies: pages go through the functions.

alter table perf_staff add column if not exists one2one_on boolean not null default false;
alter table perf_admins add column if not exists one2one_editor boolean not null default false;

create table if not exists perf_one2one (
  id            bigint generated always as identity primary key,
  staff_id      uuid not null references perf_staff(id) on delete cascade,
  kind          text not null,
  period        date not null,                 -- monthly and check: first of the month; goals: first of the year
  content       jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft', 'signed', 'filed')),
  signed_by     text,
  signed_at     timestamptz,
  confirmed_at  timestamptz,                   -- the stylist's acknowledgement
  snapshot      jsonb,                         -- the 13-week numbers, frozen at sign-off
  history       jsonb not null default '[]'::jsonb,
  updated_by    text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  manager_sig   text,
  staff_sig     text,
  staff_comment text,
  unique (staff_id, kind, period)
);
alter table perf_one2one drop constraint if exists perf_one2one_kind_check;
alter table perf_one2one add constraint perf_one2one_kind_check check (kind in ('monthly', 'goals', 'check'));
alter table perf_one2one enable row level security;

-- ── Functions (final definitions) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perf_o2o_editor(p_admin uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select name from perf_admins where token = p_admin and role = 'leader' and one2one_editor limit 1
$function$;

CREATE OR REPLACE FUNCTION public.perf_o2o_period(p_kind text, p_d date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p_kind = 'goals' then date_trunc('year', p_d)::date else date_trunc('month', p_d)::date end
$function$;

CREATE OR REPLACE FUNCTION public.perf_o2o_numbers(s perf_staff)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  fct := (91 - off)::numeric / 91 * 3;

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
                            'level', s.level, 'has_aims', bt is not null, 'rows', rws,
                            'asof', now(), 'data_through', last_d,
                            'client_through', (select max(date) from sales_transaction_lines));
end $function$;

CREATE OR REPLACE FUNCTION public.perf_one2one_me(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s perf_staff;
begin
  select * into s from perf_staff where token = p_token and active;
  if s.id is null or not s.one2one_on then return null; end if;
  return jsonb_build_object(
    'enabled', true,
    'staff', jsonb_build_object('name', s.display_name, 'role', coalesce(s.level, s.dept || ' team'), 'branch', s.branch),
    'records', (select coalesce(jsonb_agg(jsonb_build_object(
        'kind', o.kind, 'period', o.period,
        'updating', o.status = 'draft',
        'status', case when o.status = 'draft' then (o.history->(-1)->>'status') else o.status end,
        'signed_by', case when o.status = 'draft' then o.history->(-1)->>'signed_by' else o.signed_by end,
        'signed_at', case when o.status = 'draft' then o.history->(-1)->>'signed_at' else o.signed_at::text end,
        'confirmed_at', case when o.status = 'draft' then o.history->(-1)->>'confirmed_at' else o.confirmed_at::text end,
        'manager_sig', case when o.status = 'draft' then o.history->(-1)->>'manager_sig' else o.manager_sig end,
        'staff_sig', case when o.status = 'draft' then o.history->(-1)->>'staff_sig' else o.staff_sig end,
        'staff_comment', case when o.status = 'draft' then o.history->(-1)->>'staff_comment' else o.staff_comment end,
        'content', case when o.status = 'draft' then o.history->(-1)->'content' else o.content end,
        'snapshot', case when o.status = 'draft' then o.history->(-1)->'snapshot' else o.snapshot end)
        order by o.kind, o.period desc), '[]')
      from perf_one2one o
      where o.staff_id = s.id and (o.status in ('signed', 'filed') or jsonb_array_length(o.history) > 0))
  );
end $function$;

CREATE OR REPLACE FUNCTION public.perf_one2one_confirm(p_token uuid, p_kind text, p_period date, p_sig text DEFAULT NULL::text, p_comment text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare sid uuid;
begin
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if sid is null then return false; end if;
  if p_sig is not null and (length(p_sig) > 400000 or p_sig !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then return false; end if;
  if p_comment is not null and length(p_comment) > 2000 then return false; end if;
  update perf_one2one set status = 'filed', confirmed_at = now(), staff_sig = p_sig, staff_comment = nullif(trim(p_comment), '')
   where staff_id = sid and kind = p_kind and period = p_period and status = 'signed';
  return found;
end $function$;

CREATE OR REPLACE FUNCTION public.perf_one2one_get(p_admin uuid, p_token uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'can_edit', perf_o2o_editor(p_admin) is not null,
    'editor', (select name from perf_admins where one2one_editor and role = 'leader' limit 1),
    'staff', jsonb_build_object('name', s.display_name, 'role', coalesce(s.level, s.dept || ' team'), 'branch', s.branch),
    'numbers', perf_o2o_numbers(s),
    'monthly', (select to_jsonb(o) - 'staff_id' - 'history' from perf_one2one o where o.staff_id = s.id and o.kind = 'monthly' and o.period = m1),
    'goals',   (select to_jsonb(o) - 'staff_id' - 'history' from perf_one2one o where o.staff_id = s.id and o.kind = 'goals' and o.period = y1),
    'checks',  (select coalesce(jsonb_agg(to_jsonb(o) - 'staff_id' - 'history' order by o.period desc), '[]') from perf_one2one o
                 where o.staff_id = s.id and o.kind = 'check' and o.period >= y1 and o.period < (y1 + interval '1 year')::date),
    'previous', (select jsonb_build_object('period', o.period, 'content', o.content) from perf_one2one o
                  where o.staff_id = s.id and o.kind = 'monthly' and o.period < m1 order by o.period desc limit 1),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'period', o.period, 'status', o.status,
                    'signed_by', o.signed_by, 'signed_at', o.signed_at, 'confirmed_at', o.confirmed_at) order by o.period desc), '[]')
               from perf_one2one o where o.staff_id = s.id)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.perf_one2one_save(p_admin uuid, p_token uuid, p_kind text, p_period date, p_content jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text; sid uuid; per date; cur text;
begin
  who := perf_o2o_editor(p_admin);
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null or p_kind not in ('monthly', 'goals', 'check') or p_content is null then return 'denied'; end if;
  per := perf_o2o_period(p_kind, p_period);
  select status into cur from perf_one2one where staff_id = sid and kind = p_kind and period = per;
  if cur is not null and cur <> 'draft' then return 'locked'; end if;
  insert into perf_one2one (staff_id, kind, period, content, updated_by)
  values (sid, p_kind, per, p_content, who)
  on conflict (staff_id, kind, period) do update
    set content = excluded.content, updated_by = who, updated_at = now();
  return 'ok';
end $function$;

CREATE OR REPLACE FUNCTION public.perf_one2one_sign(p_admin uuid, p_token uuid, p_kind text, p_period date, p_sig text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text; s perf_staff; per date;
begin
  who := perf_o2o_editor(p_admin);
  select * into s from perf_staff where token = p_token and active and one2one_on;
  if who is null or s.id is null or p_kind not in ('monthly', 'goals', 'check') then return 'denied'; end if;
  if p_sig is not null and (length(p_sig) > 400000 or p_sig !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then return 'bad signature'; end if;
  per := perf_o2o_period(p_kind, p_period);
  update perf_one2one set status = 'signed', signed_by = who, signed_at = now(), confirmed_at = null,
         manager_sig = p_sig, staff_sig = null, staff_comment = null,
         snapshot = perf_o2o_numbers(s), updated_by = who, updated_at = now()
   where staff_id = s.id and kind = p_kind and period = per and status = 'draft';
  return case when found then 'ok' else 'nothing to sign' end;
end $function$;

CREATE OR REPLACE FUNCTION public.perf_one2one_reopen(p_admin uuid, p_token uuid, p_kind text, p_period date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text; sid uuid; per date;
begin
  who := perf_o2o_editor(p_admin);
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null or p_kind not in ('monthly', 'goals', 'check') then return 'denied'; end if;
  per := perf_o2o_period(p_kind, p_period);
  update perf_one2one set
         history = history || jsonb_build_object('status', status, 'signed_by', signed_by, 'signed_at', signed_at,
                                                 'confirmed_at', confirmed_at, 'content', content, 'snapshot', snapshot,
                                                 'manager_sig', manager_sig, 'staff_sig', staff_sig, 'staff_comment', staff_comment),
         status = 'draft', signed_by = null, signed_at = null, confirmed_at = null, snapshot = null,
         manager_sig = null, staff_sig = null, staff_comment = null, updated_by = who, updated_at = now()
   where staff_id = sid and kind = p_kind and period = per and status in ('signed', 'filed');
  return case when found then 'ok' else 'not signed' end;
end $function$;

-- ── Grants: the internal helpers are not callable from the pages ─────────
revoke all on function perf_o2o_editor(uuid) from public, anon, authenticated;
revoke all on function perf_o2o_period(text, date) from public, anon, authenticated;
revoke all on function perf_o2o_numbers(perf_staff) from public, anon, authenticated;
grant execute on function perf_one2one_me(uuid)                                 to anon, authenticated;
grant execute on function perf_one2one_confirm(uuid, text, date, text, text)    to anon, authenticated;
grant execute on function perf_one2one_get(uuid, uuid, date)                    to anon, authenticated;
grant execute on function perf_one2one_save(uuid, uuid, text, date, jsonb)      to anon, authenticated;
grant execute on function perf_one2one_sign(uuid, uuid, text, date, text)       to anon, authenticated;
grant execute on function perf_one2one_reopen(uuid, uuid, text, date)           to anon, authenticated;

-- The trial: Ibrahim Al Mofdi only, and Coach Emma as the one editor.
update perf_staff set one2one_on = true where id = '7493f1bf-04a4-4020-99af-550f9947528c';
update perf_admins set one2one_editor = true where name = 'Emma' and role = 'leader';
