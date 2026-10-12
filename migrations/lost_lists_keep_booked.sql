-- Lost Clients: a client with a booking stays on her group, with the date of her next appointment
-- (Kate, 12 Oct 2026: a Next appointment column, 3 months at most after today).
--
-- Until now lost_lists_core() took anyone with a booking OUT of groups 1 to 5 (flags f1..f5 all needed
-- bkd is null), so a Next appointment column could only ever be empty. The flags no longer look at the
-- booking: the group tables show her, with booked_on (her next booking from today, any UAE branch;
-- client_bookings is pulled today to 90 days ahead, so it is never more than 3 months away).
--
-- What stays the same, on purpose: nobody with a booking is messaged.
--   * lost_queue() (To message) now says "and c.booked_on is null" itself; its counts and rows are what they were.
--   * lost_lists_summary(): the cards' n, area split and WhatsApp mix still count only clients WITHOUT a booking
--     (the sendable ones), so the card numbers do not move; 'booked' is new, the number of booked clients per group.
--   * the page leaves booked clients out of Copy numbers and the xlsx/csv files (lost-lists.js).
-- 'held' (lost and booked) is unchanged. Additive: same columns, same signatures.

create or replace function public.lost_lists_core()
 returns table(client_key text, client_name text, area text, branch text, last_visit date, days_since integer, last_keratin date, last_colour date, last_toner date, cats text, stylist text, also_saw text, mobile text, n_numbers integer, wa text, last_in date, last_out date, booked_on date, f1 boolean, f2 boolean, f3 boolean, f4 boolean, f5 boolean, held boolean)
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
#variable_conflict use_column
declare lvl int; cfg lost_lists_config;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 2 then raise exception 'Lost Clients is for Level 2 and above'; end if;
  select * into cfg from lost_lists_config where id = 1;
  return query
  with bk as (
    select public.stl_key_fold(b.client_key) as k, min(b.date) as booked_on from client_bookings b where b.date >= current_date group by 1
  ), ws as (
    select b.client_key as k,
           bool_or(w.is_blocked) as blk,
           bool_or(w.found and w.last_in > now() - interval '365 days') as a12,
           bool_or(w.found and w.last_in > now() - interval '548 days') as a18,
           bool_or(w.found) as fnd,
           bool_or(w.err like 'contact 400') as inv,
           bool_or(w.checked_at is not null and w.err is null) as okk,
           bool_or(w.checked_at is not null) as chk,
           max(w.last_in) as li, max(w.last_out) as lo
    from lost_lists_base b
    cross join lateral unnest(string_to_array(b.phones, ' / ')) as x
    left join lost_wa_status w on w.phone = btrim(x)
    where b.phones is not null group by b.client_key
  ), j as (
    select b.*, bk.booked_on as bkd,
      case when b.phones is null then 'nonum'
           when ws.blk then 'blocked'
           when ws.a12 then 'act'
           when ws.a18 then 'r18'
           when ws.fnd then 'noreply'
           when not coalesce(ws.chk, false) then 'unchecked'
           when ws.inv and not ws.okk then 'nonum'
           else 'text' end as st,
      ws.li, ws.lo,
      (b.last_visit < current_date - cfg.lost_days) as lost,
      (b.last_colour is not null or b.last_toner is not null) as hascol
    from lost_lists_base b left join bk on bk.k = b.client_key left join ws on ws.k = b.client_key
  )
  select j.client_key, j.client_name, j.area, j.last_branch, j.last_visit, (current_date - j.last_visit)::int,
         j.last_keratin, j.last_colour, j.last_toner, j.cats, j.stylist, j.also_saw,
         case when lvl >= 3 then j.phones end, coalesce(array_length(string_to_array(j.phones, ' / '), 1), 0), j.st,
         j.li::date, j.lo::date, j.bkd,
         (j.lost and j.last_keratin between cfg.window_from and cfg.window_to),
         (j.last_keratin >= cfg.window_from and j.last_keratin < current_date - cfg.lost_days),
         (j.lost and j.hascol),
         (j.lost and j.st in ('act','r18','noreply')),
         (j.lost and j.last_other is not null and not j.hascol),
         (j.lost and j.bkd is not null)
  from j;
end $function$;

create or replace function public.lost_lists_summary()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare out jsonb;
begin
  with c as (select * from public.lost_lists_core()),
  l as (
    select '1' as id, c.* from c where c.f1 union all select '2', c.* from c where c.f2 union all
    select '3', c.* from c where c.f3 union all select '4', c.* from c where c.f4 union all
    select '5', c.* from c where c.f5 union all select 'held', c.* from c where c.held
  ), s as (select * from l where l.booked_on is null or l.id = 'held')
  select jsonb_build_object(
    'lists', (select jsonb_object_agg(id, jsonb_build_object('n', n, 'dubai', dubai, 'abu_dhabi', ad, 'wa', wa,
                     'booked', (select count(*) from l b where b.id = z.id and b.booked_on is not null)))
              from (select id, count(*) as n, count(*) filter (where area = 'Dubai') as dubai, count(*) filter (where area = 'Abu Dhabi') as ad,
                           jsonb_object_agg(wa, k) as wa
                    from (select id, area, wa, count(*) over (partition by id, wa) as k from s) q group by id) z),
    'fresh', jsonb_build_object(
      'sales_to', (select max(date) from sales_transaction_lines where branch in ('SAA','KCA','MC','AQ')),
      'bookings_pulled', (select max(pulled_on) from client_bookings),
      'wa_checked', (select max(checked_at) from lost_wa_status),
      'base_built', (select max(refreshed_at) from lost_lists_base),
      'campaign_from', (select campaign_from from lost_lists_config where id = 1)))
  into out;
  return out;
end $function$;

create or replace function public.lost_queue()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare lvl int; since date; lostd int; out jsonb;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 3 then raise exception 'To message is for Level 3 and above'; end if;
  select campaign_from, lost_days into since, lostd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core()),
  mk as (
    select distinct on (x.client_key) x.client_key, x.sent_on, x.sent_by
    from lost_messaged x where x.list_id = 'q' order by x.client_key, x.id desc
  ),
  q as (
    select c.*, m.sent_on as mk_on, m.sent_by as mk_by,
      case when c.f3 then 'colour'
           when c.f1 or c.f2 then (case when c.f1 or c.last_visit < current_date - lostd then 'smoothing_lost' else 'smoothing_still' end)
           when c.f5 then 'other' else 'catchall' end as qtype,
      greatest(case when c.last_out >= since then c.last_out end, m.sent_on) as sent_date
    from c left join mk m on m.client_key = c.client_key
    where (c.f1 or c.f2 or c.f3 or c.f4 or c.f5) and c.booked_on is null
  )
  select jsonb_build_object(
    'campaign_from', since,
    'held', (select count(*) from c where c.held),
    'skipped', jsonb_build_object('nonum', count(*) filter (where q.wa = 'nonum'), 'blocked', count(*) filter (where q.wa = 'blocked'),
                                  'unchecked', count(*) filter (where q.wa = 'unchecked')),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'client_key', q.client_key, 'client_name', q.client_name, 'area', q.area, 'branch', q.branch,
      'last_visit', q.last_visit, 'days_since', q.days_since, 'last_keratin', q.last_keratin, 'last_colour', q.last_colour,
      'last_toner', q.last_toner, 'stylist', q.stylist, 'also_saw', q.also_saw, 'mobile', q.mobile, 'n_numbers', q.n_numbers,
      'wa', q.wa, 'last_in', q.last_in, 'last_out', q.last_out, 'qtype', q.qtype,
      'also_on', (select jsonb_agg(v) from (values (case when q.f1 then '1' end), (case when q.f2 then '2' end), (case when q.f3 then '3' end),
                   (case when q.f4 then '4' end), (case when q.f5 then '5' end)) t(v) where v is not null),
      'messaged', q.sent_date is not null,
      'sent_on', q.sent_date,
      'sent_by', case when q.sent_date is null then null when q.mk_on = q.sent_date then coalesce(q.mk_by, 'marked') else 'respond.io' end,
      'by_mark', (q.mk_on is not null and q.mk_on = q.sent_date),
      'replied', (q.sent_date is not null and q.last_in is not null and q.last_in >= q.sent_date)
    ) order by q.last_visit desc) filter (where q.wa in ('act', 'r18', 'noreply', 'text')), '[]'::jsonb))
  into out from q;
  return out;
end $function$;
