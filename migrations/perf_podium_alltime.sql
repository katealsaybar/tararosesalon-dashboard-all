-- The Podium Race on a stylist's own link, for This year and All time (Kate, 23 Oct 2026: "build it, all time", with the same filter
-- principles as the management Podium Race: a period, a stat to rank by, and the salon).
--
-- Why a rollup: perf_podium_stats_me ranks one month and calls perf_core for every person in the team (about 0.2 s). The same call over
-- 1 May 2021 to today is about 12 s for the 36 on hair, far too slow behind a phone. So each finished month is worked out once, kept in
-- perf_podium_month, and a longer window is the sum of its months plus the month in progress, worked out live. About 0.3 s.
--
-- Nothing existing is changed: perf_podium_me and perf_podium_stats_me stay as they are and still answer This month and Last month.
-- Same rules as them: her token, her own team only, people on the active performance list, podium_overrides hide/left applied on the full
-- name, behind the same sign-in lock (perf_lock_ok). The rows returned carry a name, a branch, a rank and one figure; no ids, tokens,
-- emails or ledger keys. The rollup table itself has row level security on and no policy, so only these functions can read it.
--
-- Where the figures come from, the same as the one-month call:
--   sales       services plus retail before VAT, Phorest Staff Daily (perf_podium_me's own sum)
--   services    perf_core total_revenue          retail  perf_core retail          treatments  perf_core treatments (hair only)
--   rebooking   rebooked / rebook_visits, only for people with 20 or more tracked visits in the window (a few visits at 100% is not a win)
--   ncr         new client requests (ledger)     reviews perf_core google_reviews   posts  perf_core social_feed   clients  Phorest visits
-- Anyone at 0, or with no figure, is not ranked and not counted.
--
-- Run order (SQL editor, one block at a time):
--   1. this file (the table and the three functions)
--   2. the two backfill lines at the bottom (about 20 to 30 seconds each)
--   3. the check query, then the nightly job

create table if not exists public.perf_podium_month (
  month         date    not null,                 -- first of the month
  staff_id      uuid    not null,
  sales         numeric, services numeric, retail numeric, treatments numeric,
  rebook_visits numeric, rebooked numeric,
  ncr           numeric, reviews numeric, posts numeric, clients numeric,
  built_at      timestamptz not null default now(),
  primary key (month, staff_id)
);
alter table public.perf_podium_month enable row level security;   -- no policy on purpose: the functions below are security definer

-- Work out whole months (inclusive of both ends' months) and keep them. Safe to run again: a month is replaced, not added to.
create or replace function public.perf_podium_rollup(p_from date, p_to date) returns integer
language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_from)::date;
  stop date := date_trunc('month', p_to)::date;
  e date;
  n integer := 0;
begin
  while m <= stop loop
    e := (m + interval '1 month' - interval '1 day')::date;
    delete from perf_podium_month where month = m;
    insert into perf_podium_month (month, staff_id, sales, services, retail, treatments, rebook_visits, rebooked, ncr, reviews, posts, clients)
    select m, x.id,
           (select coalesce(sum(d.services_ex_vat), 0) + coalesce(sum(d.products_ex_vat), 0)
              from phorest_staff_daily d
             where d.employee_name = x.phorest_name and not d.is_total and d.date between m and e),
           (x.n->>'total_revenue')::numeric, (x.n->>'retail')::numeric, (x.n->>'treatments')::numeric,
           (x.n->'phorest'->>'rebook_visits')::numeric, (x.n->'phorest'->>'rebooked')::numeric,
           (x.n->>'ncr')::numeric, (x.n->>'google_reviews')::numeric, (x.n->>'social_feed')::numeric, (x.n->'phorest'->>'clients')::numeric
      from (select p.id, p.phorest_name, public.perf_core(p, m, e) n from perf_staff p where p.active) x;
    n := n + 1;
    m := (m + interval '1 month')::date;
  end loop;
  return n;
end $$;
revoke all on function public.perf_podium_rollup(date, date) from public;   -- run by hand and by the nightly job only, never from the page

-- The page's call. p_from is the first of a month (This year: 1 Jan; All time: 1 May 2021, where Phorest's staff figures begin); the window
-- runs to the latest Phorest day. Called with both dates null it only says whether this is installed, so the page can hide the choices until it is.
create or replace function public.perf_podium_range_me(p_token uuid, p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  first_d constant date := date '2021-05-01';
  last_d date := (select max(date) from phorest_staff_daily);
  cur date;
  f date;
  t date;
  need int;
  have int;
  out jsonb;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  if p_from is null and p_to is null then return jsonb_build_object('ready', true); end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;

  cur := date_trunc('month', coalesce(last_d, current_date))::date;                 -- the month in progress is worked out live
  f := date_trunc('month', greatest(coalesce(p_from, first_d), first_d))::date;
  t := coalesce(last_d, current_date);
  if f > t then return null; end if;

  -- every finished month in the window must be in the rollup, or the sums would run low without saying so
  need := (extract(year from age(cur, f)) * 12 + extract(month from age(cur, f)))::int;
  select count(*) into have from perf_podium_month where month >= f and month < cur;
  if have < need * (select count(*) from perf_staff where active) * 0.5 then raise exception 'rollup_incomplete'; end if;

  with who as (
    select p.* from perf_staff p
     where p.active and p.dept = s.dept
       and not exists (select 1 from podium_overrides o
                        where o.kind in ('hide', 'left')
                          and o.name_key in (upper(regexp_replace(p.display_name, '[^A-Za-z ]', '', 'g')),
                                             upper(regexp_replace(p.phorest_name, '[^A-Za-z ]', '', 'g'))))
  ), parts as (
    select r.staff_id id, r.sales, r.services, r.retail, r.treatments, r.rebook_visits, r.rebooked, r.ncr, r.reviews, r.posts, r.clients
      from perf_podium_month r where r.month >= f and r.month < cur
    union all
    select w.id,
           (select coalesce(sum(d.services_ex_vat), 0) + coalesce(sum(d.products_ex_vat), 0)
              from phorest_staff_daily d where d.employee_name = w.phorest_name and not d.is_total and d.date between cur and t),
           (c.n->>'total_revenue')::numeric, (c.n->>'retail')::numeric, (c.n->>'treatments')::numeric,
           (c.n->'phorest'->>'rebook_visits')::numeric, (c.n->'phorest'->>'rebooked')::numeric,
           (c.n->>'ncr')::numeric, (c.n->>'google_reviews')::numeric, (c.n->>'social_feed')::numeric, (c.n->'phorest'->>'clients')::numeric
      from who w, lateral (select public.perf_core(w, greatest(cur, f), t) n) c
     where t >= cur
  ), tot as (
    select id, sum(sales) sales, sum(services) services, sum(retail) retail, sum(treatments) treatments,
           sum(rebook_visits) rv, sum(rebooked) rb, sum(ncr) ncr, sum(reviews) reviews, sum(posts) posts, sum(clients) clients
      from parts group by id
  ), vals as (
    select w.id, w.display_name nm, w.branch br, v.k, v.v
      from who w join tot x on x.id = w.id, lateral (values
        ('sales',      x.sales),
        ('services',   x.services),
        ('retail',     x.retail),
        ('treatments', case when s.dept = 'Hair' then x.treatments end),
        ('rebooking',  case when coalesce(x.rv, 0) >= 20 then 100.0 * x.rb / x.rv end),
        ('ncr',        x.ncr),
        ('reviews',    x.reviews),
        ('posts',      x.posts),
        ('clients',    x.clients)
      ) v(k, v)
  ), ranked as (
    select r.*, rank() over (partition by r.k order by round(r.v, case when r.k = 'rebooking' then 1 else 0 end) desc) rk
      from vals r where r.v > 0
  ), per as (
    select k,
           count(*) ranked,
           (select jsonb_build_object('rank', m.rk, 'value', round(m.v, case when m.k = 'rebooking' then 1 else 0 end))
              from ranked m where m.k = r.k and m.id = s.id) me,
           jsonb_agg(jsonb_build_object('rank', r.rk, 'name', r.nm, 'branch', r.br,
                                        'value', round(r.v, case when r.k = 'rebooking' then 1 else 0 end), 'me', r.id = s.id)
                     order by r.rk, r.nm) board
      from ranked r group by k
  )
  select jsonb_build_object('month', f, 'from', f, 'to', t, 'dept', s.dept, 'range', true,
    'stats', coalesce((select jsonb_object_agg(per.k, jsonb_build_object('ranked', per.ranked, 'me', per.me, 'board', per.board)) from per), '{}'::jsonb))
    into out;
  return out;
end $$;
revoke all on function public.perf_podium_range_me(uuid, date, date) from public;
grant execute on function public.perf_podium_range_me(uuid, date, date) to anon, authenticated;

-- 2. BACKFILL (two runs, each about 20 to 30 seconds):
--   select public.perf_podium_rollup(date '2021-05-01', date '2023-12-31');
--   select public.perf_podium_rollup(date '2024-01-01', current_date);
--
-- 3. CHECK (the month in progress through the range call must equal the one-month call, rank for rank). Use any active staff token:
--   select (public.perf_podium_range_me(t, date_trunc('month', current_date)::date, current_date)->'stats'->'services'->'me')
--        = (public.perf_podium_stats_me(t)->'stats'->'services'->'me') as same
--     from (select token t from perf_staff where active limit 1) x;
--
-- 4. NIGHTLY (02:30 Dubai; the last two months are redone so a late sales upload is picked up):
--   select cron.schedule('perf-podium-rollup-nightly', '30 22 * * *',
--     $$select public.perf_podium_rollup(date_trunc('month', current_date - interval '40 days')::date, current_date)$$);
