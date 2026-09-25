-- Payslips + leader/payroll roles + review client credit (Kate, 25 Sep 2026)
-- Runs after create_performance.sql. Everything is create-or-replace / if-not-
-- exists, so re-running is safe.

-- ── Roles ────────────────────────────────────────────────────────────────
-- Leader tokens (Kate, Tara, Emma) get the team view and notes. Payroll tokens
-- (the accounts / admin team) can only upload and read payslips, through the
-- payslips edge function; they never see performance numbers.
alter table perf_admins add column if not exists role text not null default 'leader'
  check (role in ('leader','payroll'));
insert into perf_admins (name, role) values ('Accounts', 'payroll') on conflict (name) do nothing;

create or replace function perf_team(p_admin uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  m2 date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month - 1 day')::date;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role = 'leader') then return null; end if;
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
  select name into who from perf_admins where token = p_admin and role = 'leader';
  select id into sid from perf_staff where token = p_token;
  if who is null or sid is null or coalesce(trim(p_note), '') = '' then return false; end if;
  insert into perf_notes (staff_id, month, author, note)
  values (sid, date_trunc('month', p_month)::date, who, trim(p_note));
  return true;
end $$;

create or replace function perf_delete_note(p_admin uuid, p_note_id bigint) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from perf_admins where token = p_admin and role = 'leader') then return false; end if;
  delete from perf_notes where id = p_note_id;
  return found;
end $$;

-- ── Payslips ─────────────────────────────────────────────────────────────
-- One PDF per person per month in a PRIVATE bucket. No anon policies on the
-- bucket or the table: supabase/functions/payslips is the only way in, and it
-- hands out 10-minute signed links. Uploaded from the Upload Portal's Payslips
-- tab (upload/payslips.js); read by the stylist's page and the monthly email.
create table if not exists payslips (
  staff_id     uuid not null references perf_staff(id) on delete cascade,
  month        date not null,
  path         text not null,
  file_name    text,
  size_bytes   int,
  uploaded_by  text not null,
  uploaded_at  timestamptz not null default now(),
  primary key (staff_id, month)
);
alter table payslips enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payslips', 'payslips', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];

-- ── Reviews from a stylist's own client ──────────────────────────────────
-- A review that names nobody still belongs to someone: if the reviewer was a
-- client in the 14 days before (same name in sales_transaction_lines), the staff
-- who served her get the credit. Exact-date reviews only (not Google Maps'
-- "a year ago"), and only when no staff name appears at all.
create or replace function review_names_anyone(comment text) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from staff_name_variants v
                 where case when v.strict then comment ~ ('\m' || v.variant || '\M')
                            else comment ~* ('\m' || v.variant || '\M') end)
$$;

create index if not exists stl_client_lower_date_idx on sales_transaction_lines (lower(trim(client_name)), date);

-- Visits first (cheap, indexed), the name check only on those: anon calls this
-- under a 3-second statement timeout.
create or replace view google_review_client_credit as
with visits as materialized (
  select distinct g.review_id, g.review_date, g.branch, g.comment, s.employee_name
  from google_reviews g
  join sales_transaction_lines s
    on lower(trim(s.client_name)) = lower(trim(g.reviewer))
   and s.date between g.review_date - 14 and g.review_date
  where not coalesce(g.date_approx, false)
    and coalesce(g.reviewer, '') <> ''
)
select distinct v.review_id, v.review_date, v.branch,
       (select n.staff_key from staff_name_variants n where n.staff_key = any(ps.ledger_names) limit 1) as staff_key,
       ps.phorest_name
from visits v
join perf_staff ps on ps.phorest_name = v.employee_name
where not review_names_anyone(coalesce(v.comment, ''));
grant select on google_review_client_credit to anon, authenticated;

-- A stylist's reviews for the month: named (staff_name_variants) plus her own
-- clients' unnamed ones. perf_dashboard merges this over perf_core, so her page
-- and her email count both; the team grid keeps perf_core's named-only count.
create or replace function perf_reviews(s perf_staff, d1 date, d2 date) returns jsonb
language sql stable security definer set search_path = public as $$
  with br as (
    select s.branch b
    union select distinct branch from phorest_staff_daily
      where employee_name = s.phorest_name and not is_total and date between d1 and d2
  ), named as (
    select g.review_id, g.review_date, g.stars, g.comment, 'named' how
    from google_reviews g
    where g.review_date between d1 and d2
      and (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) in (select b from br)
      and perf_review_names(s.ledger_names, g.comment, g.reviewer, (case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA' when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end) = s.branch)
  ), client as (
    select g.review_id, g.review_date, g.stars, g.comment, 'client' how
    from google_review_client_credit c join google_reviews g using (review_id)
    where c.phorest_name = s.phorest_name and c.review_date between d1 and d2
      and g.review_id not in (select review_id from named)
  ), r as (select * from named union all select * from client)
  select jsonb_build_object(
    'google_reviews', (select count(*) from r),
    'google_reviews_named', (select count(*) from named),
    'review_stars',   (select round(avg(stars), 1) from r),
    'review_list',    (select coalesce(jsonb_agg(jsonb_build_object('date', review_date, 'stars', stars, 'comment', left(coalesce(comment,''), 600), 'how', how) order by review_date desc), '[]') from r)
  )
$$;
revoke all on function perf_reviews(perf_staff, date, date) from public, anon, authenticated;

-- Nicknames confirmed 25 Sep 2026 (Andy from Kate; the rest from reviews, two
-- checked against the reviewer's own visit in sales_transaction_lines).
insert into staff_name_variants (staff_key, variant, kind, strict, note) values
 ('ANDREA','Andy','nickname',false,'what clients call her; IG andygladstone_hair'),
 ('MAY','Mhay','nickname',false,'her IG is hairby_mhay'),
 ('BETHANY','Beth','nickname',false,'SAA reviews'),('BETHANY','Bett','typo',false,'SAA review'),
 ('ARNALYN','Arni','nickname',false,'her photo file is arni.png'),('ARNALYN','Arnie','nickname',false,'SAA reviews'),
 ('LIZANIE','Liz','nickname',false,'KCA review'),
 ('STUART','Stu','nickname',false,'AQ review'),
 ('APRIL','Apple','nickname',true,'IG april_apple_13; also a word'),
 ('XYRHY','Xy','nickname',true,'MC reviews "Xy and Venus"; two letters, capitals only'),
 ('CLARISSA','Claris','nickname',false,'MC review'),
 ('GRACE','Grase','typo',false,'KCA review'),
 ('ALAN','Allen','typo',false,'MC review, "him"'),
 ('SAMANTHA','Sam','nickname',true,'common name'),
 ('EDS','Adz','nickname',false,'confirmed: reviewer Nadine Mourad was Eds''s client 14 days before'),
 ('IRLYN','Lynn','nickname',true,'confirmed: reviewer Asma Alhammadi was Irlyn''s client; also a common name')
on conflict do nothing;

-- ── Name variants: exceptions and people outside staff-profiles.js ───────
-- not_after: a word that, right before this spelling, means someone else.
-- label / home_branch / photo: on the name row of someone who isn't in
-- staff-profiles.js (kept off Staff Cards on purpose) but whose reviews count.
-- (The column is home_branch, not home: perf_review_names has a parameter
-- called home, and a same-named column would shadow it.)
alter table staff_name_variants add column if not exists not_after text;
alter table staff_name_variants add column if not exists label text;
alter table staff_name_variants add column if not exists home_branch text;
alter table staff_name_variants add column if not exists photo text;

insert into staff_name_variants (staff_key, variant, kind, strict, note) values
 ('HAZEL MAE','Mae','nickname',true,'Kate 25 Sep: "Mae" in KCA reviews is Hazel Mae; also a common name, KCA only')
on conflict (staff_key, variant) do nothing;

insert into staff_name_variants (staff_key, variant, kind, strict, label, home_branch, photo, note) values
 ('DAISY','Daisy','name',false,'Daisy Cropper','BAH','assets/org-chart/daisy-charlotte-cropper.png',
  'Daisy Charlotte Cropper: Style Director at KCA before, now Managing Director of TRS Bahrain. Not in staff-profiles.js on purpose.')
on conflict (staff_key, variant) do update set label = excluded.label, home_branch = excluded.home_branch, photo = excluded.photo, note = excluded.note;

create or replace function perf_review_names(keys text[], comment text, reviewer text, home boolean) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from staff_name_variants v
    where v.staff_key = any(keys)
      and case when v.strict then home and comment ~ ('\m' || v.variant || '\M')
               else comment ~* ('\m' || v.variant || '\M') end
      and (v.not_after is null or comment !~* ('\m' || v.not_after || '\s+' || v.variant || '\M'))
      and coalesce(reviewer, '') !~* ('\m' || v.variant || '\M')
      and not (v.variant in ('April','May') and comment ~ ('((in|on|of|since|last|this|next|early|late|mid|from|until|till|during|by) ' || v.variant || '\M|\m' || v.variant || '\s*[0-9])')))
$$;
