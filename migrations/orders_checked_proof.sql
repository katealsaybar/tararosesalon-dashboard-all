-- Orders and Receipts: the Checked tick keeps a note and a pasted screenshot (Kate, 20 Nov 2026). APPLIED live the same day (migration name orders_checked_proof), after orders_checked.sql.
-- Private bucket order-proofs (images and PDF, 5 MB), read, write and delete only for people orders_can() lets in; order_checks gains proof_path and proof_name;
-- orders_check_set gets note, proof path and proof name; orders_get hands each tick back with its note and proof. Undo: drop the three storage policies and the bucket, drop the two columns,
-- and re-run the orders_get definition in migrations/orders_checked.sql.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-proofs', 'order-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
drop policy if exists order_proofs_read on storage.objects;
drop policy if exists order_proofs_write on storage.objects;
drop policy if exists order_proofs_delete on storage.objects;
create policy order_proofs_read on storage.objects for select to authenticated using (bucket_id = 'order-proofs' and public.orders_can());
create policy order_proofs_write on storage.objects for insert to authenticated with check (bucket_id = 'order-proofs' and public.orders_can());
create policy order_proofs_delete on storage.objects for delete to authenticated using (bucket_id = 'order-proofs' and public.orders_can());
alter table public.order_checks add column if not exists proof_path text;
alter table public.order_checks add column if not exists proof_name text;
drop function if exists public.orders_check_set(text, boolean);
create or replace function public.orders_check_set(p_group text, p_on boolean, p_note text default null, p_proof_path text default null, p_proof_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.orders_guard();
begin
  if p_group is null or length(p_group) < 3 or length(p_group) > 200 then raise exception 'bad order'; end if;
  if p_proof_path is not null and (p_proof_path not like 'checks/%' or length(p_proof_path) > 300) then raise exception 'bad proof'; end if;
  if p_on then
    insert into public.order_checks (group_key, checked_by, note, proof_path, proof_name)
    values (p_group, who, nullif(left(btrim(coalesce(p_note, '')), 500), ''), p_proof_path, left(p_proof_name, 160))
    on conflict (group_key) do update set checked_by = excluded.checked_by, checked_at = now(), note = excluded.note,
      proof_path = coalesce(excluded.proof_path, public.order_checks.proof_path), proof_name = coalesce(excluded.proof_name, public.order_checks.proof_name);
  else
    delete from public.order_checks where group_key = p_group;
  end if;
  return jsonb_build_object('group', p_group, 'checked', p_on, 'by', who);
end $$;
revoke all on function public.orders_check_set(text, boolean, text, text, text) from public, anon;
grant execute on function public.orders_check_set(text, boolean, text, text, text) to authenticated;
-- orders_get now also returns checks: {group_key: {by, at, note, proof, proof_name}} (full definition as applied: see the live function).
