-- Wellness Voucher, blasts 1 and 2: what GoHighLevel really sent (Kate, 23 Oct 2026, replaces the "no record" of wv_blasts_history.sql).
-- Blasts 1 and 2 went out of GHL workflows ("WV - Blast Campaign", 21 Aug, and "WV - Blast Campaign Reminder", 28 Aug) and GHL's own stats screen only shows trigger
-- attempts (14,687), not sends. So on 23 Oct 2026 the conversations of the 3,168 contacts tagged cp:beauty-voucher-blast were read through a temporary read-only proxy
-- (since stubbed back to 410) and every outbound message of the two blasts counted by the status GHL holds for it. Counts only, no names or numbers are kept here.
--   tried       messages GHL created for the blast
--   read        status read (the client opened it)
--   delivered   status delivered, not read
--   sent_only   status sent, no delivery report (WhatsApp) or sent with no status (email)
--   failed      status failed (WhatsApp refused it: no WhatsApp on that number, blocked, template rules). Meta does not bill these; the page costs only tried minus failed.
-- Only contacts that still carry the tag were read, so a contact who lost the tag since is not counted. The numbers are a fixed record of what happened and do not change.
--
-- Vouchers for blasts 1 and 2 (Kate, 23 Oct 2026: "Voucher log ang tama"): the voucher log, not Phorest, is the source of truth, so wv_blast_voucher_log holds its counts for the 7 days after each
-- send (b1 21 to 27 Aug: 4 vouchers, AED 10,500; b2 28 Aug to 3 Sep: 3 vouchers, AED 6,000, the same windows the Wellness Voucher Performance page uses). The log's own database is not
-- reachable from here, so the two figures are a fixed record Kate gave; Phorest's own count stays in the result as phorest_vouchers / phorest_aed for comparison.
--
-- wv_blasts_history() now also returns "ghl" (these rows) and, per window, the voucher log's vouchers and aed for b1 and b2 (Phorest's beside them). Additive; Level 3 and above as before.

create table if not exists public.wv_ghl_sends (
  blast      text not null check (blast in ('b1', 'b2')),
  channel    text not null check (channel in ('whatsapp', 'email')),
  sent_on    text not null,
  tried      int  not null,
  read       int  not null default 0,
  delivered  int  not null default 0,
  sent_only  int  not null default 0,
  failed     int  not null default 0,
  counted_on date not null default date '2026-10-23',
  primary key (blast, channel)
);
alter table public.wv_ghl_sends enable row level security;   -- no policy: read only through wv_blasts_history()

create table if not exists public.wv_blast_voucher_log (
  blast    text primary key check (blast in ('b1', 'b2')),
  vouchers int  not null,
  aed      numeric not null,
  source   text not null default 'voucher log, as given by Kate on 23 Oct 2026'
);
alter table public.wv_blast_voucher_log enable row level security;
insert into public.wv_blast_voucher_log (blast, vouchers, aed) values ('b1', 4, 10500), ('b2', 3, 6000) on conflict (blast) do nothing;

insert into public.wv_ghl_sends (blast, channel, sent_on, tried, read, delivered, sent_only, failed) values
  ('b1', 'whatsapp', '21 Aug', 2831, 1411, 664, 29, 727),
  ('b1', 'email',    '21 and 22 Aug', 1648, 0, 0, 851, 797),
  ('b2', 'whatsapp', '28 Aug', 2546, 1086, 663, 17, 780)
on conflict (blast, channel) do nothing;

create or replace function public.wv_blasts_history() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lvl int;
begin
  select coalesce(max(m.level), 0) into lvl from public.dashboard_me() m;
  if lvl < 3 then raise exception 'Level 3 and above'; end if;
  return (
    with v as (
      select distinct on (s.item) s.item as serial, s.date, s.total::numeric as aed, lower(btrim(s.client_name)) as ck
        from public.sales_transaction_lines s
       where s.date >= date '2026-08-01' and s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$'
       order by s.item, s.date),
    w as (
      select 'b1' as k, date '2026-08-21' as f, date '2026-08-27' as t
      union all select 'b2', date '2026-08-28', date '2026-09-03'
      union all select 'gap', date '2026-09-04', date '2026-10-14')
    select jsonb_object_agg(w.k, jsonb_build_object('from', w.f, 'to', w.t,
             'vouchers', coalesce((select l.vouchers from public.wv_blast_voucher_log l where l.blast = w.k), (select count(*) from v where v.date between w.f and w.t)),
             'aed', coalesce((select l.aed from public.wv_blast_voucher_log l where l.blast = w.k), (select coalesce(sum(v.aed), 0) from v where v.date between w.f and w.t)),
             'from_log', exists (select 1 from public.wv_blast_voucher_log l where l.blast = w.k),
             'phorest_vouchers', (select count(*) from v where v.date between w.f and w.t),
             'phorest_aed', (select coalesce(sum(v.aed), 0) from v where v.date between w.f and w.t)))
           || jsonb_build_object('ghl', (select coalesce(jsonb_agg(jsonb_build_object('blast', g.blast, 'channel', g.channel, 'sent_on', g.sent_on, 'tried', g.tried,
                'read', g.read, 'delivered', g.delivered, 'sent_only', g.sent_only, 'failed', g.failed, 'counted_on', g.counted_on) order by g.blast, g.channel), '[]'::jsonb) from public.wv_ghl_sends g))
      from w);
end $$;

revoke all on function public.wv_blasts_history() from public, anon;
grant execute on function public.wv_blasts_history() to authenticated;
