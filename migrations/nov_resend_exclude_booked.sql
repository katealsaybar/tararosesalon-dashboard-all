-- Resend failed (November blasts): leave out clients who already booked or came in (Kate, 11 Nov 2026: "make sure na natanggal na doon yung nakapag book na").
-- WHY: nov_send_resend_pool only looked at client_bookings from today on, so a client who booked and had her visit since (or came in without a later booking) was still in the pool.
--      On 11 Nov that was 2 of the 2 clients who would have been resent (blast A one, blast E3 one), both booked since our message.
-- RULE: one more reason, after "Has an appointment booked": "Already booked or came in since our message" = nov_client_facts ahead, late (booked after 30 Nov), booked_since or came_in.
-- nov_send_resend and nov_send_resend_preview both read the pool, so the page count and the real queue agree. Applied live 11 Nov 2026; restrictive only, nothing is added to a send.
do $do$
declare d text; a text := $a$      when f.client_key in (select bk.k from bk) or stl_key_fold(f.client_key) in (select bk.k from bk) then 'Has an appointment booked'$a$;
begin
  d := pg_get_functiondef('public.nov_send_resend_pool(text,timestamp with time zone)'::regprocedure);
  if position(a in d) = 0 then raise exception 'pattern not found'; end if;
  d := replace(d, a, a || E'\n      when exists (select 1 from nov_client_facts nf where nf.k = stl_key_fold(f.client_key) and (nf.ahead or nf.late or nf.booked_since or nf.came_in)) then ''Already booked or came in since our message''');
  execute d;
end $do$;
