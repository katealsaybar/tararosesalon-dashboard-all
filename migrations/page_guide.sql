-- First-time guide on every report (Kate, 18 Nov 2026): "once maalam na sila ... it won't appear again ever".
-- One row per person and page once they have pressed "Got it, do not show again". No row = the guide still shows when that page opens.
-- Same shape as nav_layout: keyed by the signed-in email, row level security on with NO policies, read and written only through the three functions below,
-- and only ever for yourself. It changes nothing but whether the guide card appears (js/page-guide.js).
-- Undo: `drop table public.page_guide_seen cascade;` or, for one person, `delete from public.page_guide_seen where email = '...'`.
create table if not exists public.page_guide_seen (
  email        text        not null,
  page         text        not null,
  dismissed_at timestamptz not null default now(),
  primary key (email, page)
);
alter table public.page_guide_seen enable row level security;   -- no policies: through the functions only

-- The pages this person has dismissed.
create or replace function public.page_guide_get() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(page order by page), '{}'::text[]) from public.page_guide_seen where email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- "Got it, do not show again" for one page, for the signed-in person only.
create or replace function public.page_guide_dismiss(p_page text) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then raise exception 'Not signed in'; end if;
  if p_page is null or length(p_page) = 0 or length(p_page) > 60 or p_page !~ '^[A-Za-z0-9_-]+$' then raise exception 'That is not a page'; end if;
  insert into public.page_guide_seen (email, page) values (v_email, p_page) on conflict (email, page) do update set dismissed_at = now();
end $$;

-- "Show the guide for this page again": removes your own row for that page.
create or replace function public.page_guide_reset(p_page text) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then raise exception 'Not signed in'; end if;
  delete from public.page_guide_seen where email = v_email and page = p_page;
end $$;

revoke all on function public.page_guide_get(), public.page_guide_dismiss(text), public.page_guide_reset(text) from public, anon;
grant execute on function public.page_guide_get(), public.page_guide_dismiss(text), public.page_guide_reset(text) to authenticated;
