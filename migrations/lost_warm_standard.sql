-- Lost Client Blasts, Warm or standard? (Kate, 2 Nov 2026, from the meeting with Coach Emma). APPLIED LIVE 2 Nov 2026 (three migrations: this, grants, and a plpgsql name-clash fix
-- that is already folded in below); checked as a Level 5 login in a rolled-back transaction: warm 59 and standard 33 booked or came in, same as the page figures.
--
-- Which is more effective, the warm or the standard, what each cost in AED, and how many clients booked from each. One definition, shared with the Wellness Voucher
-- blasts page (3rd and 4th blast): the AUDIENCE decides. Lost: a client is Warm when her first message went out in wave 1 or 2 (clients who had written to us in the
-- last 12 months, plus the 15 Oct pilot); Standard when it went out in wave 3 or 4 (replied 12 to 18 months ago, or no reply seen). Each side keeps the text it received
-- (Standard, Story, Standard + STOP line), listed beside the numbers; the STOP-line text went only to waves 3 and 4, so audience and text move together.
--
--   lost_ws_base()                          internal: one row per client messaged, her group, her first message, and what happened to it (Level 3 and above)
--   lost_warm_standard(p_rate)              the two groups side by side, by message type, and the texts each received (Level 3 and above)
--   lost_ws_drill(p_metric, p_grp, p_type)  the clients behind a figure, in the same row shape as lost_drill so the page's list window draws it
--
-- Counted per client from her FIRST message, so a resend queued later in another wave does not move her. Spend = every message sent x p_rate (respond.io, about
-- USD 0.046 = AED 0.17) and, beside it, only the messages WhatsApp delivered (seen or delivered), the likelier invoice. Paid at the till is the same rule as
-- lost_campaign_money (everything she has paid since her first message, deposits, vouchers and courses left out).

create or replace function public.lost_ws_base()
returns table (k text, grp text, qtype text, tkey text, branch text, wave int, first_at timestamptz, replied boolean, stop boolean, delivered boolean, n int, ndel int)
language plpgsql stable security definer set search_path to 'public' as $fn$
#variable_conflict use_column
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  return query
  with sent as (select f.client_key as ck, f.branch as br, f.qtype as qt, f.tkey as tk, f.wave as wv, f.sent_at, f.phone, f.replied as rp, f.stop as sp from public.lost_send_flags f where f.status = 'sent'),
  dm as (
    select s.*, (select m->>'s' from jsonb_array_elements(coalesce(w.out_msgs, '[]'::jsonb)) m
                 where abs((m->>'t')::double precision - extract(epoch from s.sent_at)) < 900
                 order by abs((m->>'t')::double precision - extract(epoch from s.sent_at)) limit 1) as st
    from sent s left join public.lost_wa_status w on w.phone = s.phone),
  fs as (select distinct on (ck) ck, br, qt, tk, wv, sent_at from sent order by ck, sent_at),
  a as (select ck, bool_or(rp and not coalesce(sp, false)) as rep, bool_or(coalesce(sp, false)) as stp, bool_or(st in ('read', 'delivered')) as dlv,
               count(*)::int as nn, (count(*) filter (where st in ('read', 'delivered')))::int as nd from dm group by ck)
  select fs.ck, case when fs.wv in (1, 2) then 'warm' else 'standard' end, fs.qt, fs.tk, fs.br, coalesce(fs.wv, 0)::int, fs.sent_at, a.rep, a.stp, a.dlv, a.nn, a.nd
  from fs join a using (ck);
end $fn$;

create or replace function public.lost_warm_standard(p_rate numeric default 0.17)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare out jsonb;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with b as (select * from public.lost_ws_base()),
  fs as (select k, (first_at at time zone 'Asia/Dubai')::date as d0 from b),
  sl as (
    select s.date, s.item, s.total, public.stl_key_fold(public.stl_client_key(s.client_name)) as k,
           (coalesce(s.employee_name, '') !~* '^\s*business\M' and s.client_name !~* '\mstaff\M'
            and public.stl_item_kind(s.item) not in ('non_sale', 'voucher')
            and (bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id) and s.day_spend_ok)) as vis_ok
    from public.sales_transaction_lines s
    where s.date >= (select min(d0) from fs) and nullif(trim(s.client_name), '') is not null),
  ln as (select fs.k, sl.item, sl.total, sl.vis_ok from fs join sl on sl.k = fs.k and sl.date >= fs.d0),
  cl as (select * from public.item_classes(coalesce((select array_agg(distinct item) from ln), '{}'::text[]))),
  ak as (select ln.k, sum(ln.total) as spent, bool_or(ln.vis_ok) as vis from ln join cl c on c.item = ln.item where c.category <> 'SKIP' and c.family <> 'skip' group by ln.k),
  pc as (
    select b.*, f.ahead, f.done, f.n_appts, coalesce(ak.spent, 0) as spent, (coalesce(ak.spent, 0) > 0 and coalesce(ak.vis, false)) as visited
    from b left join public.lost_client_facts f on f.client_key = b.k left join ak on ak.k = b.k),
  m as (
    select grp, qtype, count(*) as clients, sum(n) as msgs, sum(ndel) as delivered_msgs, count(*) filter (where delivered) as reached,
           count(*) filter (where replied) as replied, count(*) filter (where stop) as stop,
           count(*) filter (where ahead) as ahead, coalesce(sum(n_appts) filter (where ahead), 0) as appts, count(*) filter (where done) as done,
           count(*) filter (where ahead or done) as since, count(*) filter (where visited) as visited,
           coalesce(sum(spent) filter (where visited), 0) as actual, coalesce(sum(spent) filter (where visited and replied), 0) as actual_replied
    from pc group by grouping sets ((grp, qtype), (grp))),
  tp as (select grp, tkey, count(*) as n from pc group by grp, tkey)
  select jsonb_build_object('at', now(), 'rate', p_rate,
    'groups', (select jsonb_object_agg(m.grp, jsonb_build_object('clients', m.clients, 'msgs', m.msgs, 'delivered_msgs', m.delivered_msgs, 'reached', m.reached,
        'replied', m.replied, 'stop', m.stop, 'ahead', m.ahead, 'appts', m.appts, 'done', m.done, 'since', m.since, 'visited', m.visited,
        'actual', m.actual, 'actual_replied', m.actual_replied, 'spent_sent', m.msgs * p_rate, 'spent_delivered', m.delivered_msgs * p_rate)) from m where m.qtype is null),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object('grp', m.grp, 'qtype', m.qtype, 'clients', m.clients, 'reached', m.reached, 'replied', m.replied, 'stop', m.stop,
        'since', m.since, 'visited', m.visited, 'actual', m.actual) order by m.qtype, m.grp) from m where m.qtype is not null), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('grp', tp.grp, 'tkey', tp.tkey, 'n', tp.n) order by tp.grp, tp.n desc) from tp), '[]'::jsonb))
  into out;
  return out;
end $fn$;

create or replace function public.lost_ws_drill(p_metric text, p_grp text, p_type text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare total int; rows_ jsonb;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with b as (select * from public.lost_ws_base() where grp = p_grp and (nullif(p_type, '') is null or qtype = p_type)),
  x as (
    select distinct on (fl.client_key) fl.id, fl.client_key, fl.phone, fl.branch, fl.tkey, fl.wave, fl.status, fl.error, fl.sent_at,
           c.outcome, c.nxt, c.svc as next_svc, c.n_appts, c.st, c.bal, c.cid, c.came_on, c.n_msgs, c.ahead, c.done, b.replied, b.stop, b.delivered
    from public.lost_send_flags fl join b on b.k = fl.client_key left join public.lost_client_facts c on c.client_key = fl.client_key
    where fl.status = 'sent' order by fl.client_key, fl.sent_at desc nulls last, fl.id desc),
  g as (select * from x where case p_metric
      when 'clients' then true when 'reached' then delivered when 'replied' then replied when 'stop' then stop
      when 'since' then ahead or done when 'ahead' then ahead when 'done' then done else false end)
  select (select count(*) from g),
         coalesce((select jsonb_agg(r) from (select jsonb_build_object('id', id, 'client', initcap(client_key), 'last4', right(phone, 4), 'phone', phone, 'branch', branch, 'tkey', tkey,
           'wave', coalesce(wave, 0), 'status', status, 'error', error, 'd', to_char(sent_at at time zone 'Asia/Dubai', 'YYYY-MM-DD'),
           't', to_char(sent_at at time zone 'Asia/Dubai', 'HH24:MI'), 'outcome', outcome, 'next', nxt, 'svc', next_svc, 'appts', n_appts, 'st', st,
           'deposit', bal, 'cid', cid, 'came', came_on, 'msgs', n_msgs,
           'offer', exists (select 1 from public.lost_send_jobs j3 where j3.client_key = g.client_key and j3.status = 'sent' and not j3.is_test and j3.body_text ~* '% off')) as r
           from g order by client_key limit 1000) z), '[]'::jsonb)
  into total, rows_;
  return jsonb_build_object('total', total, 'rows', rows_, 'per_client', true);
end $fn$;

-- Same grants as lost_drill: signed-in users only (each function still checks Level 3 and above itself).
revoke all on function public.lost_ws_base() from public, anon;
revoke all on function public.lost_warm_standard(numeric) from public, anon;
revoke all on function public.lost_ws_drill(text, text, text) from public, anon;
grant execute on function public.lost_ws_base() to authenticated;
grant execute on function public.lost_warm_standard(numeric) to authenticated;
grant execute on function public.lost_ws_drill(text, text, text) to authenticated;
