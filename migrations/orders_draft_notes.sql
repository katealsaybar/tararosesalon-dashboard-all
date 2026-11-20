-- Orders and Receipts: the note typed in the Checked box is kept as a draft (Kate, 20 Nov 2026). APPLIED live the same day (migration name orders_draft_notes).
-- order_drafts (group_key, note, saved_by, saved_at), RLS on with no policies; orders_draft_set(p_group, p_note) saves it (an empty note deletes it); orders_check_set removes the draft when the order
-- is marked as checked; orders_get returns drafts: {group_key: {note, by, at}}. Undo: drop function orders_draft_set(text, text); drop table order_drafts; re-run orders_check_set and orders_get
-- from orders_checked_many_proofs.sql. (Full definitions as applied: see the live functions.)
create table if not exists public.order_drafts (group_key text primary key, note text not null, saved_by text not null, saved_at timestamptz not null default now());
alter table public.order_drafts enable row level security;
revoke all on public.order_drafts from anon, authenticated;
