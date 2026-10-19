-- Staff Attrition (Kate, 19 Oct 2026): stylists and beauticians only (no assistants, reception or admin).
--
-- One row per person, built from two things the dashboard already holds:
--   phorest_staff_roster  who they are (position, branches, archived in Phorest). Position keeps Stylist, Senior, Junior,
--                         Style Director, Creative Director as Hair and Beautician as Beauty.
--   branch_staff_daily    the ledger: first and last day with sales. The ledger names are first names only, so a roster
--                         row matches its ledger name by branch + department + first name, and a person is dept + first
--                         name (so "Aboudi ." and "Aboudi Chatila" are one person). BUSINESS, ASSISTANTS, BARBER 4,
--                         BEAUTY 8 and STYLIST 14 style rows are not people and are left out.
--
-- Why the leave date is the LAST SALE and not the roster's updated_on: Phorest archives are tidied long after people go
-- (Abby last sold Sep 2021 and was archived Jul 2026), so updated_on says when someone cleaned up, not when she left.
-- Why the start date can be null or "before the ledger": the roster's 28 Apr 2021 added_on is the Phorest import, and the
-- ledger starts Dec 2020 (Hair) and Jan 2021 (Beauty). Anyone already selling then has first_exact = false.
--
-- status:
--   active    still selling (last sale within 60 days of the latest ledger day)
--   left      archived in Phorest, with a last sale on file; leave date = last sale
--   stopped   NOT archived but nothing sold for 60+ days: probably gone or on long leave, Kate confirms
--   closure   the last sale was at Marasy (closed Dec 2022) or Fratelli (closed May 2026) in the closing fortnight, so it is
--             the branch closing, not someone leaving; counted separately
--   nosales   in the roster, no ledger sales to date it (counted, not dated)
--
-- Level 3 and up, and not a Bahrain-scoped sign-in (named leavers across all branches).

create or replace function public.attrition_people()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (
    select public.kb_level() lv,
           (select d.scope from public.dashboard_users d where d.email = public.kb_me_email()) sc
  ),
  asof as (select max(date) d from public.branch_staff_daily),
  ros as (
    select r.branch, r.staff_name, upper(trim(r.staff_name)) un,
           case when r.position_clean in ('Beautician', 'Beautician - DXB') then 'Beauty' else 'Hair' end dept,
           r.position_clean, r.archived, r.added_on,
           upper(split_part(trim(regexp_replace(r.staff_name, '\s+[.x]+$', '', 'i')), ' ', 1)) first
    from public.phorest_staff_roster r
    where r.position_clean in ('Stylist', 'Senior Stylist', 'Junior Stylist', 'Style Director', 'Style Director - DXB',
                               'Creative Director', 'Beautician', 'Beautician - DXB')
      and r.staff_name !~* 'test|ipad|owner|phorest'
  ),
  sales as (
    select branch, dept, upper(trim(staff_name)) ln, min(date) fs, max(date) ls
    from public.branch_staff_daily
    where upper(trim(staff_name)) !~ '^(BUSINESS|ASSISTANTS?|BEAUTY|BARBER|STYLIST)( [0-9]+)?$'
    group by 1, 2, 3
  ),
  m as (
    select r.*, s.fs, s.ls from ros r
    left join sales s on s.branch = r.branch and s.dept = r.dept and (r.un = s.ln or r.un like s.ln || ' %')
  ),
  p as (
    select dept, first,
           (array_agg(staff_name order by length(staff_name) desc, added_on desc))[1] name,
           (array_agg(position_clean order by added_on desc))[1] pos,
           array_agg(distinct branch order by branch) branches,
           bool_and(archived) archived,
           min(added_on) added_on,
           min(fs) first_sale, max(ls) last_sale,
           (array_agg(branch order by ls desc nulls last))[1] last_branch
    from m group by dept, first
  )
  select case when (select lv from me) is null or (select lv from me) < 3 or (select sc from me) is not null then null
  else jsonb_build_object(
    'asof', (select d from asof),
    'ledger_from', (select min(date) from public.branch_staff_daily),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name, 'dept', p.dept, 'position', p.pos, 'branches', p.branches,
        'start', coalesce(p.first_sale, p.added_on),
        'first_exact', (p.first_sale is not null and p.first_sale > date '2021-02-07'),
        'last', p.last_sale, 'last_branch', p.last_branch, 'archived', p.archived,
        'status', case
          when p.last_sale is null then 'nosales'
          when p.last_sale >= (select d from asof) - 60 then 'active'
          when p.last_branch = 'MRY' and p.last_sale >= date '2022-12-24' - 14 then 'closure'
          when p.last_branch = 'FRT' and p.last_sale >= date '2026-05-24' - 14 then 'closure'
          when p.archived then 'left'
          else 'stopped' end)
        order by p.last_sale desc nulls last, p.name)
      from p), '[]'::jsonb))
  end;
$$;

revoke all on function public.attrition_people() from public, anon;
grant execute on function public.attrition_people() to authenticated;
