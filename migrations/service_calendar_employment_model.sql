-- Service Calendar: each stylist's employment model (Kate, 19 Nov 2026: Jumera's list in the Tara Rose_Office chat, "Model 2": Ibrahim Al Mofdi, Alan Joseph Russell,
-- Robyn Hart, Elise Ford, Ashleigh Fairgrieve, Lucia Gonzalez Rodriguez; the rest are Model 1; Model 3 is rent a chair and nobody is on it yet).
-- WRITTEN ONLY, NOT APPLIED. It needs Kate's word first (a new table and a new function).
--
-- It is about pay, so it is NOT in this public repo as data and NOT in the page code: it lives in a table with row level security and no policy, and the only way to
-- read it is service_calendar_models(), which answers Level 4 and up as people see the levels (Executives and Marketing, Accounts and Admin, Kate: the database
-- still counts 3, 4 and 5) and returns null for everyone else. The page draws a Model tag only when that answer comes back.
-- To change a person later: update public.staff_employment_models set model = 3 where staff_name = 'Name as Phorest spells it';

create table if not exists public.staff_employment_models (
  staff_name text primary key,                                   -- the name as Phorest shows it on the calendar
  model      smallint not null default 1 check (model in (1, 2, 3)),   -- 1 employed, 2 as Jumera's list, 3 rent a chair
  note       text,
  updated_at timestamptz not null default now()
);
alter table public.staff_employment_models enable row level security;
revoke all on public.staff_employment_models from anon, authenticated;

insert into public.staff_employment_models (staff_name, model, note) values
  ('Ibrahim Al Mofdi', 2, 'Jumera, Tara Rose_Office chat, 19 Nov 2026'),
  ('Alan Joseph Russell', 2, 'Jumera, Tara Rose_Office chat, 19 Nov 2026'),
  ('Robyn Hart', 2, 'Jumera, Tara Rose_Office chat, 19 Nov 2026'),
  ('Elise Ford', 2, 'Jumera lists her as Elise Hannah Ford; Phorest has Elise Ford'),
  ('Ashleigh Fairgrieve', 2, 'Jumera lists her as Ashleigh Lee Fairgrieve'),
  ('Lucia Gonzalez Rodriguez', 2, 'Jumera lists LUCIA only; she is the only Lucia on the Phorest calendar')
on conflict (staff_name) do update set model = excluded.model, note = excluded.note, updated_at = now();

create or replace function public.service_calendar_models()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  if public.kb_me_email() is null or not public.kb_can_read_for(public.kb_me_email(), 'servicecal') then return null; end if;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then return null; end if;
  return coalesce((select jsonb_object_agg(lower(trim(staff_name)), model) from public.staff_employment_models), '{}'::jsonb);
end
$function$;
revoke all on function public.service_calendar_models() from public, anon;
grant execute on function public.service_calendar_models() to authenticated;
