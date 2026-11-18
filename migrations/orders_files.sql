-- Orders and Receipts: keep the supplier's PDF and read it (Kate, 18 Nov 2026, after the Carrefour tax invoice showed that quantity and price live only in the PDF).
--   bucket order-files        private, 10 MB a file, pdf only
--   mail_documents.file_path  path inside the bucket (already there; null = none stored)
--   mail_documents.file_text  the text read out of the PDF, used to fill the order lines and for the page's own search later; never sent to the page
--   orders_can()              same rule as orders_guard() (Level 5 or the extra page 'orders') but returns true / false, for the storage policy
-- The mailbox script sends each PDF to the edge function orders-file-upload (same push pass as the other pushers), which stores it and reads it.
-- Undo: drop the policy, the function and the column, delete the bucket's files and the bucket, delete the edge function.
alter table public.mail_documents add column if not exists file_text text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-files', 'order-files', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create or replace function public.orders_can() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  return m.name is not null and (m.level >= 5 or 'orders' = any (coalesce(m.extra_pages, '{}'::text[])));
end $$;
revoke all on function public.orders_can() from public, anon;
grant execute on function public.orders_can() to authenticated;

drop policy if exists order_files_read on storage.objects;
create policy order_files_read on storage.objects for select to authenticated using (bucket_id = 'order-files' and public.orders_can());
