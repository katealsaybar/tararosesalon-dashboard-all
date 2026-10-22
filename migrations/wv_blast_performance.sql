-- Wellness Voucher Blast, performance (Kate, 22 Oct 2026): how the 3rd blast is doing in AED, shown at the top of the WV Blast page.
-- NOT applied yet: Kate said to build it and not push. Run this, then ship wv-blast.js (the page copes with the function not being there: the section stays out).
--
--   sent       Real messages the site sent through respond.io (wv_send_jobs.status = 'sent'). Every wave went out through the site queue
--              (600 jobs on 22 Oct 2026, one per client, A = short message, B = long message), so the count is complete.
--   cost       An ESTIMATE: sent times p_rate, the same AED 0.17 a message (about USD 0.046) the Lost Client Blasts report uses. Meta's invoice has the exact figure.
--   bought     Clients we messaged who have a Wellness Voucher sale (item 'Voucher WV-..', one line per serial) from the Dubai date of the first message on,
--              matched on name the way the list does (wv_blast_alias holds the odd spelling). AED is what she paid, VAT included, for every voucher she
--              bought, not only the first. Counted per client, cut by the wave, message (A or B) and branch she was sent.
--   other      Voucher sales since the blast started from clients who are not on the messaged list (a spelling that does not match, or a client who
--              bought without the message). They are NOT counted above, so Kate can see them beside it.
--   by_tier    The vouchers the messaged clients bought, by tier (D Dip Your Toes, S Season of You, V All-In VIP Year, the first letter of the serial's code) and by tender (S Stripe, T Tabby link, CC card).
--
-- A client may have bought without our message, the same caveat the Lost Client Blasts report carries. No replies, STOP or delivery numbers: respond.io's
-- status feed only covers 77 of the 600 phones. Level 3 and above, like the page.

create or replace function public.wv_blast_performance(p_rate numeric default 0.17) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  with j as (
    select left(sub_wave, 1)::int as wave, case when tag = 'wv-send-short' then 'A' else 'B' end as arm, branch, client_key, status, done_at
    from public.wv_send_jobs),
  sent as (select * from j where status = 'sent'),
  d0 as (select coalesce(min((done_at at time zone 'Asia/Dubai')::date), current_date) as d from sent),
  sales as (
    select distinct on (s.item) s.item as serial, s.date, s.total::numeric as aed,
           regexp_replace(coalesce(s.payment_raw, ''), '\([^)]*\)', '', 'g') as pay, lower(btrim(s.client_name)) as ck
    from public.sales_transaction_lines s
    where s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$' and s.date >= (select d from d0)
    order by s.item, s.date),
  m as (select s.*, coalesce(a.sales_name, s.client_key) as mk from sent s left join public.wv_blast_alias a on a.client_key = s.client_key),
  bought as (select m.wave, m.arm, m.branch, m.mk, sa.serial, sa.aed, sa.pay from m join sales sa on sa.ck = m.mk),
  other as (select sa.* from sales sa where sa.ck not in (select mk from m)),
  sd as (
    select 'wave' as d, wave::text as k, count(*) as n from sent group by 2
    union all select 'arm', arm, count(*) from sent group by 2
    union all select 'branch', branch, count(*) from sent group by 2),
  bd as (
    select 'wave' as d, wave::text as k, count(distinct mk) as c, count(*) as v, sum(aed) as a from bought group by 2
    union all select 'arm', arm, count(distinct mk), count(*), sum(aed) from bought group by 2
    union all select 'branch', branch, count(distinct mk), count(*), sum(aed) from bought group by 2),
  dm as (
    select sd.d, sd.k, sd.n, coalesce(bd.c, 0) as c, coalesce(bd.v, 0) as v, coalesce(bd.a, 0) as a
    from sd left join bd on bd.d = sd.d and bd.k = sd.k),
  tot as (select count(*) as n, min(done_at) as first, max(done_at) as last from sent),
  bt as (select count(distinct mk) as c, count(*) as v, coalesce(sum(aed), 0) as a from bought)
  select jsonb_build_object(
    'at', now(), 'rate', p_rate,
    'totals', (select jsonb_build_object('sent', tot.n, 'first', tot.first, 'last', tot.last,
                 'failed', (select count(*) from j where status = 'failed'), 'queued', (select count(*) from j where status in ('queued', 'sending')),
                 'bought', bt.c, 'vouchers', bt.v, 'aed', bt.a, 'cost', tot.n * p_rate) from tot, bt),
    'other', (select jsonb_build_object('clients', count(distinct ck), 'vouchers', count(*), 'aed', coalesce(sum(aed), 0)) from other),
    'by_wave', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'sent', n, 'bought', c, 'vouchers', v, 'aed', a) order by k), '[]'::jsonb) from dm where d = 'wave'),
    'by_arm', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'sent', n, 'bought', c, 'vouchers', v, 'aed', a) order by k), '[]'::jsonb) from dm where d = 'arm'),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'sent', n, 'bought', c, 'vouchers', v, 'aed', a) order by n desc, k), '[]'::jsonb) from dm where d = 'branch'),
    'by_tier', (select coalesce(jsonb_agg(jsonb_build_object('k', t, 'vouchers', v, 'aed', a) order by t), '[]'::jsonb)
                from (select left(split_part(serial, '-', 2), 1) as t, count(*) as v, sum(aed) as a from bought group by 1) q),
    'by_pay', (select coalesce(jsonb_agg(jsonb_build_object('k', t, 'vouchers', v, 'aed', a) order by a desc), '[]'::jsonb)
               from (select btrim(pay) as t, count(*) as v, sum(aed) as a from bought group by 1) q))
  into out;
  return out;
end $$;

revoke all on function public.wv_blast_performance(numeric) from public, anon;
grant execute on function public.wv_blast_performance(numeric) to authenticated;
