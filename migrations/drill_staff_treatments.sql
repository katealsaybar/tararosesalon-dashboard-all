-- Kate, 11 Nov 2026: the treatments behind a Treatments figure ("walang treatment name"). Same shape, same guards and same line rules as
-- drill_staff_services / drill_staff_retail (Level 3+, sign-in, no scoped login, BUSINESS lines left out, a paid sale only), but the lines kept
-- are the ones whose item class is the 'treat' family (item_classes, the Client Mix catalogue), so each row is a treatment with its name.
create or replace function public.drill_staff_treatments(p_from date, p_to date, p_branches text[] default null, p_employees text[] default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare out jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to see this list'; end if;
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if public.lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;

  with k as materialized (
    select c.item as ik, (c.family = 'treat') as is_treat
    from public.item_classes((select array_agg(distinct coalesce(item, '')) from sales_transaction_lines where date between p_from and p_to)) c
  ), ln as (
    select l.branch, l.date, trim(l.employee_name) as emp, coalesce(nullif(trim(l.client_name), ''), 'No name') as client, l.item, l.net,
           k.is_treat,
           (bool_or(nullif(trim(l.payment_raw), '') is not null) over (partition by l.branch, l.date, l.sale_id) and l.day_spend_ok) as sale_paid
    from sales_transaction_lines l
    join k on k.ik = coalesce(l.item, '')
    where l.date between p_from and p_to
      and (p_branches is null or l.branch = any(p_branches))
      and coalesce(l.employee_name, '') !~* '^\s*business\M'
      and coalesce(trim(l.employee_name), '') <> ''
      and (p_employees is null or trim(l.employee_name) = any(p_employees))
  ), hit as (
    select * from ln where is_treat and sale_paid
  ), shown as (
    select * from hit order by date desc, branch, emp, client, item limit 5000
  )
  select jsonb_build_object(
    'total', (select count(*) from hit),
    'net', (select coalesce(sum(net), 0) from hit),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('d', date, 'b', branch, 'e', emp, 'c', client, 'i', regexp_replace(coalesce(item, ''), '\s*\(Refund\)\s*$', '', 'i'), 'r', coalesce(item, '') ~* '\(Refund\)\s*$', 'n', round(net, 2)) order by date desc, branch, emp, client, item) from shown), '[]'::jsonb)
  ) into out;
  return out;
end $function$;
revoke all on function public.drill_staff_treatments(date, date, text[], text[]) from public, anon;
grant execute on function public.drill_staff_treatments(date, date, text[], text[]) to authenticated;
