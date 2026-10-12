-- Lost Clients: clients who opted out on WhatsApp are not messaged (Kate, 12 Oct 2026, Cristine's question: "yung mga previous blast noon pa ... merong
-- mga clients na nag-indicate na 'Do not disturb', 'Do not contact me', 'I'm not interested', 'Stop'. Kasama na ba sila dito?"). They were not: only
-- respond.io's Blocked flag (0 numbers) kept anyone out. The opt-outs are most likely in respond.io (the replies, the contact's tags).
--
-- respond-status-sync (edge function, nightly, already reads each contact and its last 50 messages) now also looks for an opt-out:
--   * an incoming message that is only STOP / UNSUBSCRIBE, or says do not contact / do not disturb / don't message / not interested / remove me / opt out / leave me alone
--   * a contact tag or lifecycle that says dnd / do not contact / unsubscribed / opt out / stop / not interested
-- and keeps opted_out, the matched word (opt_phrase, never the message), when (opt_at, the message time; null for a tag) and the contact's tags in lost_wa_status.
-- A client opted out counts only if the opt-out is not older than her last visit (if she came back since, she is welcome again).
--   * lost_lists_core_x: a new wa status 'optout' (after 'blocked'): the page shows Opted out, To message and the site sending skip her
--   * lost_queue(): skipped.optout counts them; lost_sheet_rows(): sends the wa status so the sheet's Status says so
--   * lost_wa_save(): stores the new fields, and also writes the number into lost_send_optout so site sending can never queue it
-- Additive.

alter table public.lost_wa_status add column if not exists opted_out boolean not null default false;
alter table public.lost_wa_status add column if not exists opt_phrase text;
alter table public.lost_wa_status add column if not exists opt_at timestamptz;
alter table public.lost_wa_status add column if not exists opt_source text;
alter table public.lost_wa_status add column if not exists tags text[];

create or replace function public.lost_wa_save(p_rows jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare n int;
begin
  insert into lost_wa_status (phone, found, contact_id, is_blocked, last_in, last_out, err, checked_at, opted_out, opt_phrase, opt_at, opt_source, tags)
  select r->>'phone', coalesce((r->>'found')::boolean, false), nullif(r->>'contact_id', '')::bigint, coalesce((r->>'is_blocked')::boolean, false),
         to_timestamp(nullif(r->>'last_in', '')::double precision), to_timestamp(nullif(r->>'last_out', '')::double precision), r->>'err', now(),
         coalesce((r->>'opted_out')::boolean, false), r->>'opt_phrase', to_timestamp(nullif(r->>'opt_at', '')::double precision), r->>'opt_source',
         case when jsonb_typeof(r->'tags') = 'array' then (select array_agg(x) from jsonb_array_elements_text(r->'tags') x) end
  from jsonb_array_elements(p_rows) r
  on conflict (phone) do update set found = excluded.found, contact_id = excluded.contact_id, is_blocked = excluded.is_blocked,
    last_in = excluded.last_in, last_out = excluded.last_out, err = excluded.err, checked_at = excluded.checked_at,
    opted_out = excluded.opted_out, opt_phrase = excluded.opt_phrase, opt_at = excluded.opt_at, opt_source = excluded.opt_source, tags = excluded.tags;
  get diagnostics n = row_count;
  insert into lost_send_optout (phone, reason, added_by)
  select r->>'phone', left('respond.io: ' || coalesce(r->>'opt_source', '') || ' ' || coalesce(r->>'opt_phrase', ''), 120), 'respond-status-sync'
  from jsonb_array_elements(p_rows) r where coalesce((r->>'opted_out')::boolean, false)
  on conflict (phone) do nothing;
  return n;
end $function$;

create or replace function public.lost_lists_core_x(p_lvl int)
 returns table(client_key text, client_name text, area text, branch text, last_visit date, days_since integer, last_keratin date, last_colour date, last_toner date, cats text, stylist text, also_saw text, mobile text, n_numbers integer, wa text, last_in date, last_out date, booked_on date, f1 boolean, f2 boolean, f3 boolean, f4 boolean, f5 boolean, held boolean)
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
#variable_conflict use_column
declare lvl int := p_lvl; cfg lost_lists_config;
begin
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
           max(case when w.opted_out then coalesce(w.opt_at, 'infinity'::timestamptz) end) as opt_at,
           max(w.last_in) as li, max(w.last_out) as lo
    from lost_lists_base b
    cross join lateral unnest(string_to_array(b.phones, ' / ')) as x
    left join lost_wa_status w on w.phone = btrim(x)
    where b.phones is not null group by b.client_key
  ), j as (
    select b.*, bk.booked_on as bkd,
      case when b.phones is null then 'nonum'
           when ws.blk then 'blocked'
           when ws.opt_at is not null and (ws.opt_at = 'infinity'::timestamptz or ws.opt_at::date >= b.last_visit) then 'optout'
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

create or replace function public.lost_queue()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare lvl int; since date; lostd int; rd int; out jsonb;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 3 then raise exception 'To message is for Level 3 and above'; end if;
  select campaign_from, lost_days, recent_days into since, lostd, rd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core()),
  mk as (
    select distinct on (x.client_key) x.client_key, x.sent_on, x.sent_by
    from lost_messaged x where x.list_id = 'q' order by x.client_key, x.id desc
  ),
  q0 as (
    select c.* from c where (c.f1 or c.f2 or c.f3 or c.f4 or c.f5) and c.booked_on is null and c.last_visit < current_date - rd
  ),
  q as (
    select c.*, m.sent_on as mk_on, m.sent_by as mk_by,
      case when c.f3 then 'colour'
           when c.f1 or c.f2 then (case when c.f1 or c.last_visit < current_date - lostd then 'smoothing_lost' else 'smoothing_still' end)
           when c.f5 then 'other' else 'catchall' end as qtype,
      greatest(case when c.last_out >= since then c.last_out end, m.sent_on) as sent_date
    from q0 c left join mk m on m.client_key = c.client_key
    where not exists (select 1 from lost_excluded e where e.client_key = c.client_key)
  )
  select jsonb_build_object(
    'campaign_from', since,
    'held', (select count(*) from c where c.held),
    'recent', (select count(*) from c where (c.f1 or c.f2 or c.f3 or c.f4 or c.f5) and c.booked_on is null and c.last_visit >= current_date - rd),
    'recent_days', rd,
    'excluded', (select count(*) from q0 where exists (select 1 from lost_excluded e where e.client_key = q0.client_key)),
    'review', (select coalesce(jsonb_object_agg(r.branch, jsonb_build_object('by', r.signed_by, 'at', r.signed_at)), '{}'::jsonb) from lost_review r),
    'skipped', jsonb_build_object('nonum', count(*) filter (where q.wa = 'nonum'), 'blocked', count(*) filter (where q.wa = 'blocked'),
                                  'unchecked', count(*) filter (where q.wa = 'unchecked'),
                                  'optout', count(*) filter (where q.wa = 'optout')),
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

create or replace function public.lost_sheet_rows(p_pass uuid, p_branch text) returns jsonb
language plpgsql stable security definer
set search_path to 'public' set statement_timeout to '60s'
as $function$
declare out jsonb; rd int;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_branch not in ('SAA','KCA','MC','AQ') then raise exception 'unknown branch'; end if;
  select recent_days into rd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core_x(3) co
             where co.branch = p_branch and (co.f1 or co.f2 or co.f3 or co.f4 or co.f5))
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', c.client_key, 'client_name', c.client_name, 'area', c.area, 'last_visit', c.last_visit,
      'last_service', greatest(c.last_keratin, c.last_colour, c.last_toner, b.last_other),
      'stylist', c.stylist, 'also_saw', c.also_saw, 'booked_on', c.booked_on, 'recent', (c.last_visit >= current_date - rd),
      'mobile', c.mobile, 'n_numbers', c.n_numbers, 'wa', c.wa,
      'excluded', e.reason, 'excluded_note', e.note, 'excluded_by', e.set_by) order by lower(c.client_name)), '[]'::jsonb)
  into out
  from c left join lost_lists_base b on b.client_key = c.client_key
         left join lost_excluded e on e.client_key = c.client_key;
  return out;
end $function$;
