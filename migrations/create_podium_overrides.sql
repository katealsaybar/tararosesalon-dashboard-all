-- Podium Race people overrides (Kate, 8 Oct 2026). The ledger and Phorest carry names
-- that are not stylists on the floor (receptionists, assistants, a login called
-- "Reception"), and leavers and Bahrain staff who have no staff card. This table says
-- what to do with each, so Kate can change it without a deploy. Read through the
-- podium_overrides RPC by team-performance.js. Already run live (as create_podium_excluded
-- then podium_overrides_kinds; this file is the end state).
--
-- name_key: the ledger or Phorest name in capital letters and spaces only (tpMergeKey with
-- punctuation stripped), so 'FARWA' and 'FARWA .' are one key. Give a person a first-name
-- row and a full-name row.
-- kind:  hide  = not in the race at all
--        left  = in the race, greyed out, with the role below (archived in Phorest)
--        role  = in the race as normal, with the role below (no staff card)
-- To mark someone off:  insert into podium_overrides (name_key, display_name, role, note, kind) values ('JANE', 'Jane Doe', 'Receptionist', '...', 'hide');
-- To put someone back:  delete from podium_overrides where name_key in ('JANE', 'JANE DOE');
create table if not exists public.podium_overrides (
  name_key     text primary key check (name_key = upper(name_key) and name_key ~ '^[A-Z ]+$'),
  display_name text,
  role         text not null,          -- Assistant, Receptionist, Salon Coordinator, Stylist, Style Director ...
  note         text,
  kind         text not null default 'hide' check (kind in ('hide','left','role')),
  created_at   timestamptz not null default now()
);
alter table public.podium_overrides enable row level security;   -- no policies: read through the RPC only

-- Same key check as perf_weeks and league_counts: leader or viewer.
create or replace function public.podium_overrides(p_admin uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('key', name_key, 'role', role, 'kind', kind) order by name_key), '[]'::jsonb) from podium_overrides);
end $$;
grant execute on function public.podium_overrides(uuid) to anon, authenticated;

insert into public.podium_overrides (name_key, display_name, role, note, kind) values
 ('FARWA',           'Farwa',           'Assistant',         'Bahrain assistant', 'hide'),
 ('SHIELA',          'Shiela Avena',    'Salon Coordinator', 'Org chart: salon coordinator', 'hide'),
 ('SHIELA AVENA',    'Shiela Avena',    'Salon Coordinator', 'Org chart: salon coordinator', 'hide'),
 ('KAISHA',          'Kaisha Balbuena', 'Receptionist',      'One Phorest booking, Motor City, 6 Nov 2025', 'hide'),
 ('KAISHA BALBUENA', 'Kaisha Balbuena', 'Receptionist',      'One Phorest booking, Motor City, 6 Nov 2025', 'hide'),
 ('JANICE',          'Janice Gamit',    'Assistant',         'Assistant, archived in Phorest (Kate confirmed 8 Oct 2026). Al Quoz then Motor City, Jan to Jul 2025', 'hide'),
 ('JANICE GAMIT',    'Janice Gamit',    'Assistant',         'Assistant, archived in Phorest (Kate confirmed 8 Oct 2026). Al Quoz then Motor City, Jan to Jul 2025', 'hide'),
 ('JESSA',           'Jessa Padilla',   'Receptionist',      'Khalifa City A', 'hide'),
 ('JESSA PADILLA',   'Jessa Padilla',   'Receptionist',      'Khalifa City A', 'hide'),
 ('EDEN',            'Eden Domasin',    'Assistant',         'Al Quoz', 'hide'),
 ('EDEN DOMASIN',    'Eden Domasin',    'Assistant',         'Al Quoz', 'hide'),
 ('LIBERTY',         'Liberty Caparas', 'Assistant',         'Saadiyat', 'hide'),
 ('LIBERTY CAPARAS', 'Liberty Caparas', 'Assistant',         'Saadiyat', 'hide'),
 ('RECEPTION',       'Reception',       'Receptionist',      'The Saadiyat front-desk login, not a person', 'hide'),
 ('NIMI',            'Nimi Firth',      'Style Director',    'Left. Style Director at Al Quoz, archived in Phorest', 'left'),
 ('NIMI FIRTH',      'Nimi Firth',      'Style Director',    'Left. Style Director at Al Quoz, archived in Phorest', 'left'),
 ('HARRIET',         'Harriet Shannon', 'Stylist',           'Left. Stylist, archived in Phorest', 'left'),
 ('HARRIET SHANNON', 'Harriet Shannon', 'Stylist',           'Left. Stylist, archived in Phorest', 'left'),
 ('CORI',            'Cori Paul',       'Stylist',           'Left. Stylist, archived in Phorest. One booking, Al Quoz, 4 Feb 2025', 'left'),
 ('CORI PAUL',       'Cori Paul',       'Stylist',           'Left. Stylist, archived in Phorest. One booking, Al Quoz, 4 Feb 2025', 'left'),
 ('MARCELLA',         'Marcella Savicic','Stylist',           'Left. Stylist, archived in Phorest. Motor City and Al Quoz, to Dec 2025', 'left'),
 ('MARCELLA SAVICIC', 'Marcella Savicic','Stylist',           'Left. Stylist, archived in Phorest. Motor City and Al Quoz, to Dec 2025', 'left'),
 ('KERRYN',          'Kerryn',          'Stylist',           'Bahrain stylist, no staff card', 'role')
on conflict (name_key) do nothing;
