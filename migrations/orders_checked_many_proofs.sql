-- Orders and Receipts: a Checked tick keeps SEVERAL pasted screenshots and PDFs (Kate, 20 Nov 2026). APPLIED live the same day (migration name orders_checked_many_proofs), after orders_checked_proof.sql.
-- order_checks.proofs is a jsonb array of {path, name} (at most 10, every path under checks/); orders_check_set(p_group, p_on, p_note, p_proofs jsonb) replaces the 5-argument version;
-- orders_get returns each tick's proofs; the order-proofs bucket limit is now 10 MB. The single proof_path and proof_name columns are kept (their rows were copied into proofs).
-- Undo: re-run the orders_check_set and orders_get definitions in orders_checked_proof.sql and drop column proofs.
-- (Full definitions as applied: see the live functions public.orders_check_set and public.orders_get.)
alter table public.order_checks add column if not exists proofs jsonb not null default '[]'::jsonb;
update public.order_checks set proofs = jsonb_build_array(jsonb_build_object('path', proof_path, 'name', coalesce(proof_name, 'screenshot'))) where proof_path is not null and proofs = '[]'::jsonb;
update storage.buckets set file_size_limit = 10485760 where id = 'order-proofs';
