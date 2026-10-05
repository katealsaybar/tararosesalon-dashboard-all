-- Kate, 5 Oct 2026: team sync for /hub/marketing. One row per task card from Tara's
-- marketing workspace (the record is her card object as marketing.js builds it), so a
-- change by one person shows for everyone. Whoever can open the Marketing section
-- (kb_sections 'marketing', Level 3 and up) can read, add and change cards; nobody can
-- delete one (the tool has no delete either). Each write stamps who and when.
-- Live updates over Supabase Realtime. Applied to Supabase the same day.

create table if not exists public.kb_marketing_tasks (
  id         text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  record     jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.kb_marketing_tasks enable row level security;
revoke all on public.kb_marketing_tasks from anon;
grant select, insert, update on public.kb_marketing_tasks to authenticated;

drop policy if exists kb_marketing_tasks_read on public.kb_marketing_tasks;
create policy kb_marketing_tasks_read on public.kb_marketing_tasks for select to authenticated
  using ((select public.kb_can_read('marketing')));
drop policy if exists kb_marketing_tasks_add on public.kb_marketing_tasks;
create policy kb_marketing_tasks_add on public.kb_marketing_tasks for insert to authenticated
  with check ((select public.kb_can_read('marketing')));
drop policy if exists kb_marketing_tasks_change on public.kb_marketing_tasks;
create policy kb_marketing_tasks_change on public.kb_marketing_tasks for update to authenticated
  using ((select public.kb_can_read('marketing'))) with check ((select public.kb_can_read('marketing')));

create or replace function public.kb_marketing_tasks_stamp() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(nullif(public.kb_me(), ''), public.kb_me_email());
  return new;
end $$;
drop trigger if exists kb_marketing_tasks_stamp on public.kb_marketing_tasks;
create trigger kb_marketing_tasks_stamp before insert or update on public.kb_marketing_tasks
  for each row execute function public.kb_marketing_tasks_stamp();

alter publication supabase_realtime add table public.kb_marketing_tasks;
