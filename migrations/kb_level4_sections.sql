-- Kate, 22 Oct 2026: Team Home sections for Level 4 (accounts and admin).
-- The dashboard pages stopped being cumulative on 21 Oct (pages.js lv), but Team Home's sections still were: min_level <= level, so Level 4 opened
-- all 18 (Staff Roster & Access, Service Playbooks, Marketing Workspace, every SOP and induction...). Now a section can name the levels that do
-- NOT open it (skip_levels, empty by default = the old min_level rule), and Level 4 skips the twelve it has no use for. Level 4 keeps
-- HR Forms & Waivers (hr-forms), Upload Portal (uploads), ROSES Magazine (magazines, open to every level), the dashboard door
-- (dashboards, campaigns: their pages are limited by pages.js) and todo. Levels 2, 3 and 5 are unchanged.
-- To undo: update public.kb_sections set skip_levels = '{}';
-- kb_can_read_for decides every row-level policy and kb_access(); kb_access_as (Level 5's "View as") mirrors it, so both change together.

alter table public.kb_sections add column if not exists skip_levels int[] not null default '{}';

update public.kb_sections set skip_levels = '{4}'
 where key in ('hair-sop', 'hair-induction', 'beauty-sop', 'beauty-induction',
               'front-desk', 'front-desk-induction', 'call-centre', 'call-centre-induction', 'card-links',
               'access', 'marketing', 'full-loop');

create or replace function public.kb_can_read_for(p_email text, p_section text)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  with me as (select public.kb_level_for(p_email) lv,
                     (select d.scope from public.dashboard_users d where d.email = lower(p_email)) sc,
                     exists (select 1 from public.dashboard_users d where d.email = lower(p_email)) on_list)
  select coalesce((
    select case
      when me.lv = 5 then true
      when me.sc = 'BAH' and p_section = 'campaigns' then false
      when me.lv >= 2 then exists (select 1 from public.kb_sections s where s.key = p_section and s.min_level <= me.lv
                                     and not (me.lv = any(s.skip_levels)))
      when me.lv = 1 then (me.on_list and p_section = 'dashboards')
        or exists (select 1 from public.kb_sections s where s.key = p_section
                     and (s.staff_dept = public.kb_staff_dept_for(p_email)
                          or (s.staff_dept = 'All' and public.kb_staff_dept_for(p_email) is not null)))
    end from me), false)
$function$;

create or replace function public.kb_access_as(p_level integer, p_dept text)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select case when public.kb_level() is distinct from 5 or p_level not between 1 and 5 then null
  else jsonb_build_object(
    'level', p_level,
    'dept', case when p_level = 1 then p_dept end,
    'sections', coalesce((select jsonb_agg(s.key order by s.sort) from public.kb_sections s
      where case
        when p_level = 5 then true
        when p_level >= 2 then s.min_level <= p_level and not (p_level = any(s.skip_levels))
        else (p_dept = 'Front Desk' and s.key = 'dashboards') or s.staff_dept = p_dept or s.staff_dept = 'All'
      end), '[]'::jsonb),
    'my_link', case when p_level = 1 and p_dept in ('Hair', 'Beauty') then
      (select '/me/' || p.slug from public.perf_staff p
        where p.active and p.slug is not null
          and p.display_name = case p_dept when 'Hair' then 'Kate Siryk' else 'Mona Soba' end limit 1) end
  ) end
$function$;
