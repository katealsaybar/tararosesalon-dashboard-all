-- Orders and Receipts: the draft of a Checked box keeps its screenshots and PDFs as well as the note (Kate, 20 Nov 2026). APPLIED live the same day (migration name orders_draft_proofs).
-- order_drafts.proofs is a jsonb list of {path, name} (at most 10, every path under checks/); orders_draft_set(p_group, p_note, p_proofs) replaces the 2-argument version and deletes the draft only when
-- both the note and the list are empty; orders_get returns each draft's proofs. A file is uploaded to the private bucket order-proofs the moment it is pasted or dropped, and removed again when its x is pressed.
-- Undo: re-run orders_draft_set and orders_get from orders_draft_notes.sql and drop column proofs. (Full definitions as applied: see the live functions.)
alter table public.order_drafts add column if not exists proofs jsonb not null default '[]'::jsonb;
