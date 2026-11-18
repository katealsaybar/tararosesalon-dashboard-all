-- Attach a video (or a picture) to a story by hand (Kate, 18 Nov 2026), for the Content Calendar viewer.
-- story-saver (13 Nov 2026) copies live stories into the private bucket story-media. Stories before 12 Nov were never copied, and Instagram hands over no
-- file for a story with licensed music or shared content. The file can still come from the account's own Stories Archive or data download, so a signed-in
-- Level 3 or higher can attach it to the story it belongs to. The file goes into story-media under manual/, and a story_media row ties it to the story
-- the same way story-saver's rows do (story_key for Instagram, posted_at within 2 minutes for both), so content_calendar_story_stats finds it with no change.
-- The row is saved later than the 'no file' row for that story, and the lookup takes the latest saved_at, so the attached file wins.
-- Run after story_saver.sql and story_media_no_file.sql. Safe to re-run.

-- 1. Who may put a file into the bucket: Level 3 and up, only under manual/. Reading is the existing "story-media read Level 3 and up" policy.
drop policy if exists "story-media manual add Level 3 and up" on storage.objects;
create policy "story-media manual add Level 3 and up" on storage.objects for insert to authenticated
  with check (bucket_id = 'story-media' and name like 'manual/%'
              and coalesce((select m.level from public.dashboard_me() m limit 1), 0) >= 3);

-- 2. Tie the uploaded file to its story. The table has no write policy on purpose (only story-saver writes), so this one function does it, with the same Level 3 check.
create or replace function public.story_media_attach(p_network text, p_posted_at timestamptz, p_story_key text, p_path text, p_is_video boolean, p_bytes bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Attaching a story file is for Level 3 and above';
  end if;
  if p_network not in ('instagram', 'facebook') then raise exception 'Instagram or Facebook only'; end if;
  if p_posted_at is null then raise exception 'The story time is missing'; end if;
  if p_story_key is not null and p_story_key !~ '^[0-9]{5,30}$' then raise exception 'Bad story key'; end if;
  if p_path is null or p_path !~ ('^manual/' || p_network || '/[0-9]{4}/[0-9]{2}/[A-Za-z0-9_-]{8,64}\.(mp4|mov|webm|jpg|png|webp)$') then
    raise exception 'Bad file path';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'story-media' and o.name = p_path) then
    raise exception 'The file is not in storage yet';
  end if;
  insert into public.story_media (media_id, network, posted_at, story_key, permalink, storage_path, is_video, bytes, no_file, reason, saved_at)
  values ('manual:' || p_path, p_network, p_posted_at, p_story_key, null, p_path, coalesce(p_is_video, true), p_bytes, false, 'Attached by hand', now())
  on conflict (media_id) do update set storage_path = excluded.storage_path, is_video = excluded.is_video, bytes = excluded.bytes, saved_at = now();
end $$;

revoke all on function public.story_media_attach(text, timestamptz, text, text, boolean, bigint) from public, anon;
grant execute on function public.story_media_attach(text, timestamptz, text, text, boolean, bigint) to authenticated;
