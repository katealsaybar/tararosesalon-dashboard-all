-- Team Home: ROSES Magazine opens to all staff (Kate, 14 Oct 2026). Level 1 staff only ever got
-- the one section whose staff_dept matched their own team (Hair, Beauty, Front Desk, Call Centre).
-- staff_dept = 'All' is now a marker meaning every signed-in member of staff (anyone
-- kb_staff_dept_for() recognises), whatever the team. Only 'magazines' uses it so far.
-- Nothing else opens: hr-forms, full-loop and the other teams' SOPs are unchanged (checked for a
-- Hair, Beauty, Receptionist and Assistant account, and an unknown email). Already applied to Supabase.
-- Level 2 and up are unchanged (min_level 2). kb_access_as ("View as") mirrors the same rule.
-- kb_files_read still needs Level 2 for every section except magazines; the bucket read policy
-- now follows kb_can_read('magazines') alone.

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
      when me.lv >= 2 then exists (select 1 from public.kb_sections s where s.key = p_section and s.min_level <= me.lv)
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
        when p_level >= 2 then s.min_level <= p_level
        else (p_dept = 'Front Desk' and s.key = 'dashboards') or s.staff_dept = p_dept or s.staff_dept = 'All'
      end), '[]'::jsonb),
    'my_link', case when p_level = 1 and p_dept in ('Hair', 'Beauty') then
      (select '/me/' || p.slug from public.perf_staff p
        where p.active and p.slug is not null
          and p.display_name = case p_dept when 'Hair' then 'Kate Siryk' else 'Mona Soba' end limit 1) end
  ) end
$function$;

update public.kb_sections set staff_dept = 'All' where key = 'magazines';

drop policy if exists kb_files_read on public.kb_files;
create policy kb_files_read on public.kb_files for select
  using ((select public.kb_can_read(section))
         and ((select public.kb_level()) >= 2 or section = 'magazines'));

drop policy if exists kb_magazines_read on storage.objects;
create policy kb_magazines_read on storage.objects for select to authenticated
  using (bucket_id = 'kb-magazines' and (select public.kb_can_read('magazines')));
