-- Knowledge Base hub, phase 1 (Kate, 1 Oct 2026).
-- The hub at a plain trk-salon-os.com, and the SOP pages behind it. All staff can
-- read the staff sections (SOPs, induction); everything else stays with
-- dashboard_users. The page text and photos live in kb_pages, never in this repo:
-- the repo and every file on the site are public, the rows are not.
--
-- Why a separate staff list: dashboard_users' policy (is_dashboard_user) opens every
-- dashboard table, sales, ledgers and payslips, to anyone on it. Staff go on
-- kb_staff, or come from perf_staff, and those only ever pass kb_role(), which
-- no dashboard table checks.

-- Staff who aren't in perf_staff (reception, assistants, office). Hair and Beauty
-- come from perf_staff, so a leaver loses access the day she is marked inactive
-- there. The rows were inserted live; the list stays out of this public file.
create table if not exists public.kb_staff (
  email      text primary key check (email = lower(trim(email))),
  name       text not null,
  category   text,
  active     boolean not null default true,
  note       text,
  added_at   timestamptz not null default now()
);
alter table public.kb_staff enable row level security;
-- No policies: only the security definer functions below read it.

-- The signed-in person's hub role: their dashboard role if they have one, else
-- 'staff' if their confirmed email is an active perf_staff or kb_staff email, else null.
create or replace function public.kb_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(public.dashboard_role(), (
    select 'staff' from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
      and (exists (select 1 from public.perf_staff p
                   where p.active and lower(trim(p.email)) = lower(u.email))
        or exists (select 1 from public.kb_staff k
                   where k.active and k.email = lower(u.email)))))
$$;
revoke all on function public.kb_role() from public, anon;
grant execute on function public.kb_role() to authenticated;

-- The sign-up screen's "is this email on the list" check, now covering staff too.
create or replace function public.kb_email_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.dashboard_email_allowed(p_email)
      or exists (select 1 from public.perf_staff p
                 where p.active and lower(trim(p.email)) = lower(trim(p_email)))
      or exists (select 1 from public.kb_staff k
                 where k.active and k.email = lower(trim(p_email)))
$$;
revoke all on function public.kb_email_allowed(text) from public;
grant execute on function public.kb_email_allowed(text) to anon, authenticated;

-- First name for the hub's greeting.
create or replace function public.kb_me() returns text
language sql stable security definer set search_path = '' as $$
  with e as (select lower(email) em from auth.users where id = auth.uid())
  select coalesce(
    (select d.name from public.dashboard_users d, e where d.email = e.em),
    (select coalesce(p.display_name, p.phorest_name) from public.perf_staff p, e
      where p.active and lower(trim(p.email)) = e.em limit 1),
    (select k.name from public.kb_staff k, e where k.active and k.email = e.em))
$$;
revoke all on function public.kb_me() from public, anon;
grant execute on function public.kb_me() to authenticated;

-- One row per page. audience 'staff' = everyone on the hub; 'manager' = dashboard
-- users only. body_html carries its photos inline (data: URIs), so the photos are
-- exactly as private as the text. body_text is the same page as plain words, for search.
create table if not exists public.kb_pages (
  slug        text primary key check (slug ~ '^[a-z0-9-]+$'),
  section     text not null,
  group_name  text,
  sort        int  not null default 0,
  title       text not null,
  body_html   text not null,
  body_text   text not null default '',
  note        text,
  audience    text not null default 'staff' check (audience in ('staff','manager')),
  owner       text,
  version     int  not null default 1,
  updated_at  timestamptz not null default now()
);
alter table public.kb_pages enable row level security;
drop policy if exists kb_pages_read on public.kb_pages;
create policy kb_pages_read on public.kb_pages for select to authenticated
  using ((select public.kb_role()) is not null
         and (audience = 'staff' or (select public.kb_role()) <> 'staff'));

-- Every earlier version of a page, kept when the page changes (trade tests, disputes).
create table if not exists public.kb_page_versions (
  slug       text not null,
  version    int  not null,
  title      text not null,
  body_html  text not null,
  note       text,
  saved_at   timestamptz not null default now(),
  primary key (slug, version)
);
alter table public.kb_page_versions enable row level security;
drop policy if exists kb_page_versions_read on public.kb_page_versions;
create policy kb_page_versions_read on public.kb_page_versions for select to authenticated
  using ((select public.is_dashboard_user()));

create or replace function public.kb_pages_keep_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.body_html is distinct from old.body_html or new.title is distinct from old.title
     or new.note is distinct from old.note then
    insert into public.kb_page_versions (slug, version, title, body_html, note, saved_at)
    values (old.slug, old.version, old.title, old.body_html, old.note, old.updated_at)
    on conflict do nothing;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists kb_pages_keep_version on public.kb_pages;
create trigger kb_pages_keep_version before update on public.kb_pages
  for each row execute function public.kb_pages_keep_version();

-- Search: runs as the caller, so the kb_pages policy decides what comes back. Every
-- word has to appear; title matches rank first (kb_search_rank_titles, 1 Oct 2026).
create or replace function public.kb_search(q text)
returns table (slug text, section text, group_name text, title text, snippet text)
language sql stable security invoker set search_path = '' as $$
  with t as (select lower(trim(q)) full_q, array_agg(w) ws from regexp_split_to_table(lower(trim(q)), '\s+') w where w <> '')
  select p.slug, p.section, p.group_name, p.title,
    substr(p.body_text, greatest(1, strpos(lower(p.body_text), t.ws[1]) - 60), 180)
  from public.kb_pages p, t
  where length(trim(q)) >= 2
    and (select bool_and(strpos(lower(p.title || ' ' || p.body_text), w) > 0) from unnest(t.ws) w)
  order by
    (strpos(lower(p.title), t.full_q) > 0) desc,                                         -- whole phrase in the title
    (select bool_and(strpos(lower(p.title), w) > 0) from unnest(t.ws) w) desc,           -- every word in the title
    (strpos(lower(p.title), t.ws[1]) > 0) desc,
    (strpos(lower(p.body_text), t.full_q) > 0) desc,                                     -- whole phrase in the text
    p.section, p.sort
  limit 20
$$;
revoke all on function public.kb_search(text) from public, anon;
grant execute on function public.kb_search(text) to authenticated;

-- Loading pages: kb-content/build_beauty_sop.py in the private cowork repo writes
-- pages.json; it went in on 1 Oct 2026 through a one-time loader function that was
-- dropped straight after. Edits since go through SQL (or the phase 2 edit screen);
-- the trigger above keeps every earlier version.

-- ── Staff switch (kb_staff_open_switch, 1 Oct 2026) ─────────────────────────
-- Staff access stays off until Tara has seen the preview. Dashboard users are not
-- affected. To open it to staff:
--   update public.kb_settings set on_off = true, changed_at = now() where key = 'staff_open';
-- kb_role() and kb_email_allowed() above were replaced live by the versions below,
-- which add the switch to the staff branch only.
create table if not exists public.kb_settings (
  key text primary key, on_off boolean not null, note text, changed_at timestamptz not null default now());
alter table public.kb_settings enable row level security;
insert into public.kb_settings (key, on_off, note) values
  ('staff_open', false, 'Staff access to Team Home. Off until Tara has seen the preview (Kate, 1 Oct 2026).')
on conflict (key) do nothing;

create or replace function public.kb_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(public.dashboard_role(), (
    select 'staff' from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
      and coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false)
      and (exists (select 1 from public.perf_staff p
                   where p.active and lower(trim(p.email)) = lower(u.email))
        or exists (select 1 from public.kb_staff k
                   where k.active and k.email = lower(u.email)))))
$$;

create or replace function public.kb_email_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.dashboard_email_allowed(p_email)
      or (coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false)
          and (exists (select 1 from public.perf_staff p
                       where p.active and lower(trim(p.email)) = lower(trim(p_email)))
            or exists (select 1 from public.kb_staff k
                       where k.active and k.email = lower(trim(p_email)))))
$$;
