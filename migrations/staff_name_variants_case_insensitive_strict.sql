-- Kate, 8 Oct 2026 (Jho: Irlyn's other names were not picked up in Google reviews).
-- Strict spellings (common names, counted only at the person's own branch) matched capitals only, so clients who
-- typed "lyn" or "lynn" in lower case were not counted for Irlyn, and "Leen" was not a spelling at all. `ci` lets a
-- strict spelling match in any case while keeping the own-branch rule. Words that are also plain English (May,
-- Grace, Pearl, Shine...) stay case-sensitive. Applied live; the Google Reviews page (app.js ?v=23) reads the same flag.
alter table staff_name_variants add column if not exists ci boolean not null default false;

update staff_name_variants set ci = true where staff_key = 'IRLYN' and variant in ('Lyn', 'Lynn');

insert into staff_name_variants (staff_key, variant, kind, strict, ci, note)
select 'IRLYN', 'Leen', 'nickname', true, true, 'Jho, 8 Oct 2026: clients write Leen. Strict (own branch only) and any case, like Lyn; the reviewer''s own name still never counts'
where not exists (select 1 from staff_name_variants where staff_key = 'IRLYN' and variant = 'Leen');
insert into staff_name_variants (staff_key, variant, kind, strict, ci, note)
select 'IRLYN', 'Lirlyn', 'typo', false, false, 'Jho, 8 Oct 2026'
where not exists (select 1 from staff_name_variants where staff_key = 'IRLYN' and variant = 'Lirlyn');
insert into staff_name_variants (staff_key, variant, kind, strict, ci, note)
select 'IRLYN', 'Eerlin', 'typo', false, false, 'Jho, 8 Oct 2026'
where not exists (select 1 from staff_name_variants where staff_key = 'IRLYN' and variant = 'Eerlin');

CREATE OR REPLACE FUNCTION public.perf_review_names(keys text[], comment text, reviewer text, home boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from staff_name_variants v
    where v.staff_key = any(keys)
      and case when v.strict then home and (case when v.ci then comment ~* ('\m' || v.variant || '\M') else comment ~ ('\m' || v.variant || '\M') end)
               else comment ~* ('\m' || v.variant || '\M') end
      and (v.not_after is null or comment !~* ('\m' || v.not_after || '\s+' || v.variant || '\M'))
      and coalesce(reviewer, '') !~* ('\m' || v.variant || '\M')
      and not (v.variant in ('April','May') and comment ~ ('((in|on|of|since|last|this|next|early|late|mid|from|until|till|during|by) ' || v.variant || '\M|\m' || v.variant || '\s*[0-9])')))
$function$;

CREATE OR REPLACE FUNCTION public.review_names_anyone(comment text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from staff_name_variants v
                 where case when v.strict and not v.ci then comment ~ ('\m' || v.variant || '\M')
                            else comment ~* ('\m' || v.variant || '\M') end)
$function$;
