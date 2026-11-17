-- Kate, 16 Nov 2026: Date created and Date modified on every KB article.
-- Date modified is the existing updated_at: the kb_pages_keep_version trigger moves it only when the title, body or note really changes.
-- Date created needs its own column. Existing pages are backfilled from their first saved version (kb_page_versions version 1 was saved
-- with the page's updated_at at the moment it was first edited, so it is the day the page first existed); a page never edited yet has
-- only its updated_at, which is also the day it was created. The trigger never touches created_at.
--
-- Safe to run twice. Run it BEFORE the front end that asks for created_at is deployed (hub/kb.html falls back to showing only the
-- modified date if the column is missing, so the order is not fatal, but the created date will not show until this has run).

alter table public.kb_pages add column if not exists created_at timestamptz;

update public.kb_pages p
   set created_at = coalesce(
         (select v.saved_at from public.kb_page_versions v where v.slug = p.slug and v.version = 1),
         p.updated_at)
 where p.created_at is null;

alter table public.kb_pages alter column created_at set default now();
alter table public.kb_pages alter column created_at set not null;

-- Check: no page may be "modified" before it was "created".
-- select slug, created_at, updated_at from public.kb_pages where updated_at < created_at;
