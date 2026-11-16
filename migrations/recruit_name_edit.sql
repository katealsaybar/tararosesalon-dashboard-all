-- Recruitment: edit a name by hand (Kate, 16 Nov 2026: "allow me to be able to edit name"; Shawn Ariky wrote as Kehinde Adebiyi, some rows say Name not stated). Additive.
--   recruit_applicants.name_locked   true once a name was typed by hand
--   recruit_set_name(id, name)       same lock as the rest of the page (recruit_guard: Kate / Coach Emma); sets name and locks it; an empty name unlocks and clears it
--   trigger recruit_keep_name        recruit_import (every 5 minutes) rewrites name on a merge; while name_locked it keeps the typed one. Only recruit_set_name can change it.
-- Applied live as the migration recruit_name_edit on 16 Nov 2026.
-- Undo: drop trigger recruit_keep_name_t on public.recruit_applicants; drop function recruit_keep_name(); drop function recruit_set_name(uuid, text); alter table public.recruit_applicants drop column name_locked;
alter table public.recruit_applicants add column if not exists name_locked boolean not null default false;

create or replace function public.recruit_keep_name() returns trigger language plpgsql as $f$
begin
  if old.name_locked and coalesce(current_setting('recruit.name_edit', true), '') <> '1' then
    new.name := old.name; new.name_locked := true;
  end if;
  return new;
end $f$;

drop trigger if exists recruit_keep_name_t on public.recruit_applicants;
create trigger recruit_keep_name_t before update on public.recruit_applicants for each row execute function public.recruit_keep_name();

create or replace function public.recruit_set_name(p_id uuid, p_name text) returns jsonb
 language plpgsql security definer set search_path to 'public' as $f$
declare who text := public.recruit_guard(); v text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if p_id is null then raise exception 'bad request'; end if;
  if v is not null and char_length(v) > 120 then raise exception 'name too long'; end if;
  perform set_config('recruit.name_edit', '1', true);
  update public.recruit_applicants set name = v, name_locked = (v is not null), updated_at = now() where id = p_id;
  if not found then raise exception 'that person is no longer there'; end if;
  return jsonb_build_object('ok', true, 'name', v);
end $f$;
revoke all on function public.recruit_set_name(uuid, text) from public, anon;
grant execute on function public.recruit_set_name(uuid, text) to authenticated;
