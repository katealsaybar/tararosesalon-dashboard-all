-- Lost Clients branch sheets: a switch to stop adding new clients (Kate, 18 Oct 2026).
-- Every refresh of the four review sheets adds any client who has joined the lists since to the bottom, in green ("New, added 16 Oct").
-- Kate wants a Stop button for that, to press once every message of the October 2026 blast has gone out.
--   lost_sheet_config        one row: add_new (true = the refresh adds new clients, the default), who changed it and when
--   lost_sheet_adding_get()  Level 2 and above: {add_new, by, at}, for the page
--   lost_sheet_adding_set(on) Level 3 and above: turns it on or off and records who
--   lost_sheet_config(pass)  the push-pass gated read the sheet script uses
-- Stopping only stops NEW clients being added. Rows already on the sheets keep their Next appointment, Status and After our message up to date.

create table if not exists public.lost_sheet_config (
  id         int primary key default 1 check (id = 1),
  add_new    boolean not null default true,
  changed_by text,
  changed_at timestamptz
);
insert into public.lost_sheet_config (id) values (1) on conflict (id) do nothing;
alter table public.lost_sheet_config enable row level security;
revoke all on public.lost_sheet_config from anon, authenticated;

create or replace function public.lost_sheet_adding_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  return (select jsonb_build_object('add_new', c.add_new, 'by', c.changed_by, 'at', c.changed_at) from public.lost_sheet_config c where c.id = 1);
end $$;

create or replace function public.lost_sheet_adding_set(p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  select m.name into who from public.dashboard_me() m limit 1;
  update public.lost_sheet_config set add_new = coalesce(p_on, true), changed_by = who, changed_at = now() where id = 1;
  return (select jsonb_build_object('add_new', c.add_new, 'by', c.changed_by, 'at', c.changed_at) from public.lost_sheet_config c where c.id = 1);
end $$;

create or replace function public.lost_sheet_config(p_pass uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  return (select jsonb_build_object('add_new', c.add_new) from public.lost_sheet_config c where c.id = 1);
end $$;

revoke all on function public.lost_sheet_adding_get(), public.lost_sheet_adding_set(boolean) from public, anon;
grant execute on function public.lost_sheet_adding_get(), public.lost_sheet_adding_set(boolean) to authenticated;
revoke all on function public.lost_sheet_config(uuid) from public;
grant execute on function public.lost_sheet_config(uuid) to anon, authenticated;
