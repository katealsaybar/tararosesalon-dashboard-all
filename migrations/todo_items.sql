-- Kate, 15 Oct 2026: automated to-do list, built from what the dashboards already show.
-- /hub/todo (Team Home, Level 5 only) lists what todo_refresh() finds. Nobody types an item:
-- five rules read the live tables and write one row per thing that needs a person.
--
--   1 ledger   a branch day with no Financial Totals row and no closed_days row (last 14 days,
--              Saadiyat, Khalifa City A, Motor City, Al Quoz; Bahrain is not in the daily ledger run)
--   2 pace     services net month to date is 5+ points behind the month's open-day pace against
--              branch_targets.actual_target (the same services target Actuals vs Targets uses);
--              a branch's closing weekdays are the ones that were zero on 6+ of the last 8 weeks
--   3 rebook   stylists under the minimum rebooking_pct for their level over 28 days (30+ visits),
--              one item per branch, worst three named
--   4 review   a Google review with no reply (Fratelli left out; 3 stars or fewer within 60 days is
--              urgent, 4 and 5 stars within 14 days)
--   5 sync     a sync_health row older than 36 hours or carrying an error (lost-send-worker is
--              left out while lost_send_config.enabled is false)
--
-- An item closes by itself when the data stops matching ('closed'), reopens if it comes back,
-- and Kate can tick it ('done') or snooze it to a date. Hourly through pg_cron, and the page has
-- a Refresh button (todo_refresh_now). Dates are Dubai dates. Items are keyed
-- rule:branch:period so a refresh never duplicates; a ticked item stays ticked while the same
-- key is still true.

create table if not exists public.todo_items (
  key           text primary key,
  rule          text not null,
  branch        text,
  title         text not null,
  detail        text,
  link          text,
  severity      smallint not null default 2,      -- 1 urgent, 2 normal
  status        text not null default 'open' check (status in ('open', 'done', 'snoozed', 'closed')),
  snoozed_until date,
  first_seen    date not null default current_date,
  last_seen     timestamptz not null default now(),
  closed_at     timestamptz,
  done_at       timestamptz,
  done_by       text
);
alter table public.todo_items enable row level security;
revoke all on public.todo_items from anon, authenticated;
grant select on public.todo_items to authenticated;
grant update (status, snoozed_until) on public.todo_items to authenticated;

-- Level 5 only: kb_can_read() is true for Level 5 and, for everyone else, needs a kb_sections row
-- whose min_level they meet, so min_level 5 keeps this to the owner login.
insert into public.kb_sections (key, dept, min_level, staff_dept, sort) values
  ('todo', 'Management', 5, null, 86)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level,
  staff_dept = excluded.staff_dept, sort = excluded.sort;

drop policy if exists todo_items_read on public.todo_items;
create policy todo_items_read on public.todo_items for select to authenticated
  using ((select public.kb_can_read('todo')));
drop policy if exists todo_items_change on public.todo_items;
create policy todo_items_change on public.todo_items for update to authenticated
  using ((select public.kb_can_read('todo'))) with check ((select public.kb_can_read('todo')));

-- Stamps who ticked it and when; clears the stamp when it is reopened by hand.
create or replace function public.todo_items_stamp() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.done_at := now();
    new.done_by := coalesce(nullif(public.kb_me(), ''), public.kb_me_email());
  elsif new.status = 'open' and old.status is distinct from 'open' then
    new.done_at := null; new.done_by := null;
  end if;
  if new.status <> 'snoozed' then new.snoozed_until := null; end if;
  return new;
end $$;
drop trigger if exists todo_items_stamp on public.todo_items;
create trigger todo_items_stamp before update on public.todo_items
  for each row execute function public.todo_items_stamp();

create or replace function public.todo_refresh() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  today date := (now() at time zone 'Asia/Dubai')::date;
  mstart date := date_trunc('month', (now() at time zone 'Asia/Dubai'))::date;
  n integer;
begin
  create temp table cand (key text primary key, rule text, branch text, title text, detail text,
                          link text, severity smallint) on commit drop;

  -- Branch codes as the tables hold them.
  create temp table br (code text, name text, ord int) on commit drop;
  insert into br values ('SAA', 'Saadiyat', 1), ('KCA', 'Khalifa City A', 2), ('MC', 'Motor City', 3), ('AQ', 'Al Quoz', 4);

  -- 1. Ledger gaps, one item per day.
  insert into cand
  select 'ledger:' || d.dt, 'ledger', null,
         'Reports missing for ' || to_char(d.dt, 'Dy DD Mon'),
         'No Financial Totals for ' || string_agg(b.name, ', ' order by b.ord) || '. Run /daily-reports for that date.',
         '/?view=ledgerFinancials', 1
  from (select today - i dt from generate_series(1, 14) i) d
  cross join br b
  where not exists (select 1 from financial_totals f where f.branch = b.code and f.date = d.dt)
    and not exists (select 1 from closed_days c where c.branch = b.code and c.date = d.dt)
  group by d.dt;

  -- 2. Behind the month's pace.
  create temp table closing_dow (branch text, dow int) on commit drop;
  insert into closing_dow
  select f.branch, extract(dow from f.date)::int
  from financial_totals f
  where f.date >= today - 56 and f.date < today and f.branch in (select code from br)
  group by 1, 2
  having count(*) filter (where coalesce(f.sales_net, 0) = 0) >= 6;

  insert into cand
  select 'pace:' || b.code || ':' || to_char(mstart, 'YYYY-MM'), 'pace', b.code,
         b.name || ' is behind target pace',
         'Services AED ' || to_char(round(p.svc), 'FM999,999,999') || ' of AED ' || to_char(round(t.actual_target), 'FM999,999,999')
           || ' (' || round(100 * p.svc / t.actual_target) || '%). The month is ' || round(100 * p.exp)
           || '% through its open days.',
         '/?view=ledgerActuals',
         case when p.exp - p.svc / t.actual_target >= 0.10 then 1 else 2 end
  from br b
  join branch_targets t on t.branch = b.code and t.month = mstart and coalesce(t.actual_target, 0) > 0
  cross join lateral (
    select coalesce((select sum(f.services_net) from financial_totals f
                      where f.branch = b.code and f.date >= mstart and f.date < today), 0) svc,
           (select count(*)::numeric from generate_series(mstart::timestamp, (today - 1)::timestamp, interval '1 day') g(d)
             where extract(dow from g.d)::int not in (select dow from closing_dow where branch = b.code)
               and not exists (select 1 from closed_days c where c.branch = b.code and c.date = g.d::date))
           / nullif((select count(*) from generate_series(mstart::timestamp, (mstart + interval '1 month - 1 day')::timestamp, interval '1 day') g(d)
                      where extract(dow from g.d)::int not in (select dow from closing_dow where branch = b.code)), 0) exp,
           (select count(*) from generate_series(mstart::timestamp, (today - 1)::timestamp, interval '1 day') g(d)
             where extract(dow from g.d)::int not in (select dow from closing_dow where branch = b.code)
               and not exists (select 1 from closed_days c where c.branch = b.code and c.date = g.d::date)) open_days
  ) p
  where p.open_days >= 3 and p.svc / t.actual_target < p.exp - 0.05;

  -- 3. Rebooking under the level minimum, one item per branch.
  insert into cand
  select 'rebook:' || x.branch || ':' || to_char(mstart, 'YYYY-MM'), 'rebook', x.branch,
         count(*) || case when count(*) = 1 then ' stylist is' else ' stylists are' end
           || ' under the minimum rebooking at ' || (select name from br where code = x.branch),
         'Last 28 days. Furthest under: '
           || (select string_agg(y.who || ' ' || y.pct || '% (min ' || y.mn || '%)', ', ' order by y.gap)
                 from (select * from (select s2.display_name who, r2.pct, bm2.minimum mn, r2.pct - bm2.minimum gap
                                        from perf_staff s2
                                        join (select branch, employee_name,
                                                     round(100.0 * sum(rebooked) / nullif(sum(visits), 0))::int pct,
                                                     sum(visits) v
                                                from phorest_staff_rebooking
                                               where date >= today - 28 and date < today group by 1, 2) r2
                                          on lower(r2.employee_name) = lower(s2.phorest_name) and r2.branch = s2.branch
                                        join perf_benchmarks bm2 on bm2.kpi = 'rebooking_pct' and bm2.level::text = s2.level::text
                                       where s2.active and s2.branch = x.branch and r2.v >= 30 and r2.pct < bm2.minimum) z
                       order by z.gap limit 3) y),
         '/?view=team', 2
  from (select s.branch, s.display_name
          from perf_staff s
          join (select branch, employee_name,
                       round(100.0 * sum(rebooked) / nullif(sum(visits), 0)) pct, sum(visits) v
                  from phorest_staff_rebooking
                 where date >= today - 28 and date < today group by 1, 2) r
            on lower(r.employee_name) = lower(s.phorest_name) and r.branch = s.branch
          join perf_benchmarks bm on bm.kpi = 'rebooking_pct' and bm.level::text = s.level::text
         where s.active and s.branch in (select code from br) and r.v >= 30 and r.pct < bm.minimum) x
  group by x.branch;

  -- 4. Google reviews waiting for a reply (Fratelli is closed).
  insert into cand
  select 'review:' || r.review_id, 'review', r.branch,
         r.stars || '-star review waiting for a reply, ' || split_part(r.branch, ',', 1),
         coalesce(nullif(left(r.reviewer, 40), ''), 'A client') || ', '
           || to_char(coalesce(r.review_date, r.created_at::date), 'DD Mon')
           || coalesce(': ' || nullif(left(regexp_replace(r.comment, '\s+', ' ', 'g'), 140), ''), ''),
         '/?view=reviews', case when r.stars <= 3 then 1 else 2 end
  from google_reviews r
  where not coalesce(r.replied, false) and r.branch not ilike '%Fratelli%'
    and ((r.stars <= 3 and coalesce(r.review_date, r.created_at::date) >= today - 60)
      or (r.stars >= 4 and coalesce(r.review_date, r.created_at::date) >= today - 14));

  -- 5. A sync that stopped or is failing.
  insert into cand
  select 'sync:' || h.name, 'sync', null,
         h.name || case when h.last_error is not null then ' is failing' else ' has stopped syncing' end,
         'Last good run ' || coalesce(to_char(h.last_ok_at at time zone 'Asia/Dubai', 'DD Mon HH24:MI'), 'never')
           || coalesce('. ' || left(h.last_error, 140), ''),
         null, 1
  from sync_health h
  where h.name <> 'todo-refresh'
    and (h.last_ok_at is null or h.last_ok_at < now() - interval '36 hours' or h.last_error is not null)
    and not (h.name = 'lost-send-worker' and not coalesce((select enabled from lost_send_config limit 1), false));

  insert into todo_items as t (key, rule, branch, title, detail, link, severity, status, first_seen, last_seen)
  select key, rule, branch, title, detail, link, severity, 'open', today, now() from cand
  on conflict (key) do update set
    rule = excluded.rule, branch = excluded.branch, title = excluded.title, detail = excluded.detail,
    link = excluded.link, severity = excluded.severity, last_seen = now(),
    first_seen = case when t.status = 'closed' then today else t.first_seen end,
    status = case when t.status = 'closed' then 'open'
                  when t.status = 'snoozed' and t.snoozed_until <= today then 'open'
                  else t.status end,
    snoozed_until = case when t.status = 'closed' or (t.status = 'snoozed' and t.snoozed_until <= today)
                         then null else t.snoozed_until end,
    closed_at = case when t.status = 'closed' then null else t.closed_at end,
    done_at = case when t.status = 'closed' then null else t.done_at end,
    done_by = case when t.status = 'closed' then null else t.done_by end;

  -- The data stopped matching: closed, whatever state it was in.
  update todo_items set status = 'closed', closed_at = now(), snoozed_until = null
   where status <> 'closed' and key not in (select key from cand);

  insert into sync_health (name, last_run_at, last_ok_at, last_error)
  values ('todo-refresh', now(), now(), null)
  on conflict (name) do update set last_run_at = now(), last_ok_at = now(), last_error = null;

  select count(*) into n from todo_items where status = 'open';
  return n;
end $$;
revoke all on function public.todo_refresh() from public, anon, authenticated;

-- The page's Refresh button: same run, but only for whoever may open the To do page.
create or replace function public.todo_refresh_now() returns integer
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.kb_can_read('todo') then raise exception 'not allowed'; end if;
  return public.todo_refresh();
end $$;
revoke all on function public.todo_refresh_now() from public, anon;
grant execute on function public.todo_refresh_now() to authenticated;

select cron.schedule('todo-refresh-hourly', '5 * * * *', $$ select public.todo_refresh(); $$);
