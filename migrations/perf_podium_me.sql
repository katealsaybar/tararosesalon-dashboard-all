-- Podium on a stylist's own link (Kate, 19 Oct 2026: "need podium race to appear as another tab sa staff link, so they
-- can see where they at"; she chose the whole board, leavers removed). Same pattern as perf_year_weeks_me: it takes her
-- token, so the staff page never reads perf_team, perf_year_weeks or the ledger tables.
--
-- What it returns: her own bench only (hair with hair, beauty with beauty, as the Podium Race has it), each person's
-- name, branch, rank and figure for one month, and which row is hers. No staff ids, tokens, emails, ledger keys.
-- Who is on it: people on the active performance list (perf_staff.active). Leavers are not on that list; assistants,
-- reception and call centre never are. podium_overrides still applies on top: a name marked hide or left is out, matched
-- on the full name only (the table also carries first-name keys, which would hit an unrelated colleague).
-- The figure: services plus retail ex VAT from Phorest's Staff Daily, the two figures her This month page shows
-- (Total revenue and Retail). It is not the ledger's Net salon take that the leaders' Podium Race ranks on, so the two
-- orders can differ a little. Anyone with nothing in the month is left off and not counted.
create or replace function public.perf_podium_me(p_token uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  m1 date;
  m2 date;
  last_d date := (select max(date) from phorest_staff_daily);
  out jsonb;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;

  m1 := date_trunc('month', coalesce(p_month, last_d, current_date))::date;
  m1 := least(m1, date_trunc('month', coalesce(last_d, current_date))::date);
  m2 := (m1 + interval '1 month' - interval '1 day')::date;

  with fig as (
    select p.id, p.display_name, p.branch,
           (select coalesce(sum(d.services_ex_vat), 0) + coalesce(sum(d.products_ex_vat), 0)
              from phorest_staff_daily d
             where d.employee_name = p.phorest_name and not d.is_total and d.date between m1 and m2) amt
      from perf_staff p
     where p.active and p.dept = s.dept
       and not exists (select 1 from podium_overrides o
                        where o.kind in ('hide', 'left')
                          and o.name_key in (upper(regexp_replace(p.display_name, '[^A-Za-z ]', '', 'g')),
                                             upper(regexp_replace(p.phorest_name, '[^A-Za-z ]', '', 'g'))))
  ), ranked as (
    select f.*, rank() over (order by round(f.amt) desc) rk
      from fig f where f.amt > 0
  )
  select jsonb_build_object(
    'month', m1,
    'to', least(m2, coalesce(last_d, m2)),
    'dept', s.dept,
    'ranked', (select count(*) from ranked),
    'me', (select jsonb_build_object('rank', r.rk, 'amount', round(r.amt)) from ranked r where r.id = s.id),
    'board', (select coalesce(jsonb_agg(jsonb_build_object('rank', r.rk, 'name', r.display_name, 'branch', r.branch,
                                                          'amount', round(r.amt), 'me', r.id = s.id)
                                        order by r.rk, r.display_name), '[]'::jsonb) from ranked r))
    into out;
  return out;
end $$;
revoke all on function public.perf_podium_me(uuid, date) from public;
grant execute on function public.perf_podium_me(uuid, date) to anon, authenticated;
