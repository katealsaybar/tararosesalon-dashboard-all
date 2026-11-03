-- Every figure on a stylist's own My Numbers link opens the rows behind it (Kate, 30 Oct 2026: "all values are supposed to be clickable").
-- Three read-only functions, each answering ONLY for the person whose token it is, behind the same sign-in lock as perf_dashboard
-- (perf_lock_ok). They return her own rows and nothing about anyone else: no ids, tokens, emails, no client names.
--
--   perf_my_days(p_token, p_from, p_to)      one row per day she has any figure, with the pieces every tile is made of, read from the
--                                            same tables and with the same rules as perf_core, so the rows add up to the figure on the page:
--                                              svc, retail, visits, rqs, pnew   phorest_staff_daily (services and products ex VAT, visits, requests, new clients)
--                                              rb_visits, rb_n                  phorest_staff_rebooking (clients tracked, clients who rebooked)
--                                              clients, req, salon, newc, ncr, lreb, treat   branch_staff_daily (the branch ledger, counted per staff)
--                                              uh, ah                           staff_utilisation (hours booked, hours available, single days only)
--   perf_my_reviews(p_token, p_from, p_to)   the Google reviews that count for her in the window (perf_reviews' own list)
--   perf_my_socials(p_token, p_from, p_to)   her Instagram posts and story mentions in the window (perf_socials' own list)
--
-- A window is at most 2,100 days (All time on the Podium Race is about 1,950). NOT applied live: Kate runs it when she is ready; until it
-- is, the page still draws and each figure's window says the list is not ready yet.

create or replace function public.perf_my_days(p_token uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  out jsonb;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 2100 then return '[]'::jsonb; end if;

  with p as (
    select date d, coalesce(sum(services_ex_vat), 0) svc, coalesce(sum(products_ex_vat), 0) retail, coalesce(sum(visits), 0) visits,
           coalesce(sum(rqs), 0) rqs, coalesce(sum(new_clients), 0) pnew
      from phorest_staff_daily
     where employee_name = s.phorest_name and not is_total and date between p_from and p_to group by date
  ), r as (
    select date d, coalesce(sum(visits), 0) rb_visits, coalesce(sum(rebooked), 0) rb_n
      from phorest_staff_rebooking
     where employee_name = s.phorest_name and date between p_from and p_to group by date
  ), l as (
    select date d, coalesce(sum(total), 0) clients, coalesce(sum(req), 0) req, coalesce(sum(salon), 0) salon,
           coalesce(sum(new_client), 0) newc, coalesce(sum(ncr), 0) ncr, coalesce(sum(rebooked), 0) lreb, coalesce(sum(treatment_aed), 0) treat
      from branch_staff_daily
     where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept and date between p_from and p_to group by date
  ), u as (
    select date_from d, sum(utilisation_hours) uh, sum(available_hours) ah
      from staff_utilisation
     where staff_name = s.phorest_name and not coalesce(is_archived, false) and date_from = date_to and date_from between p_from and p_to group by date_from
  ), days as (
    select d from p union select d from r union select d from l union select d from u
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', x.d, 'svc', round(coalesce(p.svc, 0), 2), 'retail', round(coalesce(p.retail, 0), 2), 'visits', coalesce(p.visits, 0),
           'rqs', coalesce(p.rqs, 0), 'pnew', coalesce(p.pnew, 0),
           'rb_visits', r.rb_visits, 'rb_n', r.rb_n,
           'clients', coalesce(l.clients, 0), 'req', coalesce(l.req, 0), 'salon', coalesce(l.salon, 0), 'newc', coalesce(l.newc, 0),
           'ncr', coalesce(l.ncr, 0), 'lreb', coalesce(l.lreb, 0), 'treat', round(coalesce(l.treat, 0), 2),
           'uh', round(u.uh, 4), 'ah', round(u.ah, 4)) order by x.d), '[]'::jsonb)
    into out
    from days x left join p on p.d = x.d left join r on r.d = x.d left join l on l.d = x.d left join u on u.d = x.d;
  return out;
end $$;

create or replace function public.perf_my_reviews(p_token uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 2100 then return '[]'::jsonb; end if;
  return coalesce(public.perf_reviews(s, p_from, p_to)->'review_list', '[]'::jsonb);
end $$;

create or replace function public.perf_my_socials(p_token uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 2100 then return '[]'::jsonb; end if;
  return coalesce(public.perf_socials(s, p_from, p_to)->'social_list', '[]'::jsonb);
end $$;

revoke all on function public.perf_my_days(uuid, date, date) from public;
revoke all on function public.perf_my_reviews(uuid, date, date) from public;
revoke all on function public.perf_my_socials(uuid, date, date) from public;
grant execute on function public.perf_my_days(uuid, date, date) to anon, authenticated;
grant execute on function public.perf_my_reviews(uuid, date, date) to anon, authenticated;
grant execute on function public.perf_my_socials(uuid, date, date) to anon, authenticated;
