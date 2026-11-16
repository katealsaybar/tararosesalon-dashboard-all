-- Recruitment: Hired with a starting date (Kate, 16 Nov 2026, from ate Jho's steps for the support roles: interview by phone, send to Emma, trade test of 4 to 5 hours on a busy day
-- about twice a week, report to Emma good or not, if good ask for the Offer letter, finalise the starting date).
-- The stages already exist (trade_test, offer, hired), so the page moves people with recruit_set_stage; this adds the one thing it could not hold, the starting date:
--   recruit_applicants.start_date          date, null until they are hired
--   recruit_set_hired(id, start_date)      Kate / Coach Emma and anyone with the Recruitment page (recruit_guard): moves the person to hired and saves the date
--   recruit_get()                          now also returns 'start_date' (patched in place, nothing else in it changes)
-- Undo: drop function recruit_set_hired, drop column start_date, put recruit_get back from recruit_test_row.sql.

alter table public.recruit_applicants add column if not exists start_date date;

create or replace function public.recruit_set_hired(p_id uuid, p_start date) returns void
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard();
begin
  if p_start is null then raise exception 'a starting date is needed'; end if;
  if p_start < current_date - 366 or p_start > current_date + 366 then raise exception 'that starting date looks wrong'; end if;
  update public.recruit_applicants
     set stage = 'hired', start_date = p_start, decided_by = who, decided_at = now(),
         reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, who), updated_at = now()
   where id = p_id;
  if not found then raise exception 'no such applicant'; end if;
end $$;
revoke all on function public.recruit_set_hired(uuid, date) from public, anon;
grant execute on function public.recruit_set_hired(uuid, date) to authenticated;

do $do$
declare d text := pg_get_functiondef('public.recruit_get()'::regprocedure);
begin
  if position('''start_date''' in d) = 0 then
    d := replace(d, '''is_test'', a.is_test', '''start_date'', a.start_date, ''is_test'', a.is_test');
    if position('''start_date''' in d) = 0 then raise exception 'recruit_get has no is_test field to anchor on'; end if;
    execute d;
  end if;
end $do$;
