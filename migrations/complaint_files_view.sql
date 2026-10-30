-- Complaint record: the photos and files show on the page as small thumbnails (Kate, 30 Oct 2026). Run after complaint_board_inbox.sql. Additive.
--
-- Until now only dashboard users at level 2 and up could open a complaint's files (the cq_files_read storage policy), so the record page said "open on the
-- dashboard". The files belong to the people who may see the client: leadership, the branch coordinator, the person who logged it and the person who took it
-- (cmp_reveal). Copied people and the people on the chain who have not taken it do not see the client, so they do not see the photos either.
--   cmp_file_ok(path)  true when the file belongs to a complaint the caller may see the client of
--   cmp_files(id)      the file list for one complaint (empty when the caller may not see the client)
--   cmp_files_read     storage policy, added beside cq_files_read, so a signed link can be made for those files

create or replace function public.cmp_file_ok(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.client_complaint_files f where f.path = p_path and public.cmp_reveal(f.complaint_id))
$$;
revoke all on function public.cmp_file_ok(text) from public, anon;
grant execute on function public.cmp_file_ok(text) to authenticated;

drop policy if exists cmp_files_read on storage.objects;
create policy cmp_files_read on storage.objects for select to authenticated
  using (bucket_id = 'complaint-files' and public.cmp_file_ok(name));

create or replace function public.cmp_files(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.cmp_can(p_id) or not public.cmp_reveal(p_id) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'size', f.size_bytes, 'mime', f.mime, 'path', f.path, 'by', f.by_name, 'at', f.at) order by f.at, f.id)
                     from public.client_complaint_files f where f.complaint_id = p_id), '[]'::jsonb);
end $$;
revoke all on function public.cmp_files(bigint) from public, anon;
grant execute on function public.cmp_files(bigint) to authenticated;
