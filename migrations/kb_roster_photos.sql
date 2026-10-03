-- Staff Roster & Access, round 4 (Kate, 3 Oct 2026): profile photos. Applied in
-- Supabase already. kb_positions.photo holds a site path: the org chart headshot
-- (assets/org-chart/) for the office team and anyone on the org chart, else the
-- staff card photo (assets/staff/, as listed in staff-profiles.js). 64 of 86 people
-- have one; the page shows initials for the rest. kb_roster() returns it as 'photo'
-- (same function as kb_roster_names.sql plus that one field).
-- The rows were written by matching names to those two folders; no emails here,
-- the repo is public.

alter table public.kb_positions add column if not exists photo text;
