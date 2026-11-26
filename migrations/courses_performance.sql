-- Courses Performance (Kate, 26 Nov 2026): the prepaid courses of Phorest's Courses list, from the till. A course SALE is a line named exactly like the
-- course (AED = what the client paid, VAT included); a SESSION USED is a visit with a line "<course> - <service>" at AED 0. The two are kept apart and never added.
-- A sale = distinct branch + date + sale id; a refund line comes off the day it was given and the refunded course still counts once.
-- ci is the course's number, fixed here and in js/courses-perf.js (CR): 0 to 12 are on Phorest's list or archived, 13 to 23 are names sold at the till that are not on the
-- list now, 24 to 26 are the Glow Club tiers (kept apart on the page, which has its own Glow Club Performance). The key is the item name lower-cased with spaces and commas
-- removed, so spacing variants count. Numbers equal the mockup: 301 sales rows, 1,611 session rows, AED 270,250 over courses 0 to 23, 3 non-zero redemption lines left out.
-- Returns {at, sales:[[ci, branch, date, sale id, AED, refund 1/0]], sess:[[ci, branch, date, sale id, service]], nonzero_red}: numbers only, no client names and no client ids.
-- Level 2 and above, like Active Deals Performance. Read-only over sales_transaction_lines. Applied 26 Nov 2026 (Supabase gvijxenafoowajqktqvd).

create or replace function public.courses_performance() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  with k(ci, key) as (values
    (0, 'facialofchoice(buy3andget1)'), (1, 'infraredlight(buy6andget1)'), (2, 'fibreclinix(buy3andget1)'), (3, 'blowdrypackage(6+1)w/juniorstylist'),
    (4, 'fullbodymassage(buy5andget1)'), (5, 'eyebrowsandupperlip(buy5andget1)'), (6, 'hollywood(buy5andget1)'), (7, 'headneckandshouldermassage(buy5andget1)'),
    (8, 'eyebrowsshapeandtint(buy5andget1)'), (9, 'spoilmerotten'), (10, 'ultimaterelaxation'), (11, 'august15-30promotions'), (12, 'blowdrypromo'),
    (13, '5+1blow-dryfor780aed'), (14, '5+1blowdry'), (15, '5+1blowdrysession'), (16, '5+1blowdrywithhairextension'), (17, '10session-extensionblowdry'),
    (18, '10sessionblowdry'), (19, 'iron10session'), (20, '10+3blowdrypackage'), (21, '10+3blowdrypackage(withsam)'),
    (22, 'blowdrypackage(long)5+1withjuniorstylist'), (23, 'ashleighcourse'),
    (24, 'glowclub-silver(1250aed)'), (24, 'glowclubmembership-silver(1250aed)'), (25, 'glowclub-gold(1750aed)'), (25, 'glowclubmembership-gold(1750aed)'),
    (26, 'glowclub-platinum(2800aed)')),
  n as (
    select s.id, s.branch, s.date, s.sale_id, s.item, s.total, regexp_replace(lower(s.item), '[ ,]', '', 'g') as ni
    from public.sales_transaction_lines s
    where regexp_replace(lower(s.item), '[ ,]', '', 'g') ~ '^(facialofchoice|infraredlight|fibreclinix|blowdrypackage|fullbodymassage|eyebrowsandupperlip|hollywood|headneckandshouldermassage|eyebrowsshapeandtint|spoilmerotten|ultimaterelaxation|august15-30|blowdrypromo|5\+1blow|10session|10\+3blowdry|iron10session|ashleighcourse|glowclub)'),
  m as (
    select distinct on (n.id) n.*, k.ci, (n.ni = k.key or n.ni = k.key || '(refund)') as exact
    from n join k on n.ni = k.key or n.ni = k.key || '(refund)' or n.ni like k.key || '-%'
    order by n.id, length(k.key) desc),
  sales as (
    select ci, branch, date, sale_id, round(sum(total)::numeric, 2) as aed, bool_or(item ~* '\(refund\)\s*$') as ref
    from m where exact group by ci, branch, date, sale_id),
  sess as (
    select ci, branch, date, sale_id, string_agg(distinct regexp_replace(item, '^.* - ', ''), ' + ') as svc
    from m where not exact and total = 0 group by ci, branch, date, sale_id)
  select jsonb_build_object('at', now(),
    'sales', coalesce((select jsonb_agg(jsonb_build_array(ci, branch, date, sale_id, aed, case when ref then 1 else 0 end) order by date, ci, sale_id) from sales), '[]'::jsonb),
    'sess', coalesce((select jsonb_agg(jsonb_build_array(ci, branch, date, sale_id, svc) order by date, ci, sale_id) from sess), '[]'::jsonb),
    'nonzero_red', (select count(*) from m where not exact and total <> 0))
  into out;
  return out;
end $$;

revoke all on function public.courses_performance() from public, anon;
grant execute on function public.courses_performance() to authenticated;

-- The name filter is a full scan of sales_transaction_lines (about 460k lines) without this: a partial index over just the course lines, with the same predicate as the
-- WHERE above so the planner uses it.
create index if not exists stl_courses_idx on public.sales_transaction_lines (date)
  where regexp_replace(lower(item), '[ ,]', '', 'g') ~ '^(facialofchoice|infraredlight|fibreclinix|blowdrypackage|fullbodymassage|eyebrowsandupperlip|hollywood|headneckandshouldermassage|eyebrowsshapeandtint|spoilmerotten|ultimaterelaxation|august15-30|blowdrypromo|5\+1blow|10session|10\+3blowdry|iron10session|ashleighcourse|glowclub)';
