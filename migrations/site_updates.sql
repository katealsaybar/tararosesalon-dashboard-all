-- What's new on /search/ (Kate, 18 Oct 2026; per level the same day).
-- A short, plain-language list of what changed on the site, written for staff and
-- managers, read by the search page as the signed-in person. It lives in a table and
-- not in a file because the repo and every file on the site are public: a note for
-- leadership ("the Level 5 view-as switch changed") must not sit in a public file.
--
-- min_level is the lowest Team Home level that sees the entry (kb_level(), see
-- kb_access_levels.sql): 1 staff, 2 leadership, 3 executives and marketing, 4 accounts
-- and admin, 5 owner. A Level 1 entry is for everyone; a dashboard page's entry takes
-- that page's own level from pages.js (Level 2 for most, 3 for Wellness Voucher Blast).
-- The database refuses a row to anyone below it; the page only draws what comes back
-- (and, in Level 5's "View as", hides what the level being previewed would not see).
-- Nobody gets an insert, update or delete policy: rows are added in the SQL editor
-- (or with the service role), never from the browser. Idempotent, safe to run twice.

create table if not exists public.site_updates (
  id           bigint generated always as identity primary key,
  published_at timestamptz not null default now(),
  title        text not null check (char_length(title) <= 80),
  body         text not null check (char_length(body) <= 300),
  area         text,
  link         text check (link is null or (link like '/%' and link not like '//%')),
  min_level    int  not null default 1 check (min_level between 1 and 5),
  commit       text
);

-- The first version of this table had audience 'staff' | 'manager'; the same rows, as levels.
alter table public.site_updates add column if not exists min_level int not null default 1;
alter table public.site_updates drop constraint if exists site_updates_min_level_check;
alter table public.site_updates add constraint site_updates_min_level_check check (min_level between 1 and 5);
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'site_updates' and column_name = 'audience') then
    update public.site_updates set min_level = case when audience = 'manager' then 2 else 1 end;
  end if;
end $$;

drop policy if exists site_updates_read on public.site_updates;
alter table public.site_updates drop column if exists audience;

create index if not exists site_updates_published_idx on public.site_updates (published_at desc);

alter table public.site_updates enable row level security;
create policy site_updates_read on public.site_updates for select to authenticated
  using ((select public.kb_level()) is not null and (select public.kb_level()) >= min_level);

revoke all on public.site_updates from anon, authenticated;
grant select on public.site_updates to authenticated;
