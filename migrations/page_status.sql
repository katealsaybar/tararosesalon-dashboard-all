-- Hide Pages & Under Construction (Kate, 3 Nov 2026): "give me the ability to hide sections from the site, ako lang ang may access. Also to label under construction."
-- One row per dashboard page that is NOT live. status 'hidden' = nobody but Kate (Level 5) can open it: it leaves the menu, Team Home, search and direct links
-- (pages.js trsPageOpen). status 'construction' = still open to whoever may open it, but it carries an "Under construction" label in the menu and a notice on the page,
-- with an optional note. No row = live. Level 5 changes it from Team Home > Tools > Hide Pages & Under Construction (hub/pagestatus.html).
-- Like Page Access this decides what is DRAWN. The data is still protected by the database's own level checks.
-- Undo one page: set it back to Live on that page (page_status_set with p_status null). Undo all: truncate public.page_status.
create table if not exists public.page_status (
  page_id    text        primary key,
  status     text        not null check (status in ('hidden', 'construction')),
  note       text,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.page_status enable row level security;   -- no policies: read and written through the two functions below only

-- Everyone signed in reads it (the menu, Team Home and search need it; page ids and a status word, nothing sensitive).
create or replace function public.page_status_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(page_id, jsonb_build_object('status', status, 'note', coalesce(note, ''))), '{}'::jsonb)
    from public.page_status
$$;

-- Level 5 only. p_status 'hidden' or 'construction' saves it; null (or 'live') puts the page back to live.
create or replace function public.page_status_set(p_page text, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then raise exception 'Level 5 only'; end if;
  if p_page is null or length(p_page) = 0 or length(p_page) > 60 then raise exception 'No page'; end if;
  if p_status is null or p_status = 'live' then
    delete from public.page_status where page_id = p_page;
  elsif p_status in ('hidden', 'construction') then
    insert into public.page_status (page_id, status, note, updated_by)
    values (p_page, p_status, nullif(left(btrim(coalesce(p_note, '')), 200), ''), (select auth.jwt() ->> 'email'))
    on conflict (page_id) do update set status = excluded.status, note = excluded.note, updated_at = now(), updated_by = excluded.updated_by;
  else
    raise exception 'Status must be live, construction or hidden';
  end if;
end $$;

revoke all on function public.page_status_get(), public.page_status_set(text, text, text) from public, anon;
grant execute on function public.page_status_get(), public.page_status_set(text, text, text) to authenticated;
