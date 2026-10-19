-- Lost Client Blasts, Performance report: one message at a time (Kate, 19 Oct 2026). Emma asked "which is the lost one? Smoothing, Colour or
-- the reminder?": the report counted all three together. The four report functions now take an optional message type, p_type =
-- 'smoothing' | 'colour' | 'due' (lost_send_jobs.qtype), and null (the default) means all of them, exactly as before. The page calls them with
-- no arguments until Kate picks one, so shipping this first changes nothing on the live page.
--
--   lost_send_report_get(p_type)    totals, by wave, branch, message, type, day and half-hour slot, for that message only
--   lost_delivery_report(p_type)    seen / delivered / failed for that message only
--   lost_booked_deposits(p_type)    the clients who booked after THAT message (a client who got two different messages shows under each)
--   lost_send_log_get(..., p_type)  the log, filtered the same way
--
-- Same logic as the functions live on 19 Oct 2026 (lost_send_report.sql plus the later dashboard_scope guard and the Replied-not-STOP count,
-- lost_delivery_report.sql, lost_booked_deposits.sql); only the type filter is new. Level 3 and above.

drop function if exists public.lost_send_report_get();
drop function if exists public.lost_delivery_report();
drop function if exists public.lost_booked_deposits();
drop function if exists public.lost_send_log_get(int, text, text, text, int, int);

create or replace function public.lost_send_report_get(p_type text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  src text := format('(select * from public.lost_send_flags where %1$L::text is null or qtype = %1$L) f', nullif(p_type, ''));
  m text := $m$ jsonb_build_object('n', count(*), 'sent', count(*) filter (where status = 'sent'),
    'queued', count(*) filter (where status in ('queued', 'sending')), 'failed', count(*) filter (where status = 'failed'),
    'skipped', count(*) filter (where status = 'skipped'), 'replied', count(*) filter (where replied and not coalesce(stop, false)), 'booked', count(*) filter (where booked),
    'stop', count(*) filter (where stop), 'blocked', count(*) filter (where blocked), 'first', min(sent_at), 'last', max(sent_at)) $m$;
  grp text := $g$ select coalesce(jsonb_agg(r order by ord), '[]'::jsonb) from (select %1$s as ord, jsonb_build_object('k', %1$s) || %2$s as r
    from %3$s group by %1$s) t $g$;
  out jsonb; x jsonb;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  execute 'select ' || m || ' from ' || src into x;
  out := jsonb_build_object('at', now(), 'totals', x);
  execute format(grp, 'coalesce(wave, 0)', m, src) into x;            out := out || jsonb_build_object('by_wave', x);
  execute format(grp, 'branch', m, src) into x;                       out := out || jsonb_build_object('by_branch', x);
  execute format(grp, 'tkey', m, src) into x;                         out := out || jsonb_build_object('by_message', x);
  execute format(grp, 'qtype', m, src) into x;                        out := out || jsonb_build_object('by_type', x);
  execute format(grp, $d$to_char(coalesce(sent_at, requested_at) at time zone 'Asia/Dubai', 'YYYY-MM-DD')$d$, m, src) into x;
                                                                      out := out || jsonb_build_object('by_day', x);
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 't', t, 'n', n) order by d, t), '[]'::jsonb) into x
  from (select to_char(sent_at at time zone 'Asia/Dubai', 'YYYY-MM-DD') d,
               to_char(date_trunc('hour', sent_at at time zone 'Asia/Dubai') + floor(extract(minute from sent_at at time zone 'Asia/Dubai') / 30) * interval '30 minutes', 'HH24:MI') t,
               count(*) n
        from public.lost_send_flags where status = 'sent' and (nullif(p_type, '') is null or qtype = p_type) group by 1, 2) s;
  out := out || jsonb_build_object('by_slot', x);
  return out;
end $$;

create or replace function public.lost_send_log_get(p_wave int default null, p_branch text default 'all', p_status text default 'all',
  p_q text default '', p_offset int default 0, p_limit int default 50, p_type text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total int; rows_ jsonb; lim int := least(greatest(coalesce(p_limit, 50), 1), 500); q text := lower(btrim(coalesce(p_q, '')));
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with f as (
    select * from public.lost_send_flags
    where (p_wave is null or coalesce(wave, 0) = p_wave)
      and (coalesce(p_branch, 'all') = 'all' or branch = p_branch)
      and (coalesce(p_status, 'all') = 'all' or (p_status = 'queued' and status in ('queued', 'sending')) or status = p_status)
      and (nullif(p_type, '') is null or qtype = p_type)
      and (q = '' or client_key like '%' || q || '%' or right(phone, 4) = q)
  ), page as (
    select * from f order by sent_at desc nulls last, id desc offset greatest(coalesce(p_offset, 0), 0) limit lim
  )
  select (select count(*) from f),
         coalesce((select jsonb_agg(jsonb_build_object('id', id, 'client', initcap(client_key), 'last4', right(phone, 4), 'branch', branch, 'qtype', qtype,
           'tkey', tkey, 'arm', arm, 'wave', coalesce(wave, 0), 'status', status, 'error', error, 'text', body_text, 'message_id', message_id,
           'd', to_char(sent_at at time zone 'Asia/Dubai', 'YYYY-MM-DD'), 't', to_char(sent_at at time zone 'Asia/Dubai', 'HH24:MI:SS'),
           'qd', to_char(requested_at at time zone 'Asia/Dubai', 'YYYY-MM-DD HH24:MI'), 'by', requested_by,
           'replied', replied, 'booked', booked, 'stop', stop, 'blocked', blocked) order by sent_at desc nulls last, id desc) from page), '[]'::jsonb)
  into total, rows_;
  return jsonb_build_object('total', total, 'rows', rows_);
end $$;

create or replace function public.lost_delivery_report(p_type text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with j as (select f.id, f.branch, f.phone, f.sent_at from public.lost_send_flags f
             where f.status = 'sent' and (nullif(p_type, '') is null or f.qtype = p_type)),
  x as (
    select j.id, j.branch, (j.sent_at at time zone 'Asia/Dubai')::date as d,
      case (select m->>'s' from jsonb_array_elements(coalesce(w.out_msgs, '[]'::jsonb)) m
            where abs((m->>'t')::double precision - extract(epoch from j.sent_at)) < 900
            order by abs((m->>'t')::double precision - extract(epoch from j.sent_at)) limit 1)
        when 'read' then 'seen' when 'delivered' then 'delivered' when 'failed' then 'failed' when 'sent' then 'sent' else 'unknown' end as st
    from j left join public.lost_wa_status w on w.phone = j.phone)
  select jsonb_build_object(
    'at', now(),
    'total', (select jsonb_build_object('sent', count(*), 'seen', count(*) filter (where st = 'seen'), 'delivered', count(*) filter (where st = 'delivered'),
              'sent_only', count(*) filter (where st = 'sent'), 'failed', count(*) filter (where st = 'failed'), 'unknown', count(*) filter (where st = 'unknown')) from x),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', branch, 'sent', n, 'seen', a, 'delivered', b, 'sent_only', c, 'failed', e, 'unknown', u) order by n desc, branch), '[]'::jsonb)
       from (select branch, count(*) n, count(*) filter (where st = 'seen') a, count(*) filter (where st = 'delivered') b, count(*) filter (where st = 'sent') c,
                    count(*) filter (where st = 'failed') e, count(*) filter (where st = 'unknown') u from x group by branch) q),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('k', d, 'sent', n, 'seen', a, 'delivered', b, 'sent_only', c, 'failed', e, 'unknown', u) order by d), '[]'::jsonb)
       from (select d, count(*) n, count(*) filter (where st = 'seen') a, count(*) filter (where st = 'delivered') b, count(*) filter (where st = 'sent') c,
                    count(*) filter (where st = 'failed') e, count(*) filter (where st = 'unknown') u from x group by d) q))
  into out;
  return out;
end $$;

create or replace function public.lost_booked_deposits(p_type text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with bk as (
    select distinct on (f.client_key) f.client_key as k, f.branch
    from public.lost_send_flags f where f.booked and (nullif(p_type, '') is null or f.qtype = p_type) order by f.client_key, f.sent_at desc),
  nb as (
    select distinct on (public.stl_key_fold(b.client_key)) public.stl_key_fold(b.client_key) as k, b.client_name as name, b.date as nxt
    from public.client_bookings b where b.date >= current_date order by public.stl_key_fold(b.client_key), b.date),
  dep as (
    select public.stl_key_fold(public.stl_client_key(s.client_name)) as k,
           coalesce(sum(s.net), 0) as bal
    from public.sales_transaction_lines s
    where s.item in ('Deposit', 'Deposit (Refund)') and s.date >= current_date - 90
    group by 1),
  x as (
    select bk.branch, nb.name, nb.nxt, coalesce(d.bal, 0) as bal,
           case when coalesce(d.bal, 0) > 0 then 'paid' when nb.nxt = current_date then 'today' else 'unpaid' end as st
    from bk join nb on nb.k = bk.k left join dep d on d.k = bk.k)
  select jsonb_build_object(
    'at', now(),
    'total', (select jsonb_build_object('booked', count(*), 'paid', count(*) filter (where st = 'paid'),
                'today', count(*) filter (where st = 'today'), 'unpaid', count(*) filter (where st = 'unpaid')) from x),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', branch, 'booked', n, 'paid', p, 'today', t, 'unpaid', u) order by n desc, branch), '[]'::jsonb)
                  from (select branch, count(*) n, count(*) filter (where st = 'paid') p, count(*) filter (where st = 'today') t,
                               count(*) filter (where st = 'unpaid') u from x group by branch) q),
    'soon', (select coalesce(jsonb_agg(jsonb_build_object('k', o, 'n', c) order by o), '[]'::jsonb)
             from (select case when nxt - current_date <= 1 then 1 when nxt - current_date <= 3 then 2 when nxt - current_date <= 7 then 3
                               when nxt - current_date <= 14 then 4 else 5 end as o, count(*) c
                   from x where st = 'unpaid' group by 1) q),
    'who', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'branch', branch, 'next', nxt, 'status', st, 'deposit', bal) order by nxt, name), '[]'::jsonb) from x))
  into out;
  return out;
end $$;

revoke all on function public.lost_send_report_get(text), public.lost_delivery_report(text), public.lost_booked_deposits(text),
  public.lost_send_log_get(int, text, text, text, int, int, text) from public, anon;
grant execute on function public.lost_send_report_get(text), public.lost_delivery_report(text), public.lost_booked_deposits(text),
  public.lost_send_log_get(int, text, text, text, int, int, text) to authenticated;
