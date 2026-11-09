-- Rearrange Menu (Kate, 9 Nov 2026): "pagawan ako nung page access to move around sections and sub sections for me only."
-- One row per person who has rearranged THEIR OWN dashboard menu (today only Kate, Level 5). The layout is the whole menu as a tree of page keys:
--   { "v": 1, "groups": [ { "n": "Numbers", "loose": ["pageKey", ...], "subs": [ { "n": "Business", "p": ["pageKey", ...] } ] } ] }
-- It changes where the menu DRAWS things for that person (nav-layout.js). It does not change who may open a page (pages.js, Page Access) and never touches anyone else's menu.
-- No row = the menu as built in index.html. Undo: set the layout back to null on the Rearrange Menu page, or `delete from public.nav_layout where email = '...'`.
create table if not exists public.nav_layout (
  email      text        primary key,
  layout     jsonb       not null,
  updated_at timestamptz not null default now()
);
alter table public.nav_layout enable row level security;   -- no policies: read and written through the two functions below only

-- The signed-in person's own layout, or null. Anyone signed in may ask (it only ever returns their own row).
create or replace function public.nav_layout_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select layout from public.nav_layout where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- Level 5 only, and only for yourself. null puts the menu back to the original.
create or replace function public.nav_layout_set(p_layout jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then raise exception 'Level 5 only'; end if;
  if v_email = '' then raise exception 'Not signed in'; end if;
  if p_layout is null or p_layout = 'null'::jsonb then
    delete from public.nav_layout where email = v_email;
    return;
  end if;
  if jsonb_typeof(p_layout -> 'groups') is distinct from 'array' then raise exception 'That is not a menu layout'; end if;
  if length(p_layout::text) > 60000 then raise exception 'Layout too large'; end if;
  insert into public.nav_layout (email, layout) values (v_email, p_layout)
  on conflict (email) do update set layout = excluded.layout, updated_at = now();
end $$;

revoke all on function public.nav_layout_get(), public.nav_layout_set(jsonb) from public, anon;
grant execute on function public.nav_layout_get(), public.nav_layout_set(jsonb) to authenticated;
