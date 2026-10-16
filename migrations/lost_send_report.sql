-- Lost Clients, Performance report (Kate, 16 Oct 2026): the record of what the site sent, when, and what came of it.
-- Applied live on 16 Oct 2026.
--
--   lost_send_flags        every real (non-test) job with its wave, message arm, and what happened since it went:
--                          replied (she wrote in after the send), booked (a booking from today on), stop (opted out since), blocked.
--                          Service role and the two functions below only: it holds names and message text.
--   lost_send_report_get() Level 3+: the numbers (totals, by wave, branch, message, day, half-hour slot)
--   lost_send_log_get()    Level 3+: the log, one page at a time, filterable, with the message text
--
-- Wave = the highest wave that was open when the job was queued (lost_waves.opened_at). A job queued in Wave 1 and sent later is still Wave 1.
-- Replied and stop come from lost_wa_status, which the nightly respond-status-sync refreshes, so they run up to a day behind.

create or replace view public.lost_send_flags as
select j.id, j.client_key, j.phone, j.branch, j.qtype, j.tkey, j.status, j.error, j.body_text, j.message_id,
       j.sent_at, j.requested_at, j.requested_by, j.tagged,
       (select max(w.n) from public.lost_waves w where w.opened_at is not null and w.opened_at <= j.requested_at) as wave,
       case when j.tkey like '%\_story' then 'story' when j.tkey like '%\_v2\_stop' then 'standard + STOP line' else 'standard' end as arm,
       (j.status = 'sent' and s.last_in is not null and s.last_in > j.sent_at) as replied,
       (j.status = 'sent' and coalesce(s.opted_out, false) and coalesce(s.opt_at, s.checked_at) >= j.sent_at) as stop,
       (j.status = 'sent' and coalesce(s.is_blocked, false)) as blocked,
       (j.status = 'sent' and exists (select 1 from public.client_bookings b
          where b.date >= current_date and public.stl_key_fold(b.client_key) = j.client_key)) as booked
from public.lost_send_jobs j
left join public.lost_wa_status s on s.phone = j.phone
where not j.is_test;
revoke all on public.lost_send_flags from public, anon, authenticated;

create or replace function public.lost_send_report_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m text := $m$ jsonb_build_object('n', count(*), 'sent', count(*) filter (where status = 'sent'),
    'queued', count(*) filter (where status in ('queued', 'sending')), 'failed', count(*) filter (where status = 'failed'),
    'skipped', count(*) filter (where status = 'skipped'), 'replied', count(*) filter (where replied), 'booked', count(*) filter (where booked),
    'stop', count(*) filter (where stop), 'blocked', count(*) filter (where blocked), 'first', min(sent_at), 'last', max(sent_at)) $m$;
  grp text := $g$ select coalesce(jsonb_agg(r order by ord), '[]'::jsonb) from (select %1$s as ord, jsonb_build_object('k', %1$s) || %2$s as r
    from public.lost_send_flags group by %1$s) t $g$;
  out jsonb; x jsonb;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  execute 'select ' || m || ' from public.lost_send_flags' into x;
  out := jsonb_build_object('at', now(), 'totals', x);
  execute format(grp, 'coalesce(wave, 0)', m) into x;                 out := out || jsonb_build_object('by_wave', x);
  execute format(grp, 'branch', m) into x;                            out := out || jsonb_build_object('by_branch', x);
  execute format(grp, 'tkey', m) into x;                              out := out || jsonb_build_object('by_message', x);
  execute format(grp, 'qtype', m) into x;                             out := out || jsonb_build_object('by_type', x);
  execute format(grp, $d$to_char(coalesce(sent_at, requested_at) at time zone 'Asia/Dubai', 'YYYY-MM-DD')$d$, m) into x;
                                                                      out := out || jsonb_build_object('by_day', x);
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 't', t, 'n', n) order by d, t), '[]'::jsonb) into x
  from (select to_char(sent_at at time zone 'Asia/Dubai', 'YYYY-MM-DD') d,
               to_char(date_trunc('hour', sent_at at time zone 'Asia/Dubai') + floor(extract(minute from sent_at at time zone 'Asia/Dubai') / 30) * interval '30 minutes', 'HH24:MI') t,
               count(*) n
        from public.lost_send_flags where status = 'sent' group by 1, 2) s;
  out := out || jsonb_build_object('by_slot', x);
  return out;
end $$;

create or replace function public.lost_send_log_get(p_wave int default null, p_branch text default 'all', p_status text default 'all',
  p_q text default '', p_offset int default 0, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total int; rows_ jsonb; lim int := least(greatest(coalesce(p_limit, 50), 1), 500); q text := lower(btrim(coalesce(p_q, '')));
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with f as (
    select * from public.lost_send_flags
    where (p_wave is null or coalesce(wave, 0) = p_wave)
      and (coalesce(p_branch, 'all') = 'all' or branch = p_branch)
      and (coalesce(p_status, 'all') = 'all' or (p_status = 'queued' and status in ('queued', 'sending')) or status = p_status)
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

revoke all on function public.lost_send_report_get(), public.lost_send_log_get(int, text, text, text, int, int) from public, anon;
grant execute on function public.lost_send_report_get(), public.lost_send_log_get(int, text, text, text, int, int) to authenticated;
