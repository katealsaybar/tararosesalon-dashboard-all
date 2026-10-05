-- Suggestions box attachments (Kate, 5 Oct 2026), on top of kb_suggestion_replies.sql.
--
-- Up to 3 files per suggestion: photos and PDFs, in the private bucket
-- kb-suggestion-files. The page shrinks every photo and redraws it as a fresh JPEG
-- before it goes up, which also drops what the phone hid inside it (phone model,
-- location). Sent without a name, only photos are allowed (a PDF can carry its
-- author's name inside), and kb_suggest() clears the file's owner in storage, so
-- an anonymous attachment leads back to nobody either.
--
-- Flow: the page uploads to s/<random uuid>/<n>.jpg|.pdf (signed-in Team Home
-- people only, that shape of name only), then hands the paths to kb_suggest(),
-- which checks each was uploaded by this person and isn't on another suggestion.
-- Level 3 and up open them (signed links); nobody can change or delete them from
-- the site. A file uploaded and never sent stays unlinked and unreadable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kb-suggestion-files', 'kb-suggestion-files', false, 10485760, array['image/jpeg', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.kb_suggestions add column if not exists files text[];

drop policy if exists kb_suggestion_files_insert on storage.objects;
create policy kb_suggestion_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'kb-suggestion-files'
              and name ~ '^s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[1-3]\.(jpg|pdf)$'
              and (select public.kb_level()) is not null);

-- Level 3+ may open a file when it belongs to a suggestion they can see.
create or replace function public.kb_suggestion_file_ok(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.kb_level(), 0) >= 3 and exists (
    select 1 from public.kb_suggestions s
    where p_name = any(s.files)
      and ((select d.scope from public.dashboard_users d where d.email = public.kb_me_email()) is distinct from 'BAH'
           or s.region = 'BAH'))
$$;
revoke all on function public.kb_suggestion_file_ok(text) from public, anon;
grant execute on function public.kb_suggestion_file_ok(text) to authenticated;

drop policy if exists kb_suggestion_files_read on storage.objects;
create policy kb_suggestion_files_read on storage.objects for select to authenticated
  using (bucket_id = 'kb-suggestion-files' and (select public.kb_suggestion_file_ok(name)));

drop function if exists public.kb_suggest(text, text, boolean);
create function public.kb_suggest(p_topic text, p_body text, p_anon boolean, p_files text[] default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare em text := public.kb_me_email(); uid uuid := auth.uid(); bah boolean; new_id bigint; code text;
        abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; fs text[] := coalesce(p_files, '{}');
begin
  if em is null or public.kb_level_for(em) is null then raise exception 'not signed in'; end if;
  if cardinality(fs) > 3 then raise exception 'at most 3 files'; end if;
  if p_anon and exists (select 1 from unnest(fs) f where f like '%.pdf') then raise exception 'photos only without a name'; end if;
  if exists (select 1 from unnest(fs) f
             where not exists (select 1 from storage.objects o
                               where o.bucket_id = 'kb-suggestion-files' and o.name = f and o.owner_id = uid::text)
                or exists (select 1 from public.kb_suggestions s where f = any(s.files))) then
    raise exception 'file not found';
  end if;
  bah := coalesce((select d.scope = 'BAH' from public.dashboard_users d where d.email = em), false)
      or exists (select 1 from public.kb_staff k where k.active and k.email = em and k.note ilike '%bahrain%');
  if p_anon then
    b := extensions.gen_random_bytes(10);
    code := '';
    for i in 0..9 loop code := code || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
    code := substr(code, 1, 5) || '-' || substr(code, 6, 5);
    update storage.objects o set owner = null, owner_id = null
     where o.bucket_id = 'kb-suggestion-files' and o.name = any(fs);
  end if;
  insert into public.kb_suggestions (topic, body, sender_name, sender_email, region, code_hash, files)
  values (coalesce(nullif(p_topic, ''), 'Other'), trim(p_body),
          case when p_anon then null else public.kb_me() end,
          case when p_anon then null else em end,
          case when bah then 'BAH' end,
          case when p_anon then public.kb_suggestion_code_hash(code) end,
          nullif(fs, '{}'))
  returning id into new_id;
  return jsonb_build_object('id', new_id, 'code', code);
end $$;
revoke all on function public.kb_suggest(text, text, boolean, text[]) from public, anon;
grant execute on function public.kb_suggest(text, text, boolean, text[]) to authenticated;

-- The inbox carries the file paths; the page asks storage for signed links.
create or replace function public.kb_suggestions()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (
    select public.kb_level() lv,
           (select d.scope from public.dashboard_users d where d.email = public.kb_me_email()) sc
  )
  select case when (select lv from me) is null or (select lv from me) < 3 then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'created_at', s.created_at, 'topic', s.topic, 'body', s.body,
             'sender_name', s.sender_name, 'region', s.region, 'has_code', s.code_hash is not null,
             'status', s.status, 'status_by', s.status_by, 'status_at', s.status_at,
             'reply', s.reply, 'reply_by', s.reply_by, 'reply_at', s.reply_at,
             'files', coalesce(to_jsonb(s.files), '[]'::jsonb))
           order by s.created_at desc)
    from public.kb_suggestions s
    where (select sc from me) is distinct from 'BAH' or s.region = 'BAH'
  ), '[]'::jsonb) end
$$;
