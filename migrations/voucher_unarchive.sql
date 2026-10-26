-- Lets the admin (kate@tararosesalon.com) unarchive a voucher row on the voucher log.
-- Archive is a voucher_events row of kind 'archived'. Unarchive deletes that one row and
-- nothing else: the delete policy is limited to admins AND to kind = 'archived', so a void
-- or a completed referral can never be deleted this way. The page leaves a 'note' event
-- ("Unarchived") so the record still shows it happened. Additive, safe to re-run.

grant delete on public.voucher_events to authenticated;

drop policy if exists voucher_events_delete_archive on public.voucher_events;
create policy voucher_events_delete_archive on public.voucher_events
  for delete to authenticated
  using (public.is_admin(auth.uid()) and kind = 'archived');
