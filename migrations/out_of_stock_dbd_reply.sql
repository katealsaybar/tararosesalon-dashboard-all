-- APPLIED 26 Nov 2026 to project gvijxenafoowajqktqvd (migration out_of_stock_dbd_reply). Checked in a rolled-back run with the real Motor City reply of 23 Nov (3 items read), scan twice (one new reply, then none), an incomplete decision refused, a full one saved, mark sent, mark sent again refused. All tables left empty.
-- Out of Stock: DBD's out-of-stock reply, and our confirmation of it (Kate, 26 Nov 2026, step 4 of docs/OOS-DBD-ORDER-WORKFLOW-SPEC-26NOV-2026.md).
-- Needs out_of_stock_supplier_orders.sql and out_of_stock_order_sent.sql (APPLIED 26 Nov 2026).
--
-- How a reply is found: the Orders and Receipts page already reads every mail of info@ into mail_documents (hourly). DBD keeps our subject when it replies, so a reply to
-- "TRS-PO-26-0001 | ORDER | SAADIYAT | 30 Nov 2026" carries the order number. oos_replies_scan() looks at DBD's mails of the last 45 days (kind notice or message) whose subject has a
-- TRS-PO number, reads the table DBD puts in it (itemcode, itemname, ordqty: Jonnah's list of out-of-stock items) and, when it finds items, stores the reply and turns the order
-- to oos_reply. A mail with no items in it changes nothing. It is safe to run any number of times (a reply is stored once, by its message id).
--
-- oos_order_replies   one row per DBD out-of-stock reply: items [{code, name, qty}], then our decision per item once someone has made it:
--                     decisions [{code, action: cancel | wait | replace, replace_with}]. No policy, no grant: only the functions touch it.
-- oos_events          what the coordinators and accounts have to be told (kind oos_reply now; on_the_way and invoice in step 5), one row per event; notified_at stays null until a
--                     sender (WhatsApp, a later step) has told them. The page shows the event too, so nothing depends on the sender.
-- oos_notify_recipients  who is told what, by salon (role coordinator or accounts, WhatsApp number). EMPTY: it is for Kate to fill, nothing is sent from here.
-- oos_parse_items()   the reading of DBD's table.
-- oos_replies_scan()  read gate = oos_access() (or an internal call). Returns how many new replies it found.
-- oos_reply_decide()  write gate = spend_access edit. Every item must be given an action; replace needs the product to take instead.
-- oos_oos_mark_sent() write gate. The person pressed Send on the confirmation email: the order turns oos_confirmed.
-- oos_order_replies_get()  the replies of one order, newest first.
-- oos_orders_get() now also returns, per order, oos_items (items DBD says are out of stock, newest reply) and oos_decided (our decision is saved).

create table if not exists public.oos_order_replies (
  id            bigint generated always as identity primary key,
  order_no      text not null references public.oos_supplier_orders (order_no),
  msg_id        text not null unique,
  replied_at    timestamptz not null,
  items         jsonb not null,
  decisions     jsonb,
  decided_by    text,
  decided_at    timestamptz,
  confirm_sent_by text,
  confirm_sent_at timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.oos_order_replies enable row level security;
revoke all on public.oos_order_replies from public, anon, authenticated;
create index if not exists oos_order_replies_order on public.oos_order_replies (order_no, replied_at desc);

create table if not exists public.oos_events (
  id          bigint generated always as identity primary key,
  order_no    text not null,
  branch      text not null,
  kind        text not null check (kind in ('oos_reply', 'on_the_way', 'invoice')),
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.oos_events enable row level security;
revoke all on public.oos_events from public, anon, authenticated;
create unique index if not exists oos_events_once on public.oos_events (order_no, kind, (payload ->> 'msg_id'));

create table if not exists public.oos_notify_recipients (
  id          bigint generated always as identity primary key,
  name        text not null,
  role        text not null check (role in ('coordinator', 'accounts')),
  branch_code text check (branch_code in ('KCA', 'SAA', 'MC', 'AQ')),
  phone       text,
  wa_on       boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.oos_notify_recipients enable row level security;
revoke all on public.oos_notify_recipients from public, anon, authenticated;

create or replace function public.oos_parse_items(p_body text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare top text; ls text[]; n int; i int := 1; out jsonb := '[]'::jsonb;
begin
  top := split_part(replace(coalesce(p_body, ''), E'\r', ''), E'\nFrom:', 1);   -- DBD's table is above the quoted original
  ls := array(select trim(x) from regexp_split_to_table(top, E'\n') x where trim(x) <> '');
  n := coalesce(array_length(ls, 1), 0);
  while i <= n - 2 loop
    if ls[i] ~ '^\d{6,8}$' and ls[i + 1] !~ '^\d+$' and ls[i + 2] ~ '^\d{1,5}$' then
      out := out || jsonb_build_array(jsonb_build_object('code', ls[i], 'name', ls[i + 1], 'qty', ls[i + 2]::int));
      i := i + 3;
    else
      i := i + 1;
    end if;
  end loop;
  return out;
end $$;

create or replace function public.oos_replies_scan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; ono text; its jsonb; o record; rid bigint; found_n int := 0;
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
  return jsonb_build_object('ok', true, 'new_replies', found_n);
end $$;
revoke all on function public.oos_replies_scan() from public, anon;
grant execute on function public.oos_replies_scan() to authenticated;

create or replace function public.oos_order_replies_get(p_order_no text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((public.oos_access() ->> 'view')::boolean, false) then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('replies', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'at', r.replied_at, 'items', r.items, 'decisions', r.decisions,
            'decided_by', r.decided_by, 'decided_at', r.decided_at, 'confirm_sent_at', r.confirm_sent_at) order by r.replied_at desc)
         from public.oos_order_replies r where r.order_no = p_order_no), '[]'::jsonb));
end $$;
revoke all on function public.oos_order_replies_get(text) from public, anon;
grant execute on function public.oos_order_replies_get(text) to authenticated;

create or replace function public.oos_reply_decide(p_reply_id bigint, p_decisions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare who text := coalesce(auth.jwt() ->> 'email', 'unknown'); r record; it jsonb; dc jsonb; clean jsonb := '[]'::jsonb;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  select * into r from public.oos_order_replies where id = p_reply_id;
  if not found then raise exception 'no such reply'; end if;
  if r.confirm_sent_at is not null then return jsonb_build_object('refused', true, 'why', 'already sent'); end if;
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'array' then raise exception 'decisions must be a list'; end if;
  for it in select * from jsonb_array_elements(r.items) loop
    select x into dc from jsonb_array_elements(p_decisions) x where x ->> 'code' = it ->> 'code' limit 1;
    if dc is null or coalesce(dc ->> 'action', '') not in ('cancel', 'wait', 'replace') then raise exception 'item % has no decision', it ->> 'code'; end if;
    if dc ->> 'action' = 'replace' and length(btrim(coalesce(dc ->> 'replace_with', ''))) = 0 then raise exception 'item % needs the product to take instead', it ->> 'code'; end if;
    clean := clean || jsonb_build_array(jsonb_build_object('code', it ->> 'code', 'action', dc ->> 'action', 'replace_with', nullif(left(btrim(coalesce(dc ->> 'replace_with', '')), 200), '')));
  end loop;
  update public.oos_order_replies set decisions = clean, decided_by = who, decided_at = now() where id = p_reply_id;
  return jsonb_build_object('ok', true, 'decisions', clean);
end $$;
revoke all on function public.oos_reply_decide(bigint, jsonb) from public, anon;
grant execute on function public.oos_reply_decide(bigint, jsonb) to authenticated;

create or replace function public.oos_oos_mark_sent(p_order_no text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare who text := coalesce(auth.jwt() ->> 'email', 'unknown'); st text; rid bigint;
begin
  if not coalesce((public.spend_access() ->> 'edit')::boolean, false) then return jsonb_build_object('denied', true); end if;
  select status into st from public.oos_supplier_orders where order_no = p_order_no;
  if st is null then raise exception 'no such order'; end if;
  if st <> 'oos_reply' then return jsonb_build_object('refused', true, 'status', st); end if;
  select id into rid from public.oos_order_replies where order_no = p_order_no and decisions is not null and confirm_sent_at is null order by replied_at desc limit 1;
  if rid is null then return jsonb_build_object('refused', true, 'why', 'no saved decision'); end if;
  update public.oos_order_replies set confirm_sent_by = who, confirm_sent_at = now() where id = rid;
  update public.oos_supplier_orders set status = 'oos_confirmed',
         history = history || jsonb_build_array(jsonb_build_object('status', 'oos_confirmed', 'by', who, 'at', now()))
   where order_no = p_order_no;
  return jsonb_build_object('ok', true, 'order_no', p_order_no);
end $$;
revoke all on function public.oos_oos_mark_sent(text) from public, anon;
grant execute on function public.oos_oos_mark_sent(text) to authenticated;

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
                        'oos_decided', (select r.decisions is not null from public.oos_order_replies r where r.order_no = o.order_no order by r.replied_at desc limit 1))
                        order by o.confirmed_at desc)
                        from public.oos_supplier_orders o where o.confirmed_at > now() - interval '45 days'), '[]'::jsonb));
end $$;
revoke all on function public.oos_orders_get() from public, anon;
grant execute on function public.oos_orders_get() to authenticated;
