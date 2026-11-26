-- APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (migration dbd_catalog). dbd_catalog_rebuild() was run once: 1,481 products, 1,420 with an EAN, from 560 DBD order documents.
-- DBD product catalog: item code, EAN, description, size, price list price (WSP) of every product on the DBD order forms we have sent (Kate, 26 Nov 2026,
-- step 2 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md in the cowork repo: "create order form for dbd").
--
-- DBD's order forms are their own Excel price lists (one per brand family and stock type: ABC, Alterna/Caviar, SKP, Blond Me, each retail and professional), columns
-- Category | Sub-category | Code | Description | Size | WSP (AED) | Suggested RSP (AED) | Order Qty. | Total | EAN | Status. Their out-of-stock replies and invoices are keyed by the Code.
-- Our Stock List has the EAN (barcode) and not the Code, so this table is the bridge: our product -> EAN -> DBD Code.
--
-- Built from mail_documents (the info@ mailbox read by the Orders and Receipts page): every DBD "order" document's file_text holds the forms' filled rows, tab separated.
-- Columns are found from each form's own header row (they differ from form to form). The newest form wins for description, size and price (iterated oldest first);
-- a blank category or EAN never wipes a known one. A product is only here once it has been ordered on a form: a product never ordered has no code and is flagged on the order.
--
-- dbd_catalog_rebuild()  service role only (revoked from everyone else); re-run any time, it only adds or updates. Returns how many products and forms it read.
-- dbd_catalog_get()      read gate = oos_access(): the catalog for the page (code, ean, description, size, category, sub_category, wsp, form).

create table if not exists public.dbd_catalog (
  code         text primary key,
  ean          text,
  description  text not null,
  size         text,
  category     text,
  sub_category text,
  wsp          numeric,
  form         text,
  last_seen    date,
  n_seen       int not null default 0
);
alter table public.dbd_catalog enable row level security;
revoke all on public.dbd_catalog from public, anon, authenticated;
create index if not exists dbd_catalog_ean on public.dbd_catalog (ean);

create or replace function public.dbd_catalog_rebuild()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d record; ln text; cells text[]; frm text := ''; i int;
  c_cat int; c_sub int; c_code int; c_desc int; c_size int; c_wsp int; c_ean int;
  v_code text; v_ean text; v_wsp numeric; w text;
  n_docs int := 0; n_rows int := 0;
begin
  for d in select doc_date, file_text from public.mail_documents
           where supplier ilike '%dbd%' and kind = 'order' and file_text is not null order by doc_date, at loop
    n_docs := n_docs + 1; frm := ''; c_code := null;
    for ln in select x from regexp_split_to_table(d.file_text, E'\r?\n') x loop
      if ln like '### FILE %' then frm := trim(substr(ln, 10)); c_code := null; continue; end if;
      if ln like '## %' or ln = '' then continue; end if;
      cells := string_to_array(ln, E'\t');
      if lower(trim(coalesce(cells[1], ''))) = 'category' then
        c_cat := 1; c_sub := null; c_code := null; c_desc := null; c_size := null; c_wsp := null; c_ean := null;
        for i in 1 .. coalesce(array_length(cells, 1), 0) loop
          w := lower(trim(coalesce(cells[i], '')));
          if w ~ '^sub' then c_sub := i; elsif w = 'code' then c_code := i; elsif w ~ '^description' then c_desc := i;
          elsif w ~ '^size' then c_size := i; elsif w ~ '^wsp' then c_wsp := i; elsif w ~ '^ean' then c_ean := i; end if;
        end loop;
        continue;
      end if;
      if c_code is null or c_desc is null then continue; end if;
      v_code := trim(coalesce(cells[c_code], ''));
      if v_code !~ '^\d{6,8}$' then continue; end if;
      v_ean := case when c_ean is null then null else nullif(regexp_replace(coalesce(cells[c_ean], ''), '\D', '', 'g'), '') end;
      w := case when c_wsp is null then '' else regexp_replace(coalesce(cells[c_wsp], ''), '[^0-9.]', '', 'g') end;
      v_wsp := case when w ~ '^\d+(\.\d+)?$' then w::numeric else null end;
      n_rows := n_rows + 1;
      insert into public.dbd_catalog as t (code, ean, description, size, category, sub_category, wsp, form, last_seen, n_seen)
      values (v_code, v_ean, regexp_replace(trim(cells[c_desc]), '\s+', ' ', 'g'), nullif(trim(coalesce(cells[c_size], '')), ''),
              nullif(trim(coalesce(cells[c_cat], '')), ''), case when c_sub is null then null else nullif(trim(coalesce(cells[c_sub], '')), '') end,
              v_wsp, nullif(frm, ''), d.doc_date, 1)
      on conflict (code) do update set
        ean = coalesce(excluded.ean, t.ean),
        description = excluded.description,
        size = coalesce(excluded.size, t.size),
        category = coalesce(excluded.category, t.category),
        sub_category = coalesce(excluded.sub_category, t.sub_category),
        wsp = coalesce(excluded.wsp, t.wsp),
        form = coalesce(excluded.form, t.form),
        last_seen = excluded.last_seen,
        n_seen = t.n_seen + 1;
    end loop;
  end loop;
  return jsonb_build_object('documents', n_docs, 'rows', n_rows, 'products', (select count(*) from public.dbd_catalog), 'with_ean', (select count(*) from public.dbd_catalog where ean is not null));
end $$;
revoke all on function public.dbd_catalog_rebuild() from public, anon, authenticated;

create or replace function public.dbd_catalog_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('products', coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'ean', c.ean, 'desc', c.description, 'size', c.size,
           'cat', c.category, 'sub', c.sub_category, 'wsp', c.wsp, 'form', c.form) order by c.code) from public.dbd_catalog c), '[]'::jsonb));
end $$;
revoke all on function public.dbd_catalog_get() from public, anon;
grant execute on function public.dbd_catalog_get() to authenticated;
