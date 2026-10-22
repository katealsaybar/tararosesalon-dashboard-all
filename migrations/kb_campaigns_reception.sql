-- Kate, 22 Oct 2026: Campaigns on Team Home is for Level 1 Front Desk and Call Centre only, not Hair or Beauty.
-- staff_dept holds one value, so 'Reception' is a marker meaning both Front Desk and Call Centre. kb_can_read_for and kb_access_as
-- (Level 5's "View as") read it together; Levels 2 to 5 are unchanged.
-- To undo (open to every department again): update public.kb_sections set staff_dept = 'All' where key = 'campaigns';

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
                          or (s.staff_dept = 'All' and public.kb_staff_dept_for(p_email) is not null)
                          or (s.staff_dept = 'Reception' and public.kb_staff_dept_for(p_email) in ('Front Desk', 'Call Centre'))))
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
             or (s.staff_dept = 'Reception' and p_dept in ('Front Desk', 'Call Centre'))
      end), '[]'::jsonb),
    'my_link', case when p_level = 1 and p_dept in ('Hair', 'Beauty') then
      (select '/me/' || p.slug from public.perf_staff p
        where p.active and p.slug is not null
          and p.display_name = case p_dept when 'Hair' then 'Kate Siryk' else 'Mona Soba' end limit 1) end
  ) end
$function$;

update public.kb_sections set staff_dept = 'Reception' where key = 'campaigns';
