-- APPLIED 27 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_sent_scan). Checked first in a rolled-back run: a real order mail turned its order to sent, a RE: reply from DBD, a TEST ONLY mail and a mail sent before the order was confirmed changed nothing, and a second run found nothing new.
-- Out of Stock: the order turns "sent" by itself (Kate, 27 Nov 2026: "dapat autodetect to eh", about the Mark as sent and Mark as on the way buttons).
-- Needs out_of_stock_supplier_orders.sql, out_of_stock_order_sent.sql, out_of_stock_dbd_reply.sql (APPLIED 26 Nov 2026).
--
-- The Orders and Receipts mail read already stores every mail of info@ in mail_documents, hourly, and marks the ones WE sent with status 'Sent'. The order email
-- carries the number in its subject ("TRS-PO-26-0001 | ORDER | SAADIYAT | 30 Nov 2026"), and so does the out-of-stock confirmation ("... | OOS CONFIRMATION | ...").
-- oos_sent_scan() looks at those Sent mails of the last 45 days to DBD whose subject BEGINS with a TRS-PO number (a test email to Kate starts with "TEST ONLY", so it never counts):
--   | ORDER |            an order still "confirmed" and confirmed before the mail was sent  ->  sent (sent_by 'auto: mail sent', sent_at = when the mail went)
--   | OOS CONFIRMATION |  an order at oos_reply with a saved decision not yet sent, replied before the mail was sent  ->  oos_confirmed
-- Safe to run any number of times. The cron job runs it every 10 minutes, just before oos_replies_scan() (DBD's replies, on the way, invoice).
-- "On the way" has no button any more: DBD has never sent a plain "on the way" mail, so an order goes sent -> invoiced when the invoice mail arrives (oos_replies_scan).
-- oos_order_mark_sent, oos_oos_mark_sent and oos_order_mark_on_the_way stay in the database, unused by the page.

create or replace function public.oos_sent_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; ono text; o record; rid bigint; n int := 0;
begin
  if auth.jwt() is not null and not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  for d in select m.msg_id, m.subject, m.at from public.mail_documents m
           where m.supplier ilike '%dbd%' and m.status = 'Sent' and m.at > now() - interval '45 days' and m.subject ~ '^\s*TRS-PO-\d\d-\d{4}'
           order by m.at loop
    ono := substring(d.subject from 'TRS-PO-\d\d-\d{4}');
    select * into o from public.oos_supplier_orders x where x.order_no = ono;
    if not found or o.status = 'cancelled' then continue; end if;
    if d.subject ~* '\|\s*OOS CONFIRMATION\s*\|' then
      if o.status = 'oos_reply' then
        rid := null;
        select r.id into rid from public.oos_order_replies r
         where r.order_no = ono and r.decisions is not null and r.confirm_sent_at is null and r.replied_at < d.at order by r.replied_at desc limit 1;
        if rid is not null then
          update public.oos_order_replies set confirm_sent_by = 'auto: mail sent', confirm_sent_at = d.at where id = rid;
          update public.oos_supplier_orders set status = 'oos_confirmed',
                 history = history || jsonb_build_array(jsonb_build_object('status', 'oos_confirmed', 'by', 'auto: mail sent', 'at', d.at))
           where order_no = ono;
          n := n + 1;
        end if;
      end if;
    elsif d.subject ~* '\|\s*ORDER\s*\|' then
      if o.status = 'confirmed' and d.at >= o.confirmed_at then
        update public.oos_supplier_orders set status = 'sent', sent_by = 'auto: mail sent', sent_at = d.at,
               history = history || jsonb_build_array(jsonb_build_object('status', 'sent', 'by', 'auto: mail sent', 'at', d.at))
         where order_no = ono;
        n := n + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'new_sent', n);
end $$;
revoke all on function public.oos_sent_scan() from public, anon;
grant execute on function public.oos_sent_scan() to authenticated;

-- the page calls oos_replies_scan() every time it reads the orders; the cron job runs both
select cron.schedule('oos-replies-scan', '*/10 * * * *', 'select public.oos_sent_scan(); select public.oos_replies_scan()');
