-- Orders and Receipts: "checked in the supplier's account" (Kate, 20 Nov 2026). An order that needs a look because the mailbox is silent (no delivery email, no invoice) can be cleared
-- by whoever opened it in the Amazon account or the supplier's portal and saw it was fine. One row per order the page shows (its group key), who ticked it and when.
-- Same recipe as the rest of Orders and Receipts: RLS on with no policies, one guarded function to write, and orders_get hands the ticks back with the rows.
-- Also fixes two Amazon "Invoice request from Amazon customer ..." emails the reader filed as invoices (they are messages).
-- Undo: drop function public.orders_check_set(text, boolean); drop table public.order_checks; then re-run the orders_get definition in migrations/orders_invoice_pdf.sql.
create table if not exists public.order_checks (
  group_key  text primary key,
  checked_by text not null,
  checked_at timestamptz not null default now(),
  note       text
);
alter table public.order_checks enable row level security;   -- no policies on purpose
revoke all on public.order_checks from anon, authenticated;

create or replace function public.orders_check_set(p_group text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.orders_guard();
begin
  if p_group is null or length(p_group) < 3 or length(p_group) > 200 then raise exception 'bad order'; end if;
  if p_on then
    insert into public.order_checks (group_key, checked_by) values (p_group, who)
    on conflict (group_key) do update set checked_by = excluded.checked_by, checked_at = now();
  else
    delete from public.order_checks where group_key = p_group;
  end if;
  return jsonb_build_object('group', p_group, 'checked', p_on, 'by', who);
end $$;
revoke all on function public.orders_check_set(text, boolean) from public, anon;
grant execute on function public.orders_check_set(text, boolean) to authenticated;

create or replace function public.orders_get(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.orders_guard();
begin
  return jsonb_build_object('me', who,
    'checks', coalesce((select jsonb_object_agg(group_key, jsonb_build_object('by', checked_by, 'at', checked_at)) from public.order_checks), '{}'::jsonb),
    'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', d.doc_key, 'at', d.at, 'date', d.doc_date, 'supplier', d.supplier, 'kind', d.kind, 'salon', d.salon, 'category', d.category,
      'reference', d.reference, 'amount', d.amount, 'currency', d.currency, 'due', d.due_date, 'subject', d.subject, 'note', d.note,
      'thread', d.thread_id, 'group', d.group_key, 'body', d.body, 'file_names', d.file_names,
      'lines', d.lines, 'subtotal', d.subtotal, 'discount', d.discount, 'discount_pct', d.discount_pct, 'discount_should', d.discount_should, 'delivery', d.delivery, 'vat', d.vat,
      'has_file', d.has_file, 'file_name', d.file_name, 'file_path', d.file_path, 'status', d.status, 'flag', d.flag,
      'invoice_pdf', (d.kind not in ('invoice', 'statement') and d.file_text is not null and left(d.file_text, 300) ~* '(proforma invoice|tax invoice)')) order by d.doc_date desc, d.at desc)
    from (select * from public.mail_documents
           where (p_from is null or doc_date >= p_from) and (p_to is null or doc_date <= p_to)
           order by doc_date desc, at desc limit 5000) d), '[]'::jsonb));
end $$;

update public.mail_documents set kind = 'message', status = 'Message'
 where supplier = 'AMAZON.AE' and kind = 'invoice' and subject ilike 'Invoice request%';
