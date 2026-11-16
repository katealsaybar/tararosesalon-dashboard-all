-- Recruitment: profile photos from Instagram, automatic (Kate, 16 Nov 2026). Run after recruit_photos.sql. Additive.
--
-- Meta approved the TRS Staff Benchmarks app for Business Discovery (one-call probe 16 Nov 2026 returned a photo; the 10 Nov test had failed with error 10).
-- The edge function recruit-ig-photos asks Meta for the profile picture of an applicant's Instagram handle, copies it into the private bucket
-- recruit-photos (Instagram links expire) and attaches it. Only public Business or Creator accounts return a photo; everyone else keeps initials.
--
-- Rules built in:
--   * A photo somebody added by hand is never replaced (recruit_ig_photo_done only writes while photo_path is null, and the function says so, so the
--     edge function can delete the file it just uploaded).
--   * A person is asked about once. Result 'ok' is final (so Remove photo on the page sticks). 'not_business' (personal or private account), 'no_photo' and
--     'error' are tried again after 7 days; the first two rarely change, so the retry is weekly.
--   * Handles are checked against a strict pattern before they go anywhere near Meta.
--   * Everything here is for the service role only (the edge function); the page cannot call it.
--
--   recruit_applicants.photo_source      null = added by hand (or before this), 'instagram' = fetched by the sync
--   recruit_applicants.photo_checked_at  last time Meta was asked
--   recruit_applicants.photo_result      ok / not_business / no_photo / error
--   recruit_ig_photo_queue(n)            who to ask next: [{id, handle}]
--   recruit_ig_photo_done(id, result, path)  records the answer, attaches the file if the person still has no photo; returns true when attached
--   internal_secrets 'recruit_ig_photos_cron'  header value the cron sends (x-cron-secret), same pattern as complaint-tag-sync
-- Undo: drop the two functions, the three columns and the secret row; delete files named <id>/ig-*.jpg in the bucket.

alter table public.recruit_applicants
  add column if not exists photo_source text,
  add column if not exists photo_checked_at timestamptz,
  add column if not exists photo_result text;

alter table public.recruit_applicants drop constraint if exists recruit_photo_result_ok;
alter table public.recruit_applicants add constraint recruit_photo_result_ok
  check (photo_result is null or photo_result in ('ok', 'not_business', 'no_photo', 'error'));

insert into public.internal_secrets (name, value)
select 'recruit_ig_photos_cron', encode(gen_random_bytes(24), 'hex')
where not exists (select 1 from public.internal_secrets where name = 'recruit_ig_photos_cron');

create or replace function public.recruit_ig_photo_queue(p_n int default 10)
returns table (id uuid, handle text)
language sql stable security definer set search_path = public as $$
  select a.id, lower(regexp_replace(btrim(a.ig_handle), '^@', '')) as handle
  from public.recruit_applicants a
  where a.photo_path is null
    and a.ig_handle is not null
    and lower(regexp_replace(btrim(a.ig_handle), '^@', '')) ~ '^[a-z0-9._]{1,30}$'
    and (a.photo_checked_at is null
         or (a.photo_result in ('not_business', 'no_photo', 'error') and a.photo_checked_at < now() - interval '7 days'))
  order by a.photo_checked_at nulls first, a.applied_at desc
  limit greatest(1, least(coalesce(p_n, 10), 50))
$$;

create or replace function public.recruit_ig_photo_done(p_id uuid, p_result text, p_path text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare attached boolean := false; cur text;
begin
  if p_result not in ('ok', 'not_business', 'no_photo', 'error') then raise exception 'bad result'; end if;
  select photo_path into cur from public.recruit_applicants where id = p_id for update;
  if not found then return false; end if;
  if p_result = 'ok' and p_path is not null and cur is null then
    if p_path not like p_id::text || '/%' then raise exception 'bad photo path'; end if;
    update public.recruit_applicants
       set photo_path = p_path, photo_source = 'instagram', photo_checked_at = now(), photo_result = 'ok', updated_at = now()
     where id = p_id;
    attached := true;
  else
    -- someone added a photo while we were asking, or Meta had none: record the check only, touch nothing else
    update public.recruit_applicants
       set photo_checked_at = now(), photo_result = case when cur is not null and p_result = 'ok' then 'ok' else p_result end
     where id = p_id;
  end if;
  return attached;
end $$;

revoke all on function public.recruit_ig_photo_queue(int) from public, anon, authenticated;
revoke all on function public.recruit_ig_photo_done(uuid, text, text) from public, anon, authenticated;
grant execute on function public.recruit_ig_photo_queue(int) to service_role;
grant execute on function public.recruit_ig_photo_done(uuid, text, text) to service_role;
