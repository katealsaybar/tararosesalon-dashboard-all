-- Money Five / stylist performance pages (Kate, 25 Sep 2026)
--
-- One private page per stylist (performance/?t=<token>) plus a team view for
-- Tara, Emma and Kate (performance/?admin=<token>). Nothing here is typed by
-- hand except the leader notes: every number is read from the tables the
-- daily Phorest pipeline already fills.
--
--   phorest_staff_daily   revenue (services ex VAT), retail (products ex VAT)
--   branch_staff_daily    clients split req/salon/new/ncr, rebooked, treatment AED
--   staff_utilisation     column fill (booked hours / available hours, daily rows)
--   sales_transaction_lines  colour %, conversion, retention (client-level history)
--
-- Definitions follow Tara's "Dashboard 3: Stylist Level Benchmarks" PDF (Dec
-- 2025), Kate's call 25 Sep 2026, where it disagrees with "CALCULATIONS OF KPIS":
--   Total Revenue  = Hair Services + Treatments (retail excluded)
--   Treatments %   = Treatments / Hair Services
--   Retail %       = Retail / (Hair Services + Treatments)
--   Average Bill   = Total Revenue / clients (the PDF's numbers only work ex retail:
--                    Stylist 60,000 / 104 = 577 against a 575 target)
--   Reputation     = (Request % + Rebooking %) / 2 / 20. Shown but not scored:
--                    the formula can't reach its own 4.5-5.0 targets, flagged to Tara.
--
-- Security: the four perf_ tables have RLS on and no policies, so the anon key
-- can't read them. Pages go through the security-definer functions below, which
-- only answer for a valid token.

-- ── Tables ───────────────────────────────────────────────────────────────
create table if not exists perf_staff (
  id            uuid primary key default gen_random_uuid(),
  phorest_name  text not null unique,     -- as in phorest_staff_daily / staff_utilisation / sales lines
  ledger_names  text[] not null,          -- UPPER CASE names in branch_staff_daily
  display_name  text not null,
  branch        text not null,            -- home branch (KCA / SAA / MC / AQ)
  dept          text not null check (dept in ('Hair','Beauty')),
  level         text,                     -- perf_benchmarks.level, null = no benchmark (beauty)
  email         text,
  mention_names text[],                   -- names a Google review uses for them (default: first name)
  send_email    boolean not null default true,
  active        boolean not null default true,
  token         uuid not null unique default gen_random_uuid(),
  created_at    timestamptz not null default now()
);

create table if not exists perf_benchmarks (
  level        text not null,
  level_order  int  not null,
  kpi          text not null,
  minimum      numeric,
  target       numeric,
  primary key (level, kpi)
);

create table if not exists perf_admins (
  token  uuid primary key default gen_random_uuid(),
  name   text not null unique
);

create table if not exists perf_notes (
  id          bigint generated always as identity primary key,
  staff_id    uuid not null references perf_staff(id) on delete cascade,
  month       date not null,
  author      text not null,
  note        text not null,
  created_at  timestamptz not null default now()
);

alter table perf_staff      enable row level security;
alter table perf_benchmarks enable row level security;
alter table perf_admins     enable row level security;
alter table perf_notes      enable row level security;

create index if not exists stl_employee_date_idx on sales_transaction_lines (employee_name, date);
create index if not exists stl_client_date_idx   on sales_transaction_lines (client_name, date);

-- ── Colour services (hair only) ──────────────────────────────────────────
create or replace function perf_is_colour(item text) returns boolean
language sql immutable as $$
  select coalesce(item ~* '(toner|toning|root colou?r|root hairline|root stretch|bleach|colou?r|balayage|foil|ombre|highlight|max\. bright|face frame|partial)'
     and item !~* '(polish|biab|gel|nail|lock trt|shampoo|conditioner|mask|brow|lash|consultation)', false)
$$;

-- ── Core numbers for one stylist over a date range ───────────────────────
create or replace function perf_core(s perf_staff, d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select coalesce(sum(services_ex_vat),0) svc, coalesce(sum(products_ex_vat),0) retail,
           coalesce(sum(visits),0) visits, max(date) last_date
    from phorest_staff_daily
    where employee_name = s.phorest_name and not is_total and date between d1 and d2
  ), l as (
    select coalesce(sum(total),0) clients, coalesce(sum(req),0) req, coalesce(sum(salon),0) salon,
           coalesce(sum(new_client),0) newc, coalesce(sum(ncr),0) ncr,
           coalesce(sum(rebooked),0) rebooked, coalesce(sum(treatment_aed),0) treat
    from branch_staff_daily
    where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between d1 and d2
  ), u as (
    select sum(utilisation_hours) uh, sum(available_hours) ah
    from staff_utilisation
    where staff_name = s.phorest_name and not coalesce(is_archived,false)
      and date_from = date_to and date_from between d1 and d2
  )
  select jsonb_build_object(
    'total_revenue',   round(p.svc, 2),
    'hair_services',   round(p.svc - l.treat, 2),
    'treatments',      round(l.treat, 2),
    'treatments_pct',  case when p.svc - l.treat > 0 then round(100 * l.treat / (p.svc - l.treat), 1) end,
    'retail',          round(p.retail, 2),
    'retail_pct',      case when p.svc > 0 then round(100 * p.retail / p.svc, 1) end,
    'avg_bill',        case when l.clients > 0 then round(p.svc / l.clients, 0) end,
    'avg_bill_retail', case when l.clients > 0 then round((p.svc + p.retail) / l.clients, 0) end,
    'clients',         l.clients,
    'req',             l.req,
    'salon',           l.salon,
    'new_clients',     l.newc,
    'ncr',             l.ncr,
    'rebooked',        l.rebooked,
    'rebooking_pct',   case when l.clients > 0 then round(100.0 * l.rebooked / l.clients, 1) end,
    'request_pct',     case when l.clients > 0 then round(100.0 * (l.req + l.ncr) / l.clients, 1) end,
    'column_fill_pct', case when u.ah > 0 then round(100 * u.uh / u.ah, 1) end,
    'booked_hours',    round(coalesce(u.uh,0), 1),
    'available_hours', round(coalesce(u.ah,0), 1),
    'reputation',      case when l.clients > 0 then round(((100.0 * (l.req + l.ncr) / l.clients) + (100.0 * l.rebooked / l.clients)) / 2 / 20, 1) end,
    'google_reviews',  (select count(*) from google_reviews g
                        where g.review_date between d1 and d2
                          and (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                                    when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end)
                              in (select s.branch union select distinct branch from phorest_staff_daily
                                  where employee_name = s.phorest_name and not is_total and date between d1 and d2)
                          and exists (select 1 from unnest(s.mention_names) n where g.comment ~ ('\m' || n || '\M'))),
    'last_date',       p.last_date
  )
  from p, l, u
$$;

-- ── Client-history numbers (colour %, conversion, retention) ─────────────
-- Conversion: brand-new clients whose first ever visit was with this stylist in
-- the 3 months that ended 3 months before `asof`, and whether they came back
-- (to anyone) within 12 weeks. Retention: existing clients this stylist saw in
-- that same earlier window, and whether they came back to her in the last 3
-- months. Both run to the last date the sales lines actually cover.
create or replace function perf_clients(s perf_staff, d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  with asof as (
    select least(d2, (select max(date) from sales_transaction_lines)) as d
  ), days as (   -- one row per client per visit day, anyone, with that client's next visit day
    select client_name, date,
           lead(date) over (partition by client_name order by date) next_date,
           row_number() over (partition by client_name order by date) visit_no
    from (select distinct client_name, date from sales_transaction_lines
          where client_name is not null and client_name <> '' and date <= (select d from asof)) x
  ), mine as (   -- this stylist's visit days
    select client_name, date, bool_or(perf_is_colour(item)) is_col
    from sales_transaction_lines
    where employee_name = s.phorest_name and client_name is not null and client_name <> ''
      and date <= (select d from asof)
    group by client_name, date
  ), colour as (
    select count(*) visits, count(*) filter (where is_col) col
    from mine where date between d1 and d2
  ), cohort as (   -- brand-new clients whose first visit was with this stylist
    select d.client_name, d.date first_date, d.next_date
    from days d join mine m on m.client_name = d.client_name and m.date = d.date
    where d.visit_no = 1
      and d.date between (select d from asof) - 179 and (select d from asof) - 90
  ), conv as (
    select count(*) n,
           count(*) filter (where next_date <= first_date + 84) back12,
           count(*) filter (where next_date - first_date <= 28) w4,
           count(*) filter (where next_date - first_date between 29 and 42) w6,
           count(*) filter (where next_date - first_date between 43 and 56) w8,
           count(*) filter (where next_date - first_date between 57 and 84) w12,
           count(*) filter (where next_date is null or next_date - first_date > 84) not_yet
    from cohort
  ), earlier as (   -- existing clients she saw in the earlier window
    select distinct m.client_name
    from mine m join days d on d.client_name = m.client_name and d.date = m.date
    where d.visit_no > 1
      and m.date between (select d from asof) - 179 and (select d from asof) - 90
  ), ret as (
    select count(*) n,
           count(*) filter (where exists (
             select 1 from mine m2 where m2.client_name = e.client_name
               and m2.date > (select d from asof) - 90 and m2.date <= (select d from asof))) back
    from earlier e
  )
  select jsonb_build_object(
    'colour_pct',       case when colour.visits > 0 then round(100.0 * colour.col / colour.visits, 1) end,
    'colour_visits',    colour.col,
    'conversion_pct',   case when conv.n > 0 then round(100.0 * conv.back12 / conv.n, 1) end,
    'conversion_n',     conv.n,
    'conversion_weeks', jsonb_build_object('w4', conv.w4, 'w6', conv.w6, 'w8', conv.w8, 'w12', conv.w12, 'not_yet', conv.not_yet),
    'retention_pct',    case when ret.n > 0 then round(100.0 * ret.back / ret.n, 1) end,
    'retention_n',      ret.n,
    'asof',             (select d from asof)
  )
  from colour, conv, ret
$$;

-- ── Google reviews that name this person ─────────────────────────────────
-- At a branch they worked that month (or their home branch). Capitalised
-- whole-word match, so "shine" or "may" in a sentence doesn't count, only Shine
-- or May the person. Nicknames (Lyn, Lucia, Tamryn, MJ) live in mention_names.
create or replace function perf_reviews(s perf_staff, d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  with br as (
    select s.branch b
    union select distinct branch from phorest_staff_daily
      where employee_name = s.phorest_name and not is_total and date between d1 and d2
  ), r as (
    select g.review_date, g.stars, g.comment
    from google_reviews g
    where g.review_date between d1 and d2
      and (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) in (select b from br)
      and exists (select 1 from unnest(s.mention_names) n where g.comment ~ ('\m' || n || '\M'))
  )
  select jsonb_build_object(
    'google_reviews', (select count(*) from r),
    'review_stars',   (select round(avg(stars), 1) from r),
    'review_list',    (select coalesce(jsonb_agg(jsonb_build_object('date', review_date, 'stars', stars, 'comment', left(comment, 600)) order by review_date desc), '[]') from r)
  )
$$;

-- ── One stylist's page ───────────────────────────────────────────────────
create or replace function perf_dashboard(p_token uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  m2 date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month - 1 day')::date;
  lvl_order int;
  weeks jsonb;
begin
  select * into s from perf_staff where token = p_token and active;
  if not found then return null; end if;

  select level_order into lvl_order from perf_benchmarks where level = s.level limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('week_start', w, 'numbers', perf_core(s, greatest(w, m1), least(w + 6, m2))) order by w), '[]')
    into weeks
  from generate_series(date_trunc('week', m1::timestamp), m2::timestamp, interval '7 day') g(g0), lateral (select g0::date w) x;

  return jsonb_build_object(
    'staff', jsonb_build_object('name', s.display_name, 'branch', s.branch, 'dept', s.dept, 'level', s.level, 'keys', s.ledger_names),
    'month', m1,
    'numbers', perf_core(s, m1, m2) || perf_clients(s, m1, m2) || perf_reviews(s, m1, m2),
    'weeks', weeks,
    'history', (select jsonb_agg(jsonb_build_object('month', mm, 'numbers', perf_core(s, mm, (mm + interval '1 month - 1 day')::date)) order by mm)
                from (select (m1 - (k || ' month')::interval)::date mm from generate_series(1, 3) k) h),
    'benchmarks', (select jsonb_object_agg(kpi, jsonb_build_object('min', minimum, 'target', target))
                   from perf_benchmarks where level = s.level),
    'next_level', (select level from perf_benchmarks where level_order = lvl_order + 1 limit 1),
    'next_benchmarks', (select jsonb_object_agg(kpi, jsonb_build_object('min', minimum, 'target', target))
                        from perf_benchmarks where level_order = lvl_order + 1),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'author', author, 'note', note, 'at', created_at) order by created_at), '[]')
              from perf_notes where staff_id = s.id and month = m1),
    'data_through', jsonb_build_object(
      'revenue', (select max(date) from phorest_staff_daily),
      'clients', (select max(date) from branch_staff_daily where total > 0),
      'column_fill', (select max(date_to) from staff_utilisation),
      'client_history', (select max(date) from sales_transaction_lines),
      'reviews', (select max(review_date) from google_reviews))
  );
end $$;

-- ── Team view (admins only) ──────────────────────────────────────────────
create or replace function perf_team(p_admin uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  m2 date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month - 1 day')::date;
begin
  if not exists (select 1 from perf_admins where token = p_admin) then return null; end if;
  return jsonb_build_object(
    'admin', (select name from perf_admins where token = p_admin),
    'month', m1,
    'staff', (select coalesce(jsonb_agg(jsonb_build_object(
                'token', s.token, 'name', s.display_name, 'branch', s.branch, 'dept', s.dept,
                'level', s.level, 'email', s.email, 'send_email', s.send_email, 'keys', s.ledger_names,
                'numbers', perf_core(s, m1, m2),
                'notes', (select count(*) from perf_notes n where n.staff_id = s.id and n.month = m1))
                order by s.branch, s.dept desc, s.display_name), '[]')
              from perf_staff s where s.active)
  );
end $$;

create or replace function perf_add_note(p_admin uuid, p_token uuid, p_month date, p_note text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare who text; sid uuid;
begin
  select name into who from perf_admins where token = p_admin;
  select id into sid from perf_staff where token = p_token;
  if who is null or sid is null or coalesce(trim(p_note), '') = '' then return false; end if;
  insert into perf_notes (staff_id, month, author, note)
  values (sid, date_trunc('month', p_month)::date, who, trim(p_note));
  return true;
end $$;

create or replace function perf_delete_note(p_admin uuid, p_note_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from perf_admins where token = p_admin) then return false; end if;
  delete from perf_notes where id = p_note_id;
  return found;
end $$;

revoke all on function perf_core(perf_staff, date, date)    from public, anon, authenticated;
revoke all on function perf_clients(perf_staff, date, date) from public, anon, authenticated;
revoke all on function perf_reviews(perf_staff, date, date) from public, anon, authenticated;
grant execute on function perf_dashboard(uuid, date)            to anon;
grant execute on function perf_team(uuid, date)                 to anon;
grant execute on function perf_add_note(uuid, uuid, date, text) to anon;
grant execute on function perf_delete_note(uuid, bigint)        to anon;

-- ── Benchmarks: Dashboard 3 PDF, Dec 2025. Blank = not set in the PDF ────
insert into perf_benchmarks (level, level_order, kpi, minimum, target) values
 ('Blow-Dry Specialist',1,'total_revenue',null,18000),('Blow-Dry Specialist',1,'hair_services',10000,15000),
 ('Blow-Dry Specialist',1,'treatments',2000,3000),('Blow-Dry Specialist',1,'treatments_pct',null,20),
 ('Blow-Dry Specialist',1,'retail',1120,2500),('Blow-Dry Specialist',1,'retail_pct',null,12),
 ('Blow-Dry Specialist',1,'avg_bill',220,220),('Blow-Dry Specialist',1,'rebooking_pct',20,30),
 ('Blow-Dry Specialist',1,'retention_pct',20,30),('Blow-Dry Specialist',1,'clients',45,80),
 ('Blow-Dry Specialist',1,'ncr',4,4),('Blow-Dry Specialist',1,'request_pct',20,20),
 ('Blow-Dry Specialist',1,'conversion_pct',20,30),('Blow-Dry Specialist',1,'column_fill_pct',30,50),
 ('Blow-Dry Specialist',1,'reputation',null,4.5),

 ('Junior Stylist',2,'total_revenue',18000,33600),('Junior Stylist',2,'hair_services',15000,28000),
 ('Junior Stylist',2,'treatments',3000,5600),('Junior Stylist',2,'treatments_pct',20,20),
 ('Junior Stylist',2,'retail',2500,4000),('Junior Stylist',2,'retail_pct',12,12),
 ('Junior Stylist',2,'avg_bill',220,400),('Junior Stylist',2,'rebooking_pct',30,30),
 ('Junior Stylist',2,'retention_pct',30,30),('Junior Stylist',2,'clients',81,84),
 ('Junior Stylist',2,'ncr',4,12),('Junior Stylist',2,'request_pct',20,30),
 ('Junior Stylist',2,'conversion_pct',30,35),('Junior Stylist',2,'column_fill_pct',50,75),
 ('Junior Stylist',2,'colour_pct',40,55),('Junior Stylist',2,'reputation',4.5,4.6),

 ('Stylist',3,'total_revenue',44000,60000),('Stylist',3,'hair_services',40000,50000),
 ('Stylist',3,'treatments',4000,10000),('Stylist',3,'treatments_pct',null,20),
 ('Stylist',3,'retail',4000,6000),('Stylist',3,'retail_pct',null,12),
 ('Stylist',3,'avg_bill',500,575),('Stylist',3,'rebooking_pct',30,55),
 ('Stylist',3,'retention_pct',30,55),('Stylist',3,'clients',88,104),
 ('Stylist',3,'ncr',8,16),('Stylist',3,'request_pct',40,40),
 ('Stylist',3,'conversion_pct',30,40),('Stylist',3,'column_fill_pct',50,80),
 ('Stylist',3,'colour_pct',60,60),('Stylist',3,'reputation',3,4.7),
 ('Stylist',3,'google_reviews',8,12),('Stylist',3,'social_feed',8,12),('Stylist',3,'social_workdays',8,16),

 ('Senior Stylist',4,'total_revenue',60000,78000),('Senior Stylist',4,'hair_services',50000,65000),
 ('Senior Stylist',4,'treatments',10000,13000),('Senior Stylist',4,'treatments_pct',20,20),
 ('Senior Stylist',4,'retail',6000,7800),('Senior Stylist',4,'retail_pct',12,12),
 ('Senior Stylist',4,'avg_bill',600,650),('Senior Stylist',4,'rebooking_pct',55,60),
 ('Senior Stylist',4,'retention_pct',55,60),('Senior Stylist',4,'clients',104,124),
 ('Senior Stylist',4,'ncr',16,12),('Senior Stylist',4,'request_pct',40,50),
 ('Senior Stylist',4,'conversion_pct',40,50),('Senior Stylist',4,'column_fill_pct',80,85),
 ('Senior Stylist',4,'colour_pct',60,65),('Senior Stylist',4,'reputation',4.7,4.8),
 ('Senior Stylist',4,'google_reviews',10,12),('Senior Stylist',4,'social_feed',10,12),('Senior Stylist',4,'social_workdays',10,16),

 ('Style Director',5,'total_revenue',78000,93600),('Style Director',5,'hair_services',65000,78000),
 ('Style Director',5,'treatments',13000,15600),('Style Director',5,'treatments_pct',20,20),
 ('Style Director',5,'retail',7800,11232),('Style Director',5,'retail_pct',12,12),
 ('Style Director',5,'avg_bill',695,795),('Style Director',5,'rebooking_pct',60,70),
 ('Style Director',5,'retention_pct',60,70),('Style Director',5,'clients',124,130),
 ('Style Director',5,'ncr',12,12),('Style Director',5,'request_pct',50,60),
 ('Style Director',5,'conversion_pct',50,50),('Style Director',5,'column_fill_pct',85,90),
 ('Style Director',5,'colour_pct',65,70),('Style Director',5,'reputation',4.8,4.9),
 ('Style Director',5,'google_reviews',10,12),('Style Director',5,'social_feed',10,12),('Style Director',5,'social_workdays',12,16),

 ('Artistic Director',6,'total_revenue',93600,114000),('Artistic Director',6,'hair_services',78000,95000),
 ('Artistic Director',6,'treatments',15600,19000),('Artistic Director',6,'treatments_pct',20,20),
 ('Artistic Director',6,'retail',11232,13680),('Artistic Director',6,'retail_pct',12,12),
 ('Artistic Director',6,'avg_bill',700,800),('Artistic Director',6,'rebooking_pct',70,80),
 ('Artistic Director',6,'retention_pct',70,80),('Artistic Director',6,'clients',130,140),
 ('Artistic Director',6,'ncr',12,12),('Artistic Director',6,'request_pct',60,80),
 ('Artistic Director',6,'conversion_pct',50,60),('Artistic Director',6,'column_fill_pct',90,95),
 ('Artistic Director',6,'colour_pct',70,75),('Artistic Director',6,'reputation',4.9,5.0),
 ('Artistic Director',6,'google_reviews',10,12),('Artistic Director',6,'social_feed',10,12),('Artistic Director',6,'social_workdays',12,16)
on conflict (level, kpi) do update set level_order = excluded.level_order, minimum = excluded.minimum, target = excluded.target;

insert into perf_admins (name) values ('Kate'), ('Tara'), ('Emma') on conflict (name) do nothing;
