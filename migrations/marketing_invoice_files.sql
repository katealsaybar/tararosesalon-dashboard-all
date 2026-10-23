-- Marketing Spend, invoices to download (Kate, 23 Oct 2026). Applied live 23 Oct 2026.
-- The PDFs behind the numbers are in a private storage bucket, marketing-invoices, that only Level 3 and above can read: 87 paid Meta ads
-- invoices (Oct 2025 to Jul 2026, filed under the month they were paid), 9 Google Ads statements (Nov 2025 to Jul 2026) and 26 Leaders in
-- Digital invoices (Oct 2025 to Sep 2026: the UAE ones, plus Bahrain 1963 and 2133 that are counted; the first Abu Dhabi April invoice 2030
-- for 22,500 is not here because it was reissued as 12,500). Paths are meta/YYYY-MM/FBADS-....pdf, google/YYYY-MM/..., agency/YYYY-MM/....
-- They were uploaded once through a temporary guarded edge function (invoice-upload-tmp, now a 410 stub). New months: upload the PDF to the
-- bucket and add a row here; the page lists whatever is in marketing_invoice_files for the months in view.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-invoices', 'marketing-invoices', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "marketing invoices: level 3 and above can read" on storage.objects;
create policy "marketing invoices: level 3 and above can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'marketing-invoices' and coalesce((select m.level from public.dashboard_me() m limit 1), 0) >= 3);

create table if not exists marketing_invoice_files (
  storage_path text primary key,
  kind         text    not null check (kind in ('meta', 'google', 'agency')),
  month        date    not null,
  title        text    not null,
  ref          text,
  entity       text,
  amount_aed   numeric,
  bytes        int,
  loaded_at    timestamptz not null default now()
);
alter table marketing_invoice_files enable row level security;   -- no policies: read through marketing_invoice_files() only

create or replace function public.marketing_invoice_files()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Marketing Spend is for Level 3 and above';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'month', month, 'title', title, 'ref', ref, 'entity', entity,
            'amount', amount_aed, 'path', storage_path, 'bytes', bytes) order by month, kind, ref) from marketing_invoice_files), '[]'::jsonb);
end;
$function$;
revoke all on function public.marketing_invoice_files() from public, anon;
grant execute on function public.marketing_invoice_files() to authenticated;
-- The list rows were filled from storage.objects joined to meta_ads_invoices (invoice no, paid date, amount), google_ads_statements (period,
-- billed) and, for the agency, the invoice number and its total before VAT read off each PDF.
