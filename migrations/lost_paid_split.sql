-- Lost Client Blasts, October, Results section 1: two Paid at the till boxes (Kate, 20 Nov 2026).
--   October only    = what the clients we messaged paid at the till from the day of their first message up to 31 Oct 2026, the end of the offer.
--   Special ruled   = what they paid after 31 Oct 2026. The October terms were not set up before the blast, so the end date was exempted;
--                     those sales count only because of that ruling (Kate: "the exempted clients").
-- The two add up to the "paid since" figure lost_campaign_money already gives (actual.total), so nothing changes there.
-- Same rules as lost_campaign_money: sales lines of a messaged client dated on or after her first message day, kept only when the item is a sale
-- (not SKIP), the client is counted as paid when she has a visit line that is not a deposit, balance payment or voucher, not BUSINESS TRS, not Staff.
--
-- WRITTEN ONLY, NOT APPLIED. Additive: one new function, nothing existing is touched. The page copes without it (the two boxes say "Not worked out yet").
-- Level guard copied from lost_campaign_money (Level 4 and above in the UI, 3 in the database).

create or replace function public.lost_paid_split(p_type text default null, p_deadline date default date '2026-10-31') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with sent as (
    select f.client_key as k, f.sent_at
    from public.lost_send_flags f
    where f.status = 'sent' and (nullif(p_type, '') is null or f.qtype = p_type)),
  fs as (select distinct on (k) k, (sent_at at time zone 'Asia/Dubai')::date as d0 from sent order by k, sent_at),
  sl as (
    select s.date, s.item, s.total, public.stl_key_fold(public.stl_client_key(s.client_name)) as k,
           (coalesce(s.employee_name, '') !~* '^\s*business\M' and s.client_name !~* '\mstaff\M'
            and public.stl_item_kind(s.item) not in ('non_sale', 'voucher')
            and bool_or(nullif(trim(s.payment_raw), '') is not null) over (partition by s.branch, s.date, s.sale_id)) as vis_ok
    from public.sales_transaction_lines s
    where s.date >= (select min(d0) from fs) and nullif(trim(s.client_name), '') is not null),
  ln as (select fs.k, sl.date, sl.item, sl.total, sl.vis_ok from fs join sl on sl.k = fs.k and sl.date >= fs.d0),
  cl as (select * from public.item_classes(coalesce((select array_agg(distinct item) from ln), '{}'::text[]))),
  ac as (
    select ln.k, ln.date, ln.total, ln.vis_ok
    from ln join cl c on c.item = ln.item
    where c.category <> 'SKIP' and c.family <> 'skip'),
  w as (
    select k, (date <= p_deadline) as in_oct, sum(total) as spent, bool_or(vis_ok) as vis
    from ac group by k, (date <= p_deadline))
  select jsonb_build_object(
    'at', now(), 'deadline', p_deadline,
    'oct', jsonb_build_object('aed', coalesce((select sum(spent) from w where in_oct), 0),
                              'clients', (select count(*) from w where in_oct and spent > 0 and vis)),
    'special', jsonb_build_object('aed', coalesce((select sum(spent) from w where not in_oct), 0),
                                  'clients', (select count(*) from w where not in_oct and spent > 0 and vis)))
  into out;
  return out;
end $$;

revoke all on function public.lost_paid_split(text, date) from public, anon;
grant execute on function public.lost_paid_split(text, date) to authenticated;
