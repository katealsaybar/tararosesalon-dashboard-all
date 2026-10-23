-- Wellness Voucher blasts: the full performance of each blast, not only the summary (Kate, 23 Oct 2026). Level 3 and above; names only for Level 3 and 5 (Level 4 gets the money).
-- One call, wv_blast_depth(), returns b1..b4, each with the same parts so the page can draw every blast the same way:
--   delivery   (b3, b4) what became of the messages we sent: seen / delivered / sent only / failed / unknown, who wrote back, who wrote STOP, who blocked us
--   bought     clients who bought, vouchers, AED, average voucher, how many of the buyers had written back
--   by_day     for each day: messages sent, clients who bought, vouchers, AED
--   buckets    how long after her message she bought: before her message / same day / next day / 2 to 3 days / 4 to 7 days / 8 days or more
--   tiers, pays  the tier and the tender of the vouchers
--   cuts       (b3 by wave, message A or B and branch; b4 by list and branch) the same columns for every group
--   buyers     one line per voucher: who (Level 3 and 5), when, days after, tier, AED, paid via, which wave or list
-- Blasts 3 and 4: the clients we messaged (wv_send_jobs, wv_last_jobs), vouchers (Phorest 'Voucher WV-..' sale lines, one per serial) from the first message day on, matched on name the way
-- wv_blast_performance does. Blasts 1 and 2 went out of GoHighLevel, so there is no list of who got them: their buyers are the till's voucher sales in the 7 days after the send.
-- Delivery and replies: respond.io's status of each number (lost_wa_status, kept by the nightly respond-status-sync, which now also covers these phones), so the figures run up to a day behind.
-- Blast 3 replies before the sync reached its phones come from wv_b3_replies, the check made on 21 Oct 2026 (a fixed record).

create table if not exists public.wv_b3_replies (
  phone      text primary key,
  sub_wave   text,
  sent_at    timestamptz,
  replied    boolean not null default false,   -- she wrote to us after the Blast 3 message (any message)
  checked_at timestamptz
);
alter table public.wv_b3_replies enable row level security;
revoke all on public.wv_b3_replies from public, anon, authenticated;
insert into public.wv_b3_replies (phone, sub_wave, sent_at, replied, checked_at)
select w.phone, w.sub_wave, w.sent_at, (w.in_after::text not in ('0', 'false', 'f')), w.checked_at from public.wv_final_push_warm_tmp w
on conflict (phone) do nothing;

create or replace function public.wv_blast_depth() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lvl int; nm boolean; out jsonb;
begin
  select coalesce(max(m.level), 0) into lvl from public.dashboard_me() m;
  if lvl < 3 then raise exception 'Level 3 and above'; end if;
  nm := lvl <> 4;
  with
  sales as materialized (
    select distinct on (s.item) s.item as serial, s.date, s.total::numeric as aed, regexp_replace(coalesce(s.payment_raw, ''), '\([^)]*\)', '', 'g') as pay,
           lower(btrim(s.client_name)) as ck, s.client_name as nme, s.branch as br
      from public.sales_transaction_lines s
     where s.date >= date '2026-08-01' and s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$'
     order by s.item, s.date),
  b34 as (
    select 'b3'::text as blast, j.phone, j.client, j.branch, left(j.sub_wave, 1) as g1, case when j.tag = 'wv-send-short' then 'A' else 'B' end as g2, j.done_at as t, j.client_key
      from public.wv_send_jobs j where j.status = 'sent' and j.done_at is not null
    union all
    select 'b4', j.phone, j.client, j.branch, j.seg, null, j.sent_at, j.client_key
      from public.wv_last_jobs j where j.status = 'sent' and not j.is_test),
  base as (
    select b.*, (b.t at time zone 'Asia/Dubai')::date as sd, coalesce(a.sales_name, b.client_key) as mk,
           (coalesce(r.replied, false) or (s.last_in is not null and s.last_in > b.t)) as replied,
           (coalesce(s.opted_out, false) and coalesce(s.opt_at, s.checked_at) >= b.t) as stop,
           (coalesce(s.is_blocked, false)) as blocked,
           case (select m ->> 's' from jsonb_array_elements(coalesce(s.out_msgs, '[]'::jsonb)) m
                  where abs((m ->> 't')::double precision - extract(epoch from b.t)) < 900
                  order by abs((m ->> 't')::double precision - extract(epoch from b.t)) limit 1)
             when 'read' then 'seen' when 'delivered' then 'delivered' when 'failed' then 'failed' when 'sent' then 'sent' else 'unknown' end as dstate
      from b34 b
      left join public.wv_blast_alias a on a.client_key = b.client_key
      left join public.lost_wa_status s on s.phone = b.phone
      left join public.wv_b3_replies r on r.phone = b.phone and b.blast = 'b3'),
  d0 as (select blast, min(sd) as d from base group by blast),
  allbuy as (
    select b.blast, b.mk as ck, b.client as who, b.branch as br, b.g1, b.g2, b.sd as sent_on, sa.date, (sa.date - b.sd) as days, sa.serial, sa.aed, sa.pay, b.replied
      from base b join d0 on d0.blast = b.blast join sales sa on sa.ck = b.mk and sa.date >= d0.d
    union all
    select w.blast, sa.ck, sa.nme, sa.br, null, null, w.f, sa.date, (sa.date - w.f), sa.serial, sa.aed, sa.pay, null::boolean
      from (select 'b1'::text as blast, date '2026-08-21' as f, date '2026-08-27' as t union all select 'b2', date '2026-08-28', date '2026-09-03') w
      join sales sa on sa.date between w.f and w.t),
  dl as (
    select blast, count(*) as sent, count(*) filter (where dstate = 'seen') as seen, count(*) filter (where dstate = 'delivered') as delivered,
           count(*) filter (where dstate = 'sent') as sent_only, count(*) filter (where dstate = 'failed') as failed, count(*) filter (where dstate = 'unknown') as unknown,
           count(*) filter (where replied) as replied, count(*) filter (where stop) as stop, count(*) filter (where blocked) as blocked, min(t) as first_at, max(t) as last_at
      from base group by blast),
  bt as (
    select blast, count(distinct ck) as clients, count(*) as vouchers, coalesce(sum(aed), 0) as aed, round(coalesce(avg(aed) filter (where aed > 0), 0)) as avg_ticket,
           count(distinct ck) filter (where replied) as replied_buyers
      from allbuy group by blast),
  byday as (
    select coalesce(s.blast, b.blast) as blast, coalesce(s.d, b.d) as d, coalesce(s.n, 0) as sent, coalesce(b.c, 0) as clients, coalesce(b.v, 0) as vouchers, coalesce(b.a, 0) as aed
      from (select blast, sd as d, count(*) as n from base group by 1, 2) s
      full join (select blast, date as d, count(distinct ck) as c, count(*) as v, sum(aed) as a from allbuy group by 1, 2) b on b.blast = s.blast and b.d = s.d),
  bkt as (
    select blast, case when days < 0 then 'before' when days = 0 then 'same' when days = 1 then 'd1' when days <= 3 then 'd2_3' when days <= 7 then 'd4_7' else 'd8p' end as k, count(*) as n
      from allbuy group by 1, 2),
  tiers as (select blast, left(split_part(serial, '-', 2), 1) as k, count(*) as vouchers, sum(aed) as aed from allbuy group by 1, 2),
  pays as (select blast, btrim(pay) as k, count(*) as vouchers, sum(aed) as aed from allbuy group by 1, 2),
  bsum as (select blast, ck, count(*) as v, sum(aed) as a from allbuy group by 1, 2),
  cuts as (
    select x.blast, x.dim, x.k, count(*) as sent, count(*) filter (where x.dstate = 'seen') as seen, count(*) filter (where x.dstate = 'delivered') as delivered,
           count(*) filter (where x.dstate = 'failed') as failed, count(*) filter (where x.replied) as replied,
           count(bs.ck) as bought, coalesce(sum(bs.v), 0) as vouchers, coalesce(sum(bs.a), 0) as aed
      from (select blast, 'g1' as dim, g1 as k, mk, dstate, replied from base
            union all select blast, 'g2', g2, mk, dstate, replied from base where g2 is not null
            union all select blast, 'branch', branch, mk, dstate, replied from base) x
      left join bsum bs on bs.blast = x.blast and bs.ck = x.mk
     group by x.blast, x.dim, x.k)
  select jsonb_object_agg(k.blast, jsonb_build_object(
      'delivery', (select to_jsonb(d) - 'blast' from dl d where d.blast = k.blast),
      'bought', coalesce((select to_jsonb(b) - 'blast' from bt b where b.blast = k.blast), jsonb_build_object('clients', 0, 'vouchers', 0, 'aed', 0, 'avg_ticket', 0, 'replied_buyers', 0)),
      'by_day', (select coalesce(jsonb_agg(to_jsonb(y) - 'blast' order by y.d), '[]'::jsonb) from byday y where y.blast = k.blast),
      'buckets', (select coalesce(jsonb_object_agg(q.k, q.n), '{}'::jsonb) from bkt q where q.blast = k.blast),
      'tiers', (select coalesce(jsonb_agg(jsonb_build_object('k', t.k, 'vouchers', t.vouchers, 'aed', t.aed) order by t.k), '[]'::jsonb) from tiers t where t.blast = k.blast),
      'pays', (select coalesce(jsonb_agg(jsonb_build_object('k', p.k, 'vouchers', p.vouchers, 'aed', p.aed) order by p.aed desc), '[]'::jsonb) from pays p where p.blast = k.blast),
      'cuts', (select coalesce(jsonb_agg(to_jsonb(c) - 'blast' order by c.dim, c.k), '[]'::jsonb) from cuts c where c.blast = k.blast),
      'buyers', (select coalesce(jsonb_agg(jsonb_build_object('who', case when nm then initcap(a.who) end, 'br', a.br, 'g1', a.g1, 'g2', a.g2, 'sent_on', a.sent_on, 'date', a.date,
                    'days', a.days, 'serial', a.serial, 'aed', a.aed, 'pay', btrim(a.pay), 'replied', a.replied) order by a.date, a.serial), '[]'::jsonb)
                 from allbuy a where a.blast = k.blast and a.aed > 0)))
    into out
    from (values ('b1'), ('b2'), ('b3'), ('b4')) k(blast);
  return jsonb_build_object('at', now(), 'names', nm) || out;
end $$;

revoke all on function public.wv_blast_depth() from public, anon;
grant execute on function public.wv_blast_depth() to authenticated;
