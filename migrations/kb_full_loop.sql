-- Kate, 5 Oct 2026: The Full Loop Handover on Team Home, Tara's handover site from
-- Perplexity (playbooks, decoder, Menu Builder, Handover Tracker, Marketing).
-- Level 3 and up. Its playbook text carries AED tiers, the average bill and KPIs, so
-- the files that hold content (content.js, data.js, app.js) live in kb_assets, read
-- only by people who can open their section; the repo holds the page shell only.
-- Applied to Supabase the same day.

insert into public.kb_sections (key, dept, min_level, staff_dept, sort)
values ('full-loop', 'The Full Loop', 3, null, 95)
on conflict (key) do update set dept = excluded.dept, min_level = excluded.min_level, sort = excluded.sort;

create table if not exists public.kb_assets (
  key        text primary key,                 -- e.g. 'full-loop/content.js'
  section    text not null references public.kb_sections(key),
  body       text not null,
  updated_at timestamptz not null default now()
);
alter table public.kb_assets enable row level security;
revoke all on public.kb_assets from anon;
grant select on public.kb_assets to authenticated;

drop policy if exists kb_assets_read on public.kb_assets;
create policy kb_assets_read on public.kb_assets for select to authenticated
  using ((select public.kb_can_read(kb_assets.section)));
-- No insert/update/delete policy: content goes in through a one-time loader, as kb_pages.
