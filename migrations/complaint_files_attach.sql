-- Complaint record: attach a photo or file from the note box (Kate, 30 Oct 2026). Run after complaint_files_view.sql. Additive.
--
-- Until now only dashboard users at level 2 and up could upload to a complaint (cq_files_add and client_complaint_add_file). The record page lets anyone who may
-- see the client write a note, so the same people may attach files to it: leadership, the branch coordinator, the person who logged it and the person who took it
-- (cmp_reveal). Same rules as the dashboard otherwise: 10 files a complaint, 10 MB each, photos, PDF or text (the bucket enforces size and type).
--   cmp_upload_ok(path)   true when the path starts with the id of a complaint the caller may see the client of
--   cmp_files_add         storage insert policy, beside cq_files_add
--   cmp_add_file(...)     registers an uploaded file on the complaint

create or replace function public.cmp_upload_ok(p_path text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare seg text := split_part(coalesce(p_path, ''), '/', 1);
begin
  if seg !~ '^[0-9]{1,12}$' then return false; end if;
  return exists (select 1 from public.client_complaints c where c.id = seg::bigint and c.submitted_at is not null) and public.cmp_reveal(seg::bigint);
end $$;
revoke all on function public.cmp_upload_ok(text) from public, anon;
grant execute on function public.cmp_upload_ok(text) to authenticated;

drop policy if exists cmp_files_add on storage.objects;
create policy cmp_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-files' and public.cmp_upload_ok(name));

create or replace function public.cmp_add_file(p_id bigint, p_path text, p_name text, p_size bigint, p_mime text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nid bigint;
begin
  if not public.cmp_can(p_id) or not public.cmp_reveal(p_id) then return jsonb_build_object('ok', false, 'why', 'not open to you'); end if;
  if p_path is null or p_path not like p_id::text || '/%' then return jsonb_build_object('ok', false, 'why', 'bad file path'); end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'complaint-files' and o.name = p_path) then return jsonb_build_object('ok', false, 'why', 'the file did not upload'); end if;
  if (select count(*) from public.client_complaint_files where complaint_id = p_id) >= 10 then return jsonb_build_object('ok', false, 'why', 'a complaint can hold 10 files'); end if;
  insert into public.client_complaint_files (complaint_id, path, name, size_bytes, mime, by_name, by_email)
  values (p_id, p_path, left(coalesce(nullif(trim(p_name), ''), 'file'), 160), p_size, left(p_mime, 80), coalesce(public.cmp_me_name(), 'Unknown'), lower(coalesce(public.kb_me_email(), '')))
  on conflict (path) do nothing
  returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid);
end $$;
revoke all on function public.cmp_add_file(bigint, text, text, bigint, text) from public, anon;
grant execute on function public.cmp_add_file(bigint, text, text, bigint, text) to authenticated;
