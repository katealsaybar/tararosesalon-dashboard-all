-- What's new on /search/ (Kate, 18 Oct 2026).
-- A short, plain-language list of what changed on the site, written for staff and
-- managers, read by the search page as the signed-in person. It lives in a table and
-- not in a file because the repo and every file on the site are public: a manager-only
-- note ("the Level 5 view-as switch changed") must not sit in a public file.
--
-- audience 'staff'   = everyone on Team Home and the dashboard.
-- audience 'manager' = dashboard people only. Same rule as kb_pages (create_kb_hub.sql):
--                      kb_role() is null for a stranger, 'staff' for a staff sign-in.
-- Nobody gets an insert, update or delete policy: rows are added in the SQL editor
-- (or with the service role), never from the browser. Idempotent, safe to run twice.

create table if not exists public.site_updates (
  id           bigint generated always as identity primary key,
  published_at timestamptz not null default now(),
  title        text not null check (char_length(title) <= 80),
  body         text not null check (char_length(body) <= 300),
  area         text,
  link         text check (link is null or (link like '/%' and link not like '//%')),
  audience     text not null default 'staff' check (audience in ('staff', 'manager')),
  commit       text
);

create index if not exists site_updates_published_idx on public.site_updates (published_at desc);

alter table public.site_updates enable row level security;
drop policy if exists site_updates_read on public.site_updates;
create policy site_updates_read on public.site_updates for select to authenticated
  using ((select public.kb_role()) is not null
         and (audience = 'staff' or (select public.kb_role()) <> 'staff'));

revoke all on public.site_updates from anon, authenticated;
grant select on public.site_updates to authenticated;

-- Two test queries, to run as a staff sign-in and as a dashboard sign-in
-- (the SQL editor runs as postgres, so use the page itself, or):
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<a staff user uuid>"}', true);
--   select audience, count(*) from public.site_updates group by 1;   -- staff: 'staff' only
--   -- same with a dashboard user's uuid: both audiences.
