-- "View as" for the owner (Kate, 2 Oct 2026). Applied live on 2 Oct 2026.
--
-- Kate (Level 5) previews Team Home and the dashboard sidebar as any other level.
-- This answers "which sections would that level open", by level and staff
-- department instead of by email, and only for Level 5; anyone else gets null.
-- It is a preview of what is drawn: Kate's own access is unchanged, so she can
-- still open everything by address.
--
-- Same rule as kb_can_read_for(); change the two together. Level 1 'Front Desk'
-- stands for reception, who are on dashboard_users and so also open Dashboards.
-- Level 1 'Hair' also hands back Kate Siryk's own My numbers address (Kate's pick,
-- 2 Oct 2026, applied live as kb_view_as_sample_stylist), so the preview has a real
-- stylist card to open. Looked up here so the address never sits in this public repo.

create or replace function public.kb_access_as(p_level int, p_dept text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.kb_level() is distinct from 5 or p_level not between 1 and 5 then null
  else jsonb_build_object(
    'level', p_level,
    'dept', case when p_level = 1 then p_dept end,
    'sections', coalesce((select jsonb_agg(s.key order by s.sort) from public.kb_sections s
      where case
        when p_level = 5 then true
        when p_level >= 2 then s.min_level <= p_level
        else (p_dept = 'Front Desk' and s.key = 'dashboards') or s.staff_dept = p_dept
      end), '[]'::jsonb),
    'my_link', case when p_level = 1 and p_dept = 'Hair' then
      (select '/me/' || p.slug from public.perf_staff p
        where p.active and p.slug is not null and p.display_name = 'Kate Siryk' limit 1) end
  ) end
$$;
revoke all on function public.kb_access_as(int, text) from public, anon;
grant execute on function public.kb_access_as(int, text) to authenticated;
