-- Kate, 22 Oct 2026: the Target calculator and "How a target is made" (/targets/, /targets/how/).
-- Both pages need each stylist's sales, her days and the branch sales history. The repo is public, so none of that
-- is in the page code: it sits in this table and one function hands it to Level 3 (Executives & Marketing) and
-- Level 5 only. The table answers to nobody directly (RLS on, every grant revoked); target_calc_data() is the only door.
-- The data itself is loaded separately (a snapshot, one row per key: people, actuals, series) and is not in this file.
-- Undo: drop function public.target_calc_data(); drop table public.target_calc_snapshot;

create table if not exists public.target_calc_snapshot (
  key       text primary key,
  data      jsonb not null,
  loaded_at timestamptz not null default now()
);
alter table public.target_calc_snapshot enable row level security;
revoke all on public.target_calc_snapshot from public, anon, authenticated;

create or replace function public.target_calc_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  -- kb_level() reads the signed-in person from dashboard_users; level 4 (accounts) and below get nothing.
  if coalesce(public.kb_level(), 0) not in (3, 5) then
    return jsonb_build_object('denied', true);
  end if;
  return coalesce((select jsonb_object_agg(key, data) from public.target_calc_snapshot), '{}'::jsonb)
         || jsonb_build_object('loaded_at', (select max(loaded_at) from public.target_calc_snapshot));
end $$;
revoke all on function public.target_calc_data() from public, anon;
grant execute on function public.target_calc_data() to authenticated;
