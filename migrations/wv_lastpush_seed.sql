-- One-off seed for wv_lastpush (Kate, 23 Oct 2026): the list as it stood on 23 Oct, from the scratch tables built 21 Oct on gvijxenafoowajqktqvd
-- (wv_final_push_cand_tmp, wv_final_push_warm_tmp, campaign_seg_draft_tmp). Run once after wv_lastpush.sql, then the scratch tables can be dropped.
-- Expected: 20 warm (SAA 8, KCA 8, AQ 4) + 292 clean (SAA 127, KCA 129, AQ 36) = 312.
-- clean: 2026 spend 2,000+, found in respond.io, not blocked, not opted out, wrote to a branch number in the last 12 months, no lightening line (balayage, foil,
--        blonde package, bleach) in the last 12 months, not on the Lost Clients stop, do-not-contact or wrong-number lists.
-- warm : carries wv-tell-me-more or wv-reserve-mine in GHL, not wv-paid, found in respond.io, not blocked, not opted out.

with names as (
  select branch, public.stl_client_key(client_name) as k, max(client_name) as nm
    from public.sales_transaction_lines where year = 2026 and branch in ('SAA', 'KCA', 'AQ') and coalesce(client_name, '') <> '' group by 1, 2),
clean as (
  select c.branch, c.client_key, coalesce(n.nm, initcap(c.client_key)) as client, c.phone, 'clean'::text as seg, c.spend, c.last_visit, c.last_in_branch as last_wrote
    from public.wv_final_push_cand_tmp c
    left join public.campaign_seg_draft_tmp s using (client_key)
    left join names n on n.branch = c.branch and n.k = c.client_key
   where c.spend >= 2000 and coalesce(c.found, false) and not coalesce(c.is_blocked, false) and not coalesce(c.opted_out, false)
     and c.last_in_branch > now() - interval '12 months'
     and s.light is not true and s.excl_optout is not true and s.excl_dnc is not true and s.excl_wrong is not true),
warm as (
  select w.branch, b.client_key, b.client, w.phone, 'warm'::text as seg, b.spend, b.last_visit, w.last_in_branch as last_wrote
    from public.wv_final_push_warm_tmp w
    join public.wv_blast b on b.branch = w.branch and b.phone = w.phone
   where w.ghl_tags && array['wv-tell-me-more', 'wv-reserve-mine'] and not (w.ghl_tags && array['wv-paid'])
     and coalesce(w.found, false) and not coalesce(w.is_blocked, false) and not coalesce(w.opted_out, false))
insert into public.wv_lastpush (branch, client_key, client, phone, seg, spend, last_visit, last_wrote, listed_on)
select branch, client_key, client, phone, seg, spend, last_visit, last_wrote, date '2026-10-23' from warm
union all
select branch, client_key, client, phone, seg, spend, last_visit, last_wrote, date '2026-10-23' from clean
on conflict (branch, client_key) do nothing;
