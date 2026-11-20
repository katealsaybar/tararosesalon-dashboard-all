-- Orders and Receipts: the reader labels an email from its subject and body BEFORE it has read the PDF, and orders-file-upload (which reads the PDF afterwards) keeps that label.
-- So Euro's Proforma Invoice (sent on a quotation), Neu's "Invoice 7352.pdf" and H2O's invoices (sent on replies) stayed message / quotation / notice (Kate, 20 Nov 2026).
-- This trigger runs at the moment the PDF's text arrives (an update of file_text): when the sender's own email (message, notice or quotation, never our reply or order and never
-- a statement) has a PDF whose first 300 characters say Proforma Invoice or Tax Invoice, it becomes an invoice. Rows already stored are left as they are: orders_get's
-- invoice_pdf field (orders_invoice_pdf.sql) already covers them on the page. To undo: drop trigger mail_documents_pdf_invoice on public.mail_documents.
create or replace function public.mail_documents_pdf_invoice() returns trigger language plpgsql as $$
begin
  if new.file_text is not null and new.kind in ('message', 'notice', 'quotation') and left(new.file_text, 300) ~* '(proforma invoice|tax invoice)' then
    new.kind := 'invoice';
    new.status := 'Invoiced';
  end if;
  return new;
end $$;

drop trigger if exists mail_documents_pdf_invoice on public.mail_documents;
create trigger mail_documents_pdf_invoice before update of file_text on public.mail_documents
  for each row when (new.file_text is distinct from old.file_text) execute function public.mail_documents_pdf_invoice();
