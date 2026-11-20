-- Orders and Receipts: an attached PDF that is an invoice counts as the order's invoice (Kate, 20 Nov 2026: "no invoice? this is literally an invoice").
-- Euro sends its Proforma Invoice as the "quotation" PDF, Neu, H2O and others send "Invoice 7352.pdf" on a reply that the mailbox reader files as a message.
-- orders_get gains ONE read-only field, invoice_pdf: true when the email is not already an invoice or a statement and the first 300 characters of its kept PDF
-- say "Proforma Invoice" or "Tax Invoice". The page treats such an email as the order's invoice for the 'No invoice seen' rule and the Invoiced step.
-- Nothing is rewritten in mail_documents. To undo: re-run the orders_get definition in migrations/orders_receipts.sql.
create or replace function public.orders_get(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.orders_guard();
begin
  return jsonb_build_object('me', who, 'rows', coalesce((
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
