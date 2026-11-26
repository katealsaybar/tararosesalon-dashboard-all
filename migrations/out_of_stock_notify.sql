-- APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_notify). Switch OFF (oos_notify_config.enabled = false) and template tr_oos_reply NOT approved yet: nothing is sent. Checked in a rolled-back run: the event waits while off, waits when on but unapproved, then queues exactly one WhatsApp to Shiela (Motor City) on channel 572200, and a second scan does not double it. Cron oos-replies-scan every 10 minutes is scheduled.
-- Out of Stock: tell the salon coordinator on WhatsApp when DBD replies with out-of-stock items (Kate, 26 Nov 2026, step 4 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md:
-- "when dbd replies for something out of stock, salon coordinators get notified through whatsapp so they check the dashboard"; "from tara rose salon main beh";
-- "yung phone numbers nila beh meron na tayong database").
--
-- Reuses what is already built: the numbers are in staff_phones, the sending is the staff WhatsApp queue (staff_wa_jobs, sent by the staff-wa-worker inside its 09:00 to 20:59 Dubai window)
-- from the MAIN number (respond.io channel 572200, "WhatsApp Brand Account", the same one the Recruitment messages use). This only QUEUES a row per coordinator.
-- It starts OFF and needs its template approved by Meta first (approved = false), exactly like the Recruitment ones:
--   1. create the template in respond.io on the main number (Settings, Channels, WhatsApp Brand Account, Templates), name tr_oos_reply, category Utility, English (UK), footer Tara Rose Salons;
--      body below; sample values: Jhoana / 3 items / TRS-PO-26-0007 / Motor City / https://trk-salon-os.com/?view=out-of-stock
--   2. when Meta approves it:  update staff_wa_templates set approved = true where key = 'oos_reply';
--   3. switch it on:           update oos_notify_config set enabled = true where id = 1;
-- Until both, the event waits in oos_events (notified_at null) and is sent once both are done (oos_replies_scan sends the waiting ones every time it runs).
--
-- Who is told: oos_notify_recipients, role coordinator, one per salon: Cristine Bracamonte (Saadiyat), Jhoana Cairel (Khalifa City A), Shiela Avena (Motor City), Frances Pia Sergio (Al Quoz),
-- read from their Salon Coordinator position on the staff list, 26 Nov 2026. Their numbers are NOT copied: they are read from staff_phones when the message is queued.
-- The accounts people (Jumera, Ann) are added for the invoice message in step 5.
--
-- A cron job oos-replies-scan runs oos_replies_scan() every 10 minutes (it only reads mail_documents and writes oos_* tables; nothing is sent while the switch is off).
-- Undo: select cron.unschedule('oos-replies-scan');

create table if not exists public.oos_notify_config (
  id         int primary key default 1 check (id = 1),
  enabled    boolean not null default false,
  channel_id bigint not null default 572200,
  updated_at timestamptz not null default now()
);
insert into public.oos_notify_config (id) values (1) on conflict (id) do nothing;
alter table public.oos_notify_config enable row level security;
revoke all on public.oos_notify_config from public, anon, authenticated;

alter table public.oos_notify_recipients add column if not exists staff_id bigint references public.staff_phones (id);
create unique index if not exists oos_notify_recipients_one on public.oos_notify_recipients (role, branch_code, staff_id);
insert into public.oos_notify_recipients (name, role, branch_code, staff_id, wa_on)
select s.name, 'coordinator', v.b, s.id, true
from (values (24, 'SAA'), (23, 'KCA'), (25, 'MC'), (26, 'AQ')) v (sid, b)
join public.staff_phones s on s.id = v.sid
on conflict do nothing;

insert into public.staff_wa_templates (key, kind, label, respond_name, language, body, footer, vars, sort) values
('oos_reply', 'campaign', 'DBD out of stock reply (Out of Stock)', 'tr_oos_reply', 'en_GB',
$b$Hi {{1}}, DBD has replied to order {{3}} for {{4}}: {{2}} out of stock. Please open the Out of Stock page and confirm with DBD what we do with them: {{5}}

Thank you.$b$, 'Tara Rose Salons', array['first_name', 'items', 'order_no', 'salon', 'link'], 23)
on conflict (key) do nothing;

-- Internal: queue the WhatsApp of one event. Returns what happened; leaves the event waiting when it is off or the template is not approved.
create or replace function public._oos_notify_event(p_event_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev public.oos_events; cfg public.oos_notify_config; t public.staff_wa_templates; r record; s public.staff_phones; ph text; vp text[]; n int := 0; skipped jsonb := '[]'::jsonb;
  salon text; items text;
begin
  select * into ev from public.oos_events where id = p_event_id;
  if not found then return jsonb_build_object('queued', 0, 'reason', 'no event'); end if;
  if ev.notified_at is not null then return jsonb_build_object('queued', 0, 'reason', 'already told'); end if;
  select * into cfg from public.oos_notify_config where id = 1;
  if not coalesce(cfg.enabled, false) then return jsonb_build_object('queued', 0, 'reason', 'off'); end if;
  select * into t from public.staff_wa_templates where key = case ev.kind when 'oos_reply' then 'oos_reply' end;
  if not found or not t.approved then return jsonb_build_object('queued', 0, 'reason', 'template_not_approved'); end if;
  salon := case ev.branch when 'SAA' then 'Saadiyat' when 'KCA' then 'Khalifa City A' when 'MC' then 'Motor City' when 'AQ' then 'Al Quoz' else ev.branch end;
  items := (ev.payload ->> 'items') || case when (ev.payload ->> 'items') = '1' then ' item' else ' items' end;
  for r in select * from public.oos_notify_recipients where active and wa_on and role = 'coordinator' and branch_code = ev.branch and staff_id is not null loop
    select * into s from public.staff_phones where id = r.staff_id;
    ph := regexp_replace(coalesce(s.phone, ''), '\D', '', 'g');
    if not found or length(ph) < 9 or length(ph) > 15 then skipped := skipped || jsonb_build_object('name', r.name, 'reason', 'not a usable number'); continue; end if;
    vp := array[public.staff_wa_first_name(s.name), items, ev.order_no, salon, 'https://trk-salon-os.com/?view=out-of-stock'];
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

-- the scan of out_of_stock_dbd_reply.sql, now also telling the coordinators (a failure to queue never stops the scan)
create or replace function public.oos_replies_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; ono text; its jsonb; o record; rid bigint; eid bigint; found_n int := 0; e record;
begin
  if auth.jwt() is not null and not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  for d in select m.msg_id, m.subject, m.body, m.at from public.mail_documents m
           where m.supplier ilike '%dbd%' and m.kind in ('notice', 'message') and m.at > now() - interval '45 days' and m.subject ~ 'TRS-PO-\d\d-\d{4}'
           order by m.at loop
    ono := substring(d.subject from 'TRS-PO-\d\d-\d{4}');
    select * into o from public.oos_supplier_orders x where x.order_no = ono;
    if not found or o.status = 'cancelled' then continue; end if;
    its := public.oos_parse_items(d.body);
    if jsonb_array_length(its) = 0 then continue; end if;
    insert into public.oos_order_replies (order_no, msg_id, replied_at, items) values (ono, d.msg_id, d.at, its)
      on conflict (msg_id) do nothing returning id into rid;
    if rid is null then continue; end if;
    found_n := found_n + 1;
    if o.status in ('confirmed', 'sent', 'oos_reply', 'oos_confirmed') then
      update public.oos_supplier_orders set status = 'oos_reply',
             history = history || jsonb_build_array(jsonb_build_object('status', 'oos_reply', 'by', 'DBD', 'at', d.at, 'items', jsonb_array_length(its)))
       where order_no = ono;
    end if;
    insert into public.oos_events (order_no, branch, kind, payload) values (ono, o.branch, 'oos_reply', jsonb_build_object('msg_id', d.msg_id, 'items', jsonb_array_length(its)))
      on conflict do nothing;
    rid := null;
  end loop;
  -- tell the coordinators of every reply still waiting to be told (new ones, and old ones once the switch and the template are ready)
  for e in select id from public.oos_events where notified_at is null and kind = 'oos_reply' and created_at > now() - interval '3 days' order by id loop
    begin perform public._oos_notify_event(e.id); exception when others then null; end;
  end loop;
  return jsonb_build_object('ok', true, 'new_replies', found_n);
end $$;
revoke all on function public.oos_replies_scan() from public, anon;
grant execute on function public.oos_replies_scan() to authenticated;

select cron.schedule('oos-replies-scan', '*/10 * * * *', 'select public.oos_replies_scan()');
