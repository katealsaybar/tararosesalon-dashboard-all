-- David Nagtzaam is the Tech and Automations Head, no longer Paid Media with Leaders in Digital Media (Kate, 16 Nov 2026).
-- Staff Roster & Access reads the title from kb_positions. Applied in Supabase already. His cutout is assets/org-chart/david-nagtzaam.png.
update public.kb_positions set position = 'Tech and Automations Head', updated_at = now()
where email = (select email from public.dashboard_users where name = 'David Nagtzaam');
