-- Who sold them, split by how she came to us. 21 Oct 2026 (Kate).
-- Run in Supabase: Dashboard -> SQL Editor -> New Query -> paste -> Run.
-- Project: vlqvefsaxztitcbhirxt (the voucher project). Safe to re-run.
--
-- A Stripe sale is paid by the client on a link and only logged at the till (usually by Belle), so "Issued by" cannot say who
-- actually sold it. sold_via says how she came to us:
--   nurtured  the person worked her (she was a Hot Lead in GHL and the person followed up)
--   blast3    she was on the 3rd blast list (messaged 15 to 16 Oct) and bought after it, at the till or on the Stripe link
--   blast     she was on an earlier blast (the August beauty voucher blast) and paid the link
--   direct    organic or website, paid on Stripe with no follow-up
-- Sorted from the GHL tags and pipeline notes on 21 Oct 2026. It is a judgement call: change any line below if you know better,
-- and set it for each new Stripe sale:  update public.voucher_issues set sold_via = 'nurtured' where branch = 'KCA' and seq = 17;

alter table public.voucher_issues add column if not exists sold_via text;
alter table public.voucher_issues drop constraint if exists voucher_issues_sold_via_check;
alter table public.voucher_issues add constraint voucher_issues_sold_via_check check (sold_via is null or sold_via in ('nurtured','blast3','blast','direct'));

update public.voucher_issues set sold_via = 'nurtured' where (branch, seq) in (('KCA',14),('SAA',16));
update public.voucher_issues set sold_via = 'blast'    where (branch, seq) in (('KCA',4),('SAA',3),('SAA',5),('SAA',7));
update public.voucher_issues set sold_via = 'blast3'   where (branch, seq) in (('KCA',15),('KCA',16),('AQ',5),('SAA',15));   -- Sally Kabboush, Kate Healy, Emma Nobla (till), Natalia Rwudeko (till)
update public.voucher_issues set sold_via = 'direct'   where (branch, seq) in (('KCA',6),('KCA',9),('SAA',4),('AQ',3));

create or replace function public.voucher_perf_data()
returns json
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select l.id, l.branch, l.tier, l.paid_aed, l.credit_aed, l.redeemed_aed, l.remaining_aed,
           l.payment_method, l.purchase_date, l.main_expires_on, l.friends_so_far,
           l.referral_earned, l.issued_by, i.sold_via, l.is_voided, l.is_archived
      from public.voucher_log l
      left join public.voucher_issues i on i.id = l.id
     where not coalesce(l.is_voided, false) and not coalesce(l.is_archived, false)
  )
  select json_build_object(
    'vouchers',    coalesce((select json_agg(l) from live l), '[]'::json),
    'redemptions', coalesce((select json_agg(json_build_object(
                      'issue_id', u.issue_id, 'redeemed_on', u.redeemed_on, 'amount_aed', u.amount_aed))
                      from public.voucher_redemptions u
                     where u.issue_id in (select id from live)), '[]'::json)
  );
$$;

revoke all on function public.voucher_perf_data() from public;
grant execute on function public.voucher_perf_data() to anon, authenticated;

-- Check: Belle's twelve, one line each.
-- select branch, seq, client_name, issued_by, payment_method, sold_via from public.voucher_issues
--  where lower(btrim(issued_by)) = 'belle' order by purchase_date;
