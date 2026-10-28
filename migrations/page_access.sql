-- Page Access (Kate, 28 Oct 2026): "bigyan mo na lang ako ng backend dashboard on the reports that they should have access to, tick box na lang".
-- pages.js still holds the defaults (lv per page: those are the boxes checked from the start). This table holds only what Kate changed on the Page Access
-- page (Team Home, Level 5): one row per page and level, allowed true (ticked) or false (unticked). No row = the default from pages.js. Levels 1 to 4 only;
-- Level 5 always opens everything. A person's own extra_pages still open their pages whatever is ticked here.
-- This decides what is DRAWN (sidebar, Team Home, search, direct links). The data is still protected by the database's own level checks, so a page ticked for a
-- level whose functions ask for Level 3 will open and then say "Level 3 and above" until that function is opened too.
-- Undo a single change: the Reset button on the page (page_access_set with p_allowed null). Undo all: truncate public.page_access.
create table if not exists public.page_access (
  page_id    text        not null,
  level      int         not null check (level between 1 and 4),
  allowed    boolean     not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (page_id, level)
);
alter table public.page_access enable row level security;   -- no policies: read and written through the two functions below only

-- Everyone signed in can read it (the sidebar, Team Home and search need it for Level 1 to 4 and none of it is sensitive: page ids and ticks).
create or replace function public.page_access_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(t.page_id, t.lv), '{}'::jsonb)
    from (select page_id, jsonb_object_agg(level::text, allowed) as lv from public.page_access group by page_id) t
$$;

-- Level 5 only. p_allowed true or false saves the tick; null removes the saved change, so the page goes back to its pages.js default.
create or replace function public.page_access_set(p_page text, p_level int, p_allowed boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then raise exception 'Level 5 only'; end if;
  if p_level is null or p_level < 1 or p_level > 4 then raise exception 'Level 1 to 4 only'; end if;
  if p_page is null or length(p_page) = 0 or length(p_page) > 60 then raise exception 'No page'; end if;
  if p_allowed is null then
    delete from public.page_access where page_id = p_page and level = p_level;
  else
    insert into public.page_access (page_id, level, allowed, updated_by) values (p_page, p_level, p_allowed, (select auth.jwt() ->> 'email'))
    on conflict (page_id, level) do update set allowed = excluded.allowed, updated_at = now(), updated_by = excluded.updated_by;
  end if;
end $$;

revoke all on function public.page_access_get(), public.page_access_set(text, int, boolean) from public, anon;
grant execute on function public.page_access_get(), public.page_access_set(text, int, boolean) to authenticated;
