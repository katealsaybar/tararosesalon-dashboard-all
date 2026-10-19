-- Google Reviews: match staff to a review from the page itself (Kate, 19 Oct 2026).
-- Until now a hand tag (google_reviews.staff_manual) or an "is not hers" (staff_not) was written through the
-- Supabase MCP, one review at a time. The Google Reviews page can now do it, for the owner login only (Level 5,
-- not a branch-scoped login). Two functions, both security definer so the anon key still cannot write:
--   google_review_can_edit()      true for Level 5, so the page knows whether to show the Match staff button
--   google_review_set_staff(...)  replaces staff_manual and staff_not on one review; an empty list stores null,
--                                 which is what an untouched review holds. Returns the saved lists.
-- Already run live (apply_migration google_review_staff_edit); this file is the end state.

create or replace function public.google_review_can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select m.level >= 5 and m.scope is null from public.dashboard_me() m limit 1), false)
$$;

create or replace function public.google_review_set_staff(p_review_id text, p_manual text[], p_not text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k text; man text[] := '{}'; nt text[] := '{}'; out_man text[]; out_not text[];
begin
  if not public.google_review_can_edit() then raise exception 'Level 5 only'; end if;
  if p_review_id is null or length(p_review_id) = 0 then raise exception 'No review'; end if;
  -- staff keys are capital letters, digits, spaces and a little punctuation (JANE, MARY JOY, CHARLENE_PAYNE)
  foreach k in array coalesce(p_manual, '{}') loop
    if k !~ '^[A-Z0-9][A-Z0-9 _./''-]{0,39}$' then raise exception 'Bad staff key: %', left(k, 40); end if;
    if not (k = any(man)) then man := man || k; end if;
  end loop;
  foreach k in array coalesce(p_not, '{}') loop
    if k !~ '^[A-Z0-9][A-Z0-9 _./''-]{0,39}$' then raise exception 'Bad staff key: %', left(k, 40); end if;
    if not (k = any(nt)) then nt := nt || k; end if;
  end loop;
  if cardinality(man) > 8 or cardinality(nt) > 8 then raise exception 'Too many staff on one review'; end if;
  update public.google_reviews
     set staff_manual = case when cardinality(man) = 0 then null else man end,
         staff_not    = case when cardinality(nt)  = 0 then null else nt  end,
         updated_at   = now()
   where review_id = p_review_id
   returning staff_manual, staff_not into out_man, out_not;
  if not found then raise exception 'Review not found'; end if;
  return jsonb_build_object('manual', coalesce(to_jsonb(out_man), '[]'::jsonb), 'not', coalesce(to_jsonb(out_not), '[]'::jsonb));
end $$;

revoke all on function public.google_review_can_edit() from public, anon;
revoke all on function public.google_review_set_staff(text, text[], text[]) from public, anon;
grant execute on function public.google_review_can_edit() to authenticated;
grant execute on function public.google_review_set_staff(text, text[], text[]) to authenticated;
