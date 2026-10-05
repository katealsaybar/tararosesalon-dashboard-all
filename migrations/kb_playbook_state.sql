-- Kate, 5 Oct 2026: team sync for Service Playbooks' Menu Builder and Handover Tracker
-- (/hub/full-loop). One row per piece of Tara's handover state, so two people working
-- on different lines never overwrite each other:
--   grades          the stylist grade names            plans        the 12-week plans
--   menu:order      the menu lines in order             menu:<id>    one menu line
--   task:order      the tracker tasks in order          task:<id>    one task
-- A removed line keeps its row with deleted = true, so everyone else drops it too.
-- Whoever can open the section (kb_sections 'full-loop', Level 3 and up) can read,
-- add and change rows; nobody deletes one. Each write stamps who and when. Live
-- updates over Supabase Realtime. Applied to Supabase the same day.

create table if not exists public.kb_playbook_state (
  key        text primary key check (key ~ '^[A-Za-z0-9:_-]{1,90}$'),
  value      jsonb not null,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.kb_playbook_state enable row level security;
revoke all on public.kb_playbook_state from anon;
grant select, insert, update on public.kb_playbook_state to authenticated;

drop policy if exists kb_playbook_state_read on public.kb_playbook_state;
create policy kb_playbook_state_read on public.kb_playbook_state for select to authenticated
  using ((select public.kb_can_read('full-loop')));
drop policy if exists kb_playbook_state_add on public.kb_playbook_state;
create policy kb_playbook_state_add on public.kb_playbook_state for insert to authenticated
  with check ((select public.kb_can_read('full-loop')));
drop policy if exists kb_playbook_state_change on public.kb_playbook_state;
create policy kb_playbook_state_change on public.kb_playbook_state for update to authenticated
  using ((select public.kb_can_read('full-loop'))) with check ((select public.kb_can_read('full-loop')));

drop trigger if exists kb_playbook_state_stamp on public.kb_playbook_state;
create trigger kb_playbook_state_stamp before insert or update on public.kb_playbook_state
  for each row execute function public.kb_marketing_tasks_stamp();

alter publication supabase_realtime add table public.kb_playbook_state;
