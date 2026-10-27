-- Kate, 27 Oct 2026: "nako dami may duplicates. we need to make it accurate". Counting clients by NAME is off 1 to 4% in every branch: one client under two spellings
-- (the PDF wraps "Venetia Pearson- Lees", doubles "claire vigot claire vigot") counts twice, two women with one name ("Amna Al Zaabi", 12 women at Khalifa City A) count once.
-- 2026 to 26 Oct, distinct names vs distinct Phorest clients on the sales lines: AQ 1,066 / 1,033, KCA 3,406 / 3,464, MC 1,231 / 1,186, SAA 3,319 / 3,235.
--
-- Phase 1 (this file, moves no number): every sales line carries
--   client_id  the Phorest client id of its sale (phorest_visit_clients: UAE by sale id = transactionNumber; Bahrain, whose sale ids are synthetic, by day and name when one client carries it)
--   ckey       the key to COUNT and GROUP clients by: client_id when known, else 'n:' + the folded name (stl_key_fold, which already undoes the doubled "x x" names), else null for a blank name
-- Kept current both ways: after lines are inserted (the sale is looked up) and after phorest_visit_clients is pulled (Step 12 of daily-reports runs after the lines are pushed).
-- Phase 2 switches the counts and the lists from the name key to ckey together, so a figure always matches its list (door_clients and drill_door_clients first). Run phorest_visit_clients_table.sql first.

alter table public.sales_transaction_lines add column if not exists client_id text;
alter table public.sales_transaction_lines add column if not exists ckey text;
create index if not exists stl_ckey_idx on public.sales_transaction_lines (ckey, branch, date);

create or replace function public.stl_client_id_refresh(p_from date, p_to date)
returns integer language plpgsql security definer set search_path = public set statement_timeout to '120s' as $$
declare n integer;
begin
  with bah as (
    select branch, date, name_key, min(phorest_client_id) as cid
    from public.phorest_visit_clients
    where branch = 'BAH' and date between p_from and p_to
    group by 1, 2, 3 having count(distinct phorest_client_id) = 1
  ), x as (
    select l.id, v.phorest_client_id as cid,
           coalesce(v.phorest_client_id, b.cid) as c2,
           case when nullif(trim(l.client_name), '') is not null then 'n:' || public.stl_key_fold(l.client_name) end as nm
    from public.sales_transaction_lines l
    left join public.phorest_visit_clients v on v.branch = l.branch and v.date = l.date and v.tx = l.sale_id
    left join bah b on b.branch = l.branch and b.date = l.date and b.name_key = public.stl_client_key(l.client_name)
    where l.date between p_from and p_to
  )
  update public.sales_transaction_lines t set client_id = x.c2, ckey = coalesce(x.c2, x.nm)
  from x
  where t.id = x.id and (t.client_id is distinct from x.c2 or t.ckey is distinct from coalesce(x.c2, x.nm));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.stl_client_id_refresh(date, date) from public, anon, authenticated;

create or replace function public.stl_client_id_after_lines()
returns trigger language plpgsql security definer set search_path = public as $$
declare lo date; hi date;
begin
  select min(date), max(date) into lo, hi from new_rows;
  if lo is not null then perform public.stl_client_id_refresh(lo, hi); end if;
  return null;
end $$;
drop trigger if exists stl_client_id_ins on public.sales_transaction_lines;
create trigger stl_client_id_ins after insert on public.sales_transaction_lines
  referencing new table as new_rows for each statement execute function public.stl_client_id_after_lines();

create or replace function public.stl_client_id_after_visit_clients_ins()
returns trigger language plpgsql security definer set search_path = public as $$
declare lo date; hi date;
begin
  select min(date), max(date) into lo, hi from new_rows;
  if lo is not null then perform public.stl_client_id_refresh(lo, hi); end if;
  return null;
end $$;
create or replace function public.stl_client_id_after_visit_clients_upd()
returns trigger language plpgsql security definer set search_path = public as $$
declare lo date; hi date;
begin
  select min(date), max(date) into lo, hi from new_rows;
  if lo is not null then perform public.stl_client_id_refresh(lo, hi); end if;
  return null;
end $$;
drop trigger if exists stl_client_id_vc_ins on public.phorest_visit_clients;
create trigger stl_client_id_vc_ins after insert on public.phorest_visit_clients
  referencing new table as new_rows for each statement execute function public.stl_client_id_after_visit_clients_ins();
drop trigger if exists stl_client_id_vc_upd on public.phorest_visit_clients;
create trigger stl_client_id_vc_upd after update on public.phorest_visit_clients
  referencing new table as new_rows for each statement execute function public.stl_client_id_after_visit_clients_upd();

-- first fill, one call per year (about a minute each):
-- select y, public.stl_client_id_refresh(make_date(y,1,1), make_date(y,12,31)) from generate_series(2021, 2026) y;
