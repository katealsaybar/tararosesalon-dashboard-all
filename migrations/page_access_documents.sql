-- Page Access for documents (Kate, 28 Oct 2026).
-- The Team Home sections (SOPs, induction, front desk, HR forms, ...) are opened by kb_can_read_for() from kb_sections
-- (min_level, skip_levels). A tick box saved on the Page Access page for a document is a row in public.page_access with
-- page_id 'kb:<section key>' and a level 2 to 4; when there is one it wins over kb_sections for that level, otherwise nothing
-- changes. 'dashboards', 'campaigns' and 'uploads' (the dashboard door, the Wellness Voucher approvals and the payslips) are
-- never overridden. Level 1 (staff) keeps its own rule, team by team. Level 5 always opens everything.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kb_can_read_for(text,text)'::regprocedure);
  if d like '%page_access%' then return; end if;
  d := replace(d, E'      when me.lv >= 2 then exists (',
    E'      when me.lv between 2 and 4 and p_section not in (''dashboards'', ''campaigns'', ''uploads'')\n' ||
    E'           and exists (select 1 from public.page_access a where a.page_id = ''kb:'' || p_section and a.level = me.lv)\n' ||
    E'        then (select a.allowed from public.page_access a where a.page_id = ''kb:'' || p_section and a.level = me.lv)\n' ||
    E'      when me.lv >= 2 then exists (');
  if d not like '%page_access%' then raise exception 'patch did not apply'; end if;
  execute d;
end $$;

-- The starting ticks the Page Access page draws for documents (Level 5 only).
create or replace function public.kb_section_defaults()
returns jsonb language plpgsql stable security definer set search_path = 'public' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then raise exception 'Level 5 only'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'dept', s.dept, 'min', s.min_level, 'skip', coalesce(s.skip_levels, '{}'::int[])) order by s.sort)
                     from public.kb_sections s where s.key not in ('dashboards', 'campaigns', 'uploads')), '[]'::jsonb);
end $$;
revoke execute on function public.kb_section_defaults() from public, anon;
grant execute on function public.kb_section_defaults() to authenticated;

-- "View as" (Level 5 previewing another level) draws the same sections the real level would get.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kb_access_as(integer,text)'::regprocedure);
  if d like '%page_access%' then return; end if;
  d := replace(d, E'        when p_level >= 2 then s.min_level <= p_level and not (p_level = any(s.skip_levels))',
    E'        when p_level between 2 and 4 and s.key not in (''dashboards'', ''campaigns'', ''uploads'')\n' ||
    E'             and exists (select 1 from public.page_access a where a.page_id = ''kb:'' || s.key and a.level = p_level)\n' ||
    E'          then (select a.allowed from public.page_access a where a.page_id = ''kb:'' || s.key and a.level = p_level)\n' ||
    E'        when p_level >= 2 then s.min_level <= p_level and not (p_level = any(s.skip_levels))');
  if d not like '%page_access%' then raise exception 'patch did not apply'; end if;
  execute d;
end $$;
