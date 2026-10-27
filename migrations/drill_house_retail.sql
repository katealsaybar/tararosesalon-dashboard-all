-- Clickable figures (Kate, 27 Oct 2026): the retail rung with no stylist, split by what was sold.
-- The ledger keeps one number for it per branch (retailUnattributed) and nothing says whether it was hair or beauty, so the split reads the product names
-- on the BUSINESS TRS lines of the sales lines (that house account is where the front desk rings retail with no stylist against it).
--
--   stl_house_dept(item)                       hair | beauty | unsorted, from the item name. Whole words only (\m \M), so "Brown" is not "brow".
--                                              hair   : hair, scalp, shampoo, conditioner first; then wash, tape(s), nano, weft, invisi, extension, keratin, bond,
--                                                       mousse, rinse, masque, spray, brush, a size such as 20" or 18', blonde, colour names with a size ...
--                                              beauty : face, facial, skin, eclat, cleanser, serum for lash and brow, spf, lip, nail, body, foot, hand, candle,
--                                                       densifiance, vital c, essence, microcurrent ...
--                                              unsorted: anything the words do not settle (shown on its own line, never guessed).
--   drill_house_retail(p_from, p_to, p_branches)   per branch and department: lines and net, on a paid sale, kind product or service (extensions are
--                                              services in the item kind, but retail on the till), not a deposit, voucher or prepaid package, and not a
--                                              blow-dry package or session. Refunds net off. No client names, so signed in and not a scoped login is enough.
--   The page scales each branch's three amounts to the ledger's own figure, so the lines always add to the card; it says so.

create or replace function public.stl_house_dept(p_item text)
returns text
language sql immutable parallel safe
as $$
  select case
    when n ~* '\m(hair\w*|scalp|shampoo|conditioner|conditioning)\M' then 'hair'
    when n ~* '\m(face|facial|skin|skincare|eclat|cleanser|sunscreen|spf|hyaluronic|eye|eyes|lip|lips|nail|nails|polish|lash|lashes|brow|brows|sonic|gua sha|retinol|body|foot|hand|candle|perfume|massage|densifiance|vital c|moisturi[sz]er|toner|essence|exfoliat\w*|peel|collagen|microcurrent)\M' then 'beauty'
    when n ~* '\m(wash|tapes?|tape-in|nanos?|nanobond|weft|invisi\w*|extensions?|keratin|bond\w*|leave-in|mousse|rinse|masque|mask|fibre|fiber|paste|cartridge|brush|comb|spray|gel|wax|pomade|dye|colour|color|bleach|developer|clip|clips|ponytail|halo|fringe|wig|blonde|brond.?mbre|plait|frizz|curl\w*|wave\w*|blowout|texturi\w*|cloud nine)\M'
      or n ~* '\d\s?("|\x27|inch|inches)' then 'hair'
    else 'unsorted' end
  from (select regexp_replace(coalesce(p_item, ''), '\s*\(Refund\)\s*$', '', 'i') as n) b;
$$;

create or replace function public.drill_house_retail(p_from date, p_to date, p_branches text[] default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;

  with ln as (
    select l.branch, public.stl_house_dept(l.item) as dept, l.net,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid,
           public.stl_item_kind(l.item) as kind, coalesce(l.item, '') as item
    from sales_transaction_lines l
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and coalesce(l.employee_name, '') ~* '^\s*business\M'
  ), g as (
    select branch, dept, count(*) as n, round(sum(net), 2) as v
    from ln
    where sale_paid and kind in ('product', 'service')
      and item !~* '(\d\s*\+\s*\d|blow\s?-?dry|session|package)'
    group by branch, dept
  )
  select coalesce(jsonb_agg(jsonb_build_object('b', branch, 'd', dept, 'n', n, 'v', v) order by branch, dept), '[]'::jsonb) into out from g;
  return out;
end $$;
revoke all on function public.drill_house_retail(date, date, text[]) from public, anon;
grant execute on function public.drill_house_retail(date, date, text[]) to authenticated;

-- Per branch, day and department, for the cards (Kate, 27 Oct 2026): aggDailyData shares the retail rung with no stylist between Hair and Beauty from these
-- amounts when the days are loaded, and by credited retail otherwise. Amounts only, no client names, so a scoped login gets its own branch.
create or replace function public.drill_house_retail_days(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  with ln as (
    select l.branch, l.date, public.stl_house_dept(l.item) as dept, l.net,
           bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) as sale_paid,
           public.stl_item_kind(l.item) as kind, coalesce(l.item, '') as item
    from sales_transaction_lines l
    where l.date between p_from and p_to
      and (public.dashboard_scope() is null or l.branch = public.dashboard_scope())
      and coalesce(l.employee_name, '') ~* '^\s*business\M'
  ), g as (
    select branch, date, dept, round(sum(net), 2) as v
    from ln
    where sale_paid and kind in ('product', 'service')
      and item !~* '(\d\s*\+\s*\d|blow\s?-?dry|session|package)'
    group by branch, date, dept
  )
  select coalesce(jsonb_agg(jsonb_build_object('b', branch, 'd', date, 'k', dept, 'v', v) order by date, branch, dept), '[]'::jsonb) into out from g;
  return out;
end $$;
revoke all on function public.drill_house_retail_days(date, date) from public, anon;
grant execute on function public.drill_house_retail_days(date, date) to authenticated;
