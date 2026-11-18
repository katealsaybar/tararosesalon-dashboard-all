-- Orders and Receipts: the dashboard copy of the supplier paperwork that lands in the info@ mailbox (Kate, 18 Nov 2026).
-- STATUS: APPLIED live on 18 Nov 2026 (Kate said go), project gvijxenafoowajqktqvd, migration name orders_receipts, after a rolled-back test (bad pass refused, dry run writes nothing,
-- repeat import adds nothing, file_path survives a re-import, orders_get refuses a caller who is not signed in). One line was added at apply time: revoke all on public.mail_documents from anon, authenticated.
-- The table is empty until the info@ script runs. The Orders and Receipts page (orders.js) is NOT written yet.
--
-- Same recipe as migrations/recruitment.sql: RLS on with no policies, one page function behind a level guard, one passworded import for the mailbox script
-- (apps-script copy: docs/orders-receipts/sync-orders-mailbox.gs), the three-line revoke and grant block so anon only reaches the import.
-- The import is an upsert on doc_key, so a missed or repeated run changes nothing. It never overwrites file_path or file_name (a later upload step owns those).
-- Undo all of it: drop the three functions, then drop table public.mail_documents, then
--   update public.dashboard_users set extra_pages = array_remove(extra_pages, 'orders');
-- Level trap: the guard reads the OLD level numbers (UI Level 6 = Kate = 5 here, the same as recruit_guard).

create table if not exists public.mail_documents (
  doc_key      text primary key,                 -- mailbox || ':' || the Gmail message id, so one email is one row however often it is read
  mailbox      text not null,                    -- info
  msg_id       text not null,
  thread_id    text,
  at           timestamptz not null,             -- when the email was sent or received
  group_key    text not null,                    -- ONE tracked order: supplier|order number for Falconpack and Carrefour, else supplier|Gmail thread. The page shows one row per group_key, never one per email (Kate, 18 Nov 2026)
  doc_date     date not null,                    -- the same day in Dubai time
  supplier     text not null,                    -- the name on Accounts' list (DBD, MADI, BS PRO, NEU, EURO ...), never guessed: an unknown sender is not imported
  kind         text not null check (kind in ('order', 'quotation', 'confirmation', 'shipped', 'delivered', 'invoice', 'statement', 'notice', 'message', 'reply')),   -- message and reply are the rest of a thread (what the supplier or we wrote that is not a document), shown only inside the thread window
  salon        text not null default 'UAE' check (salon in ('SAA', 'KCA', 'MC', 'AQ', 'UAE')),   -- UAE = all salons or none named
  category     text,
  reference    text,                             -- order number, invoice number, tax invoice number
  amount       numeric(12, 2),                   -- only when the email text shows one, else null (a PDF amount is read in a later step)
  lines        jsonb,                            -- what was bought, as the email lists it: [{code, name, qty, unit, total, disc, note}], null when the email has no list (the PDF is read in a later step)
  subtotal     numeric(12, 2),
  discount     numeric(12, 2),                   -- AED the supplier took off, only when the email says
  discount_pct numeric(5, 2),                    -- the discount percentage applied, when the email says (DBD invoice: 10)
  discount_should numeric(5, 2),                 -- the percentage that was agreed, when the email says it was wrong (DBD invoice: 15)
  delivery     numeric(12, 2),
  vat          numeric(12, 2),
  currency     text not null default 'AED',
  due_date     date,
  subject      text,
  note         text,                             -- first 160 characters of the plain text, no client data is expected in supplier mail
  body         text,                             -- the plain text of the message, cut at 2000 characters, for the email thread window (added 18 Nov 2026)
  file_names   text,                             -- every attachment name, separated by '; '
  has_file     boolean not null default false,   -- the email carried a PDF or an image
  file_name    text,
  file_path    text,                             -- set by the upload step (private bucket), never by this import
  status       text,
  flag         text,                             -- why it needs a look, from a rule in the script (overdue, out of stock, payment failed ...)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists mail_documents_group_idx on public.mail_documents (group_key);
create index if not exists mail_documents_date_idx on public.mail_documents (doc_date desc);
create index if not exists mail_documents_supplier_idx on public.mail_documents (supplier, doc_date desc);
alter table public.mail_documents enable row level security;   -- no policies on purpose
revoke all on public.mail_documents from anon, authenticated;

create or replace function public.orders_guard() returns text
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.name is null or not (m.level >= 5 or 'orders' = any (coalesce(m.extra_pages, '{}'::text[]))) then
    raise exception 'Not open to your account';
  end if;
  return m.name;
end $$;

-- Everything the page draws, in one call (newest first, at most 5000 rows). The page filters by Branch and Period itself.
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
      'has_file', d.has_file, 'file_name', d.file_name, 'file_path', d.file_path, 'status', d.status, 'flag', d.flag) order by d.doc_date desc, d.at desc)
    from (select * from public.mail_documents
           where (p_from is null or doc_date >= p_from) and (p_to is null or doc_date <= p_to)
           order by doc_date desc, at desc limit 5000) d), '[]'::jsonb));
end $$;

-- The mailbox script's call. Passworded with the same push pass the other pushers use.
create or replace function public.orders_import(p_pass uuid, p_rows jsonb, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; k text; ts timestamptz; d date; sal text; knd text; amt numeric; due date; ex boolean; ln jsonb;
  n_new int := 0; n_same int := 0; n_bad int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'at most 500 rows per call'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    k := nullif(btrim(coalesce(r->>'doc_key', '')), '');
    knd := coalesce(r->>'kind', '');
    sal := coalesce(nullif(r->>'salon', ''), 'UAE');
    if k is null or nullif(btrim(coalesce(r->>'supplier', '')), '') is null or nullif(btrim(coalesce(r->>'group_key', '')), '') is null
       or knd not in ('order', 'quotation', 'confirmation', 'shipped', 'delivered', 'invoice', 'statement', 'notice', 'message', 'reply')
       or sal not in ('SAA', 'KCA', 'MC', 'AQ', 'UAE') then n_bad := n_bad + 1; continue; end if;
    begin ts := (r->>'at')::timestamptz; exception when others then n_bad := n_bad + 1; continue; end;
    d := (ts at time zone 'Asia/Dubai')::date;
    begin amt := nullif(r->>'amount', '')::numeric; exception when others then amt := null; end;
    if amt is not null and (amt < 0 or amt > 10000000) then amt := null; end if;
    begin due := nullif(r->>'due', '')::date; exception when others then due := null; end;
    ln := case when jsonb_typeof(r->'lines') = 'array' and jsonb_array_length(r->'lines') <= 200 then r->'lines' else null end;
    select exists (select 1 from public.mail_documents where doc_key = k) into ex;
    if ex then n_same := n_same + 1; else n_new := n_new + 1; end if;
    if p_dry then continue; end if;
    insert into public.mail_documents as t (doc_key, group_key, mailbox, msg_id, thread_id, at, doc_date, supplier, kind, salon, category, reference, amount, currency, due_date,
                                            subject, note, body, file_names, has_file, file_name, status, flag, lines, subtotal, discount, discount_pct, discount_should, delivery, vat)
    values (k, btrim(r->>'group_key'), coalesce(nullif(r->>'mailbox', ''), 'info'), coalesce(nullif(r->>'msg_id', ''), k), nullif(r->>'thread_id', ''), ts, d,
            btrim(r->>'supplier'), knd, sal, nullif(r->>'category', ''), nullif(r->>'reference', ''), amt, coalesce(nullif(r->>'currency', ''), 'AED'), due,
            left(r->>'subject', 300), left(r->>'note', 160), left(r->>'body', 2000), left(r->>'file_names', 500), coalesce((r->>'has_file')::boolean, false), left(r->>'file_name', 200), left(r->>'status', 80), left(r->>'flag', 200),
            ln, nullif(r->>'subtotal', '')::numeric, nullif(r->>'discount', '')::numeric, nullif(r->>'discount_pct', '')::numeric, nullif(r->>'discount_should', '')::numeric, nullif(r->>'delivery', '')::numeric, nullif(r->>'vat', '')::numeric)
    on conflict (doc_key) do update set
      group_key = excluded.group_key, lines = coalesce(excluded.lines, t.lines), subtotal = coalesce(excluded.subtotal, t.subtotal), discount = coalesce(excluded.discount, t.discount),
      discount_pct = coalesce(excluded.discount_pct, t.discount_pct), discount_should = coalesce(excluded.discount_should, t.discount_should),
      delivery = coalesce(excluded.delivery, t.delivery), vat = coalesce(excluded.vat, t.vat),
      supplier = excluded.supplier, kind = excluded.kind, salon = excluded.salon, category = excluded.category, reference = excluded.reference,
      amount = coalesce(excluded.amount, t.amount), due_date = coalesce(excluded.due_date, t.due_date), subject = excluded.subject, note = excluded.note, body = excluded.body, file_names = excluded.file_names,
      has_file = excluded.has_file or t.has_file, file_name = coalesce(excluded.file_name, t.file_name), status = excluded.status, flag = excluded.flag,
      updated_at = now();     -- file_path is deliberately not touched
  end loop;
  return jsonb_build_object('dry', p_dry, 'new', n_new, 'seen_before', n_same, 'rejected', n_bad);
end $$;

revoke all on function public.orders_guard() from public, anon, authenticated;
revoke all on function public.orders_get(date, date) from public, anon;
revoke all on function public.orders_import(uuid, jsonb, boolean) from public, authenticated;
grant execute on function public.orders_get(date, date) to authenticated;
grant execute on function public.orders_import(uuid, jsonb, boolean) to anon;
