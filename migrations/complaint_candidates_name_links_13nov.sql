-- Chat complaints review, 13 Nov 2026 (Kate: "yes, fix both"). Five chat candidates had no Phorest client because the number on the chat
-- is not the number Phorest holds (mostly overseas numbers). Each name matches exactly one Phorest client (phorest_client_emails, one distinct phorest_id)
-- and that client has sales at the same salon in the 90 days before the chat, so they are linked by name. Applied live on 13 Nov 2026.
-- Undo: update public.complaint_candidates set phorest_id = null where id in (4, 15, 34, 42, 54);
-- Left unlinked on purpose: #35 (a French number, no name match), #63 (first name only), #67 (Arabic name), #71 (a dot for a surname), #77 (Instagram, no number).
update public.complaint_candidates c set phorest_id = v.pid
from (values (4, 'YJv8fUlmntDKPUp8a2t3qQ'), (15, '0EIHBh4bptMTqq8_lJAuHQ'), (34, '00KR2vJeImoKj8FlCPagvQ'), (42, '5RwSvxz9Y-ee3WMelVJuOA'), (54, 'DzasqCNZxe_34s7hPfdKIw')) v(id, pid)
where c.id = v.id and c.phorest_id is null;
