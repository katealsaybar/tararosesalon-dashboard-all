-- Story saver, stories with no file (Kate, 13 Nov 2026). Instagram withholds media_url for a story that carries copyrighted music (the Graph API shows it in copyright_check_information),
-- even for a business account, and it serves a story for 24 hours only, so an expired story cannot be fetched again. story-saver now records such a story once (no_file = true, no path),
-- so the calendar viewer can say why it is a picture. content_calendar_story_stats returns no_file; the dashboard bridge passes it through. Applied live 13 Nov 2026.
-- Backfilled the six stories of 12 Nov 13:13 to 13:37 Dubai that came without a file.
alter table public.story_media alter column storage_path drop not null;
alter table public.story_media add column if not exists no_file boolean not null default false;
alter table public.story_media add column if not exists reason text;
-- content_calendar_story_stats: same as migrations/story_saver.sql plus 'no_file', coalesce(m.no_file, false) and sm.no_file in the lateral select (see the live definition).
