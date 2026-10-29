-- staff_phones: one row per staff member, keyed by the same email used in
-- perf_staff / kb_staff / dashboard_users. Level 5 only (kb_level() = 5).
-- Numbers are stored in international format with a leading +, no spaces.
-- 29 Oct 2026. Numbers are loaded by hand, never committed to this repo.

create table if not exists public.staff_phones (
  email      text primary key,
  name       text not null,
  phone      text not null check (phone ~ '^\+[0-9]{8,15}$'),
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_phones enable row level security;

revoke all on public.staff_phones from anon, authenticated;
grant select, insert, update, delete on public.staff_phones to authenticated;

drop policy if exists staff_phones_level5 on public.staff_phones;
create policy staff_phones_level5 on public.staff_phones
  for all to authenticated
  using (public.kb_level() = 5)
  with check (public.kb_level() = 5);
