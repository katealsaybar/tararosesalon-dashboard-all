-- Wellness Voucher, blasts 1 and 2 (Kate, 23 Oct 2026). The page "Wellness Voucher Message and Email Blasts" lists performance per blast, four of them. Blasts 3 and 4 have
-- their own functions (wv_blast_performance, wv_lastpush_performance); blasts 1 and 2 went out of GHL (21 Aug WhatsApp and 22 Aug email, then the 28 Aug reminder) and left no
-- per-client record here, so all this can say is how many vouchers Phorest shows sold in the 7 days from each send:
--   b1   21 to 27 Aug     b2   28 Aug to 3 Sep     gap   4 Sep to 14 Oct (between blast 2 and blast 3, for reference)
-- A voucher = one Phorest sales line with item 'Voucher WV-..' (one line per serial), AED = what was paid, VAT included. It is "sold in the week after", not "sold because of".
-- Additive and read only. Level 3 and above (Level 4 sees money only on the page, and this is money only).

create or replace function public.wv_blasts_history() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lvl int;
begin
  select coalesce(max(m.level), 0) into lvl from public.dashboard_me() m;
  if lvl < 3 then raise exception 'Level 3 and above'; end if;
  return (
    with v as (
      select distinct on (s.item) s.item as serial, s.date, s.total::numeric as aed
        from public.sales_transaction_lines s
       where s.date >= date '2026-08-01' and s.item ~ '^Voucher WV-[A-Z]{2}-[A-Z]+-[0-9]+$'
       order by s.item, s.date),
    w as (
      select 'b1' as k, date '2026-08-21' as f, date '2026-08-27' as t
      union all select 'b2', date '2026-08-28', date '2026-09-03'
      union all select 'gap', date '2026-09-04', date '2026-10-14')
    select jsonb_object_agg(w.k, jsonb_build_object('from', w.f, 'to', w.t,
             'vouchers', (select count(*) from v where v.date between w.f and w.t),
             'aed', (select coalesce(sum(v.aed), 0) from v where v.date between w.f and w.t)))
      from w);
end $$;

revoke all on function public.wv_blasts_history() from public, anon;
grant execute on function public.wv_blasts_history() to authenticated;
