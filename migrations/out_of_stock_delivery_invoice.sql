-- APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_delivery_invoice). Switch OFF and templates tr_oos_on_the_way and tr_oos_invoice NOT approved: nothing is sent. Checked in a rolled-back run: a DBD invoice mail with the order number turned the order invoiced and queued one WhatsApp each to Jumera and Mary Anne (AED 10,760.87), a DBD mail saying on the way and arriving today queued one to Shiela (Motor City), a second scan doubled nothing, a manual on-the-way worked twice without error. All tables left empty.
-- Out of Stock: DBD says the order is on the way, and DBD's invoice (Kate, 26 Nov 2026, step 5 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md):
--   "dbd will let us know order is otw. salon coordinator gets notified"
--   "dbd will send invoice about the order. accounts team gets notified (jumera, ann)"
-- Needs out_of_stock_dbd_reply.sql and out_of_stock_notify.sql (both APPLIED 26 Nov 2026). Same method as step 4: oos_replies_scan() reads DBD's mails by the TRS-PO number in the subject.
--
-- On the way: a DBD mail (not an out-of-stock list, not an invoice) whose own text, above the quoted original, says on the way, on its way, out for delivery, dispatched, being delivered,
--             delivery today or tomorrow, will be delivered today or tomorrow. The order turns on_the_way and the salon's coordinator is told. NOTE: in the whole mailbox since 2024 DBD has never
--             sent a plain "on the way" mail (its delivery team just arrives), so this may stay quiet until DBD is asked to write one; oos_order_mark_on_the_way() lets a person mark it by hand.
-- Invoice:    a DBD mail the Orders and Receipts page reads as an invoice (kind invoice) with the order number in the subject. The order turns invoiced, the amount is kept, and the accounts
--             people are told: Jumera Chavenia (Accounts and Admin Head) and Mary Anne Yanson (Accounts Manager; "Ann": to be confirmed by Kate).
-- Both WhatsApps go from the MAIN number (channel 572200) through the staff WhatsApp queue, exactly like step 4, and stay OFF until their templates are approved by Meta:
--   tr_oos_on_the_way   Hi {{1}}, DBD says order {{2}} for {{3}} is on the way. Please be ready to check the delivery against the order: {{4}}   Thank you.
--                       samples: Shiela / TRS-PO-26-0007 / Motor City / https://trk-salon-os.com/?view=out-of-stock
--   tr_oos_invoice      Hi {{1}}, DBD has sent the invoice for order {{2}} ({{3}}), {{4}}. Please check it against the order and the delivery: {{5}}   Thank you.
--                       samples: Jumera / TRS-PO-26-0007 / Motor City / AED 3,161.14 / https://trk-salon-os.com/?view=orders-and-receipts
--   then: update staff_wa_templates set approved = true where key in ('oos_on_the_way', 'oos_invoice');   (the switch oos_notify_config.enabled is the same one as step 4)

insert into public.oos_notify_recipients (name, role, branch_code, staff_id, wa_on)
select s.name, 'accounts', null, s.id, true from public.staff_phones s
where s.id in (35, 32) and not exists (select 1 from public.oos_notify_recipients r where r.role = 'accounts' and r.staff_id = s.id);

insert into public.staff_wa_templates (key, kind, label, respond_name, language, body, footer, vars, sort) values
('oos_on_the_way', 'campaign', 'DBD order on the way (Out of Stock)', 'tr_oos_on_the_way', 'en_GB',
$b$Hi {{1}}, DBD says order {{2}} for {{3}} is on the way. Please be ready to check the delivery against the order: {{4}}

Thank you.$b$, 'Tara Rose Salons', array['first_name', 'order_no', 'salon', 'link'], 24),
('oos_invoice', 'campaign', 'DBD invoice arrived (Out of Stock)', 'tr_oos_invoice', 'en_GB',
$b$Hi {{1}}, DBD has sent the invoice for order {{2}} ({{3}}), {{4}}. Please check it against the order and the delivery: {{5}}

Thank you.$b$, 'Tara Rose Salons', array['first_name', 'order_no', 'salon', 'amount', 'link'], 25)
on conflict (key) do nothing;

create or replace function public._oos_notify_event(p_event_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.oos_events; cfg public.oos_notify_config; t public.staff_wa_templates; r record; s public.staff_phones; ph text; vp text[]; n int := 0; skipped jsonb := '[]'::jsonb;
  salon text; items text; amt text; tk text; rl text;
begin
  select * into ev from public.oos_events where id = p_event_id;
  if not found then return jsonb_build_object('queued', 0, 'reason', 'no event'); end if;
  if ev.notified_at is not null then return jsonb_build_object('queued', 0, 'reason', 'already told'); end if;
  select * into cfg from public.oos_notify_config where id = 1;
  if not coalesce(cfg.enabled, false) then return jsonb_build_object('queued', 0, 'reason', 'off'); end if;
  tk := case ev.kind when 'oos_reply' then 'oos_reply' when 'on_the_way' then 'oos_on_the_way' when 'invoice' then 'oos_invoice' end;
  rl := case ev.kind when 'invoice' then 'accounts' else 'coordinator' end;
  select * into t from public.staff_wa_templates where key = tk;
  if not found or not t.approved then return jsonb_build_object('queued', 0, 'reason', 'template_not_approved'); end if;
  salon := case ev.branch when 'SAA' then 'Saadiyat' when 'KCA' then 'Khalifa City A' when 'MC' then 'Motor City' when 'AQ' then 'Al Quoz' else ev.branch end;
  items := coalesce(ev.payload ->> 'items', '0') || case when coalesce(ev.payload ->> 'items', '0') = '1' then ' item' else ' items' end;
  amt := case when (ev.payload ->> 'amount') ~ '^\d+(\.\d+)?$' then 'AED ' || trim(to_char((ev.payload ->> 'amount')::numeric, 'FM999,999,990.00')) else 'the amount is on the invoice' end;
  for r in select * from public.oos_notify_recipients where active and wa_on and role = rl and (rl = 'accounts' or branch_code = ev.branch) and staff_id is not null loop
    select * into s from public.staff_phones where id = r.staff_id;
    ph := regexp_replace(coalesce(s.phone, ''), '\D', '', 'g');
    if not found or length(ph) < 9 or length(ph) > 15 then skipped := skipped || jsonb_build_object('name', r.name, 'reason', 'not a usable number'); continue; end if;
    vp := case ev.kind
      when 'oos_reply' then array[public.staff_wa_first_name(s.name), items, ev.order_no, salon, 'https://trk-salon-os.com/?view=out-of-stock']
      when 'on_the_way' then array[public.staff_wa_first_name(s.name), ev.order_no, salon, 'https://trk-salon-os.com/?view=out-of-stock']
      else array[public.staff_wa_first_name(s.name), ev.order_no, salon, amt, 'https://trk-salon-os.com/?view=orders-and-receipts'] end;
    begin
      insert into public.staff_wa_jobs (staff_id, kind, batch, msg_type, tkey, phone, channel_id, params, body_text, requested_by)
      values (s.id, t.kind, 'oos-' || ev.id, 'template', t.key, '+' || ph, cfg.channel_id, vp, public.staff_wa_render(t.body, vp), 'Out of Stock');
      n := n + 1;
    exception when unique_violation then null;
    end;
  end loop;
  if n > 0 then update public.oos_events set notified_at = now() where id = ev.id; end if;
  return jsonb_build_object('queued', n, 'skipped', skipped);
end $$;
revoke all on function public._oos_notify_event(bigint) from public, anon, authenticated;

create or replace function public.oos_replies_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; ono text; its jsonb; o record; rid bigint; eid bigint; top text; amt text; found_n int := 0; e record;
begin
  if auth.jwt() is not null and not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  for d in select m.msg_id, m.subject, m.body, m.at, m.kind, m.amount from public.mail_documents m
           where m.supplier ilike '%dbd%' and m.kind in ('notice', 'message', 'invoice') and m.at > now() - interval '45 days' and m.subject ~ 'TRS-PO-\d\d-\d{4}'
           order by m.at loop
    ono := substring(d.subject from 'TRS-PO-\d\d-\d{4}');
    select * into o from public.oos_supplier_orders x where x.order_no = ono;
    if not found or o.status = 'cancelled' then continue; end if;
    its := public.oos_parse_items(d.body);
    top := split_part(replace(coalesce(d.body, ''), E'\r', ''), E'\nFrom:', 1);

    -- 1. DBD's out-of-stock list (also when it comes with the invoice)
    if jsonb_array_length(its) > 0 and d.kind in ('notice', 'message', 'invoice') then
      rid := null;
      insert into public.oos_order_replies (order_no, msg_id, replied_at, items) values (ono, d.msg_id, d.at, its)
        on conflict (msg_id) do nothing returning id into rid;
      if rid is not null then
        found_n := found_n + 1;
        if o.status in ('confirmed', 'sent', 'oos_reply', 'oos_confirmed') then
          update public.oos_supplier_orders set status = 'oos_reply',
                 history = history || jsonb_build_array(jsonb_build_object('status', 'oos_reply', 'by', 'DBD', 'at', d.at, 'items', jsonb_array_length(its)))
           where order_no = ono;
        end if;
        insert into public.oos_events (order_no, branch, kind, payload) values (ono, o.branch, 'oos_reply', jsonb_build_object('msg_id', d.msg_id, 'items', jsonb_array_length(its)))
          on conflict do nothing;
      end if;
    end if;

    -- 2. the invoice
    if d.kind = 'invoice' then
      eid := null; amt := case when d.amount is not null and d.amount > 0 then d.amount::text end;
      insert into public.oos_events (order_no, branch, kind, payload) values (ono, o.branch, 'invoice', jsonb_strip_nulls(jsonb_build_object('msg_id', d.msg_id, 'amount', amt)))
        on conflict do nothing returning id into eid;
      if eid is not null then
        update public.oos_supplier_orders set status = 'invoiced',
               history = history || jsonb_build_array(jsonb_build_object('status', 'invoiced', 'by', 'DBD', 'at', d.at, 'amount', amt))
         where order_no = ono;
        found_n := found_n + 1;
      end if;

    -- 3. on the way (a DBD mail that is neither a list of items nor an invoice)
    elsif jsonb_array_length(its) = 0 and top ~* 'on the way|on its way|out for delivery|dispatched|being delivered|delivering (it )?today|will be delivered (today|tomorrow)|delivery (today|tomorrow)' then
      eid := null;
      insert into public.oos_events (order_no, branch, kind, payload) values (ono, o.branch, 'on_the_way', jsonb_build_object('msg_id', d.msg_id))
        on conflict do nothing returning id into eid;
      if eid is not null then
        if o.status in ('confirmed', 'sent', 'oos_reply', 'oos_confirmed') then
          update public.oos_supplier_orders set status = 'on_the_way',
                 history = history || jsonb_build_array(jsonb_build_object('status', 'on_the_way', 'by', 'DBD', 'at', d.at))
           where order_no = ono;
        end if;
        found_n := found_n + 1;
      end if;
    end if;
  end loop;
  for e in select id from public.oos_events where notified_at is null and created_at > now() - interval '3 days' order by id loop
    begin perform public._oos_notify_event(e.id); exception when others then null; end;
  end loop;
  return jsonb_build_object('ok', true, 'new', found_n);
end $$;
revoke all on function public.oos_replies_scan() from public, anon;
grant execute on function public.oos_replies_scan() to authenticated;

-- by hand: someone was told by DBD another way (a call, a WhatsApp) that it is on the way. Nobody is messaged (the person doing it knows).
create or replace function public.oos_order_mark_on_the_way(p_order_no text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare who text := coalesce(auth.jwt() ->> 'email', 'unknown'); o record;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  select * into o from public.oos_supplier_orders where order_no = p_order_no;
  if not found then raise exception 'no such order'; end if;
  if o.status = 'on_the_way' then return jsonb_build_object('ok', true, 'already', true); end if;
  if o.status not in ('sent', 'oos_reply', 'oos_confirmed') then return jsonb_build_object('refused', true, 'status', o.status); end if;
  update public.oos_supplier_orders set status = 'on_the_way',
         history = history || jsonb_build_array(jsonb_build_object('status', 'on_the_way', 'by', who, 'at', now(), 'manual', true))
   where order_no = p_order_no;
  insert into public.oos_events (order_no, branch, kind, payload, notified_at) values (p_order_no, o.branch, 'on_the_way', jsonb_build_object('msg_id', 'manual-' || p_order_no, 'manual', true), now())
    on conflict do nothing;
  return jsonb_build_object('ok', true, 'order_no', p_order_no);
end $$;
revoke all on function public.oos_order_mark_on_the_way(text) from public, anon;
grant execute on function public.oos_order_mark_on_the_way(text) to authenticated;

create or replace function public.oos_orders_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('day', public.oos_order_day(),
    'can_edit', coalesce((public.spend_access() ->> 'edit')::boolean, false),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('order_no', o.order_no, 'supplier', o.supplier, 'branch', o.branch, 'day', o.order_day, 'status', o.status,
                        'n_lines', o.n_lines, 'n_units', o.n_units, 'total_aed', o.total_aed, 'by', o.confirmed_by, 'at', o.confirmed_at,
                        'sent_by', o.sent_by, 'sent_at', o.sent_at,
                        'oos_items', (select jsonb_array_length(r.items) from public.oos_order_replies r where r.order_no = o.order_no order by r.replied_at desc limit 1),
                        'oos_decided', (select r.decisions is not null from public.oos_order_replies r where r.order_no = o.order_no order by r.replied_at desc limit 1),
                        'invoice_amount', (select v.payload ->> 'amount' from public.oos_events v where v.order_no = o.order_no and v.kind = 'invoice' order by v.id desc limit 1))
                        order by o.confirmed_at desc)
                        from public.oos_supplier_orders o where o.confirmed_at > now() - interval '45 days'), '[]'::jsonb));
end $$;
revoke all on function public.oos_orders_get() from public, anon;
grant execute on function public.oos_orders_get() to authenticated;
