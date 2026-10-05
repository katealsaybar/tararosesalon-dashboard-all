-- Team Home files (Kate, 5 Oct 2026): printable PDFs per section, first used by
-- HR Forms & Waivers (/hub/forms). The PDF itself sits in the row (bytea, ~100-190 KB
-- each), so it carries the section's own access rule: Level 2 and up who may open the
-- section; no staff, no signed-out reads. Nothing of the files is in this repo (public).
-- Already applied to Supabase. The PDFs went in through a one-time loader RPC
-- (random name, granted to anon, dropped right after), as with kb_pages.
-- Source and builder: Downloads/hr-forms-src/build_forms.py on Kate's machine.

create table if not exists public.kb_files (
  code       text primary key,
  section    text not null references public.kb_sections(key),
  grp        text not null,          -- the panel it sits in on the page
  title      text not null,
  subtitle   text,
  blurb      text,
  filename   text not null,          -- the name it downloads as
  pages      int,
  bytes      int,
  sort       int not null default 0,
  pdf        bytea,
  updated_at timestamptz not null default now()
);
alter table public.kb_files enable row level security;
drop policy if exists kb_files_read on public.kb_files;
create policy kb_files_read on public.kb_files for select
  using ((select public.kb_can_read(section)) and (select public.kb_level()) >= 2);
grant select on public.kb_files to authenticated;
revoke all on public.kb_files from anon;
