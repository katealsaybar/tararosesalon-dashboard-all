-- Lost Clients, Group 6: Consultation follow-up (Kate, 12 Oct 2026, after Cristine's question: "nafilter din po ba ung mga clients who just came in
-- for consultation? Tas di na nagpabook?"). A consultation counts as a visit (it is a zero-value service line), so these clients are never
-- "lost" and never in the blast; they need a call or a message from reception, so they get a list of their own.
--
-- Who: came in for a consultation (an item with "consult" in its name: New Client Consultation, Hair Consultation, Facial Consultation...)
-- between consult_days ago (lost_lists_config.consult_days, 30) and yesterday, at any UAE branch, and
--   * no sale or product on the consultation day, and no visit of any kind after it (so she did not have a service done, and did not return),
--   * no booking from today on (client_bookings).
-- lost_consult_contacted: a reception "I contacted her" mark (who, when), so she is not chased twice. Level 2 and above; the phone number
-- (client_contacts, as on the other lists) is for Level 3 and above only. Additive.

alter table public.lost_lists_config add column if not exists consult_days int not null default 30;

create table if not exists public.lost_consult_contacted (
  client_key   text primary key,
  contacted_on date not null default current_date,
  contacted_by text,
  created_at   timestamptz not null default now()
);
alter table public.lost_consult_contacted enable row level security;
revoke all on public.lost_consult_contacted from anon, authenticated;

create or replace function public.lost_consults() returns jsonb
language plpgsql stable security definer
set search_path to 'public' set statement_timeout to '30s'
as $function$
declare lvl int; cd int; out jsonb;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 2 then raise exception 'Lost Clients is for Level 2 and above'; end if;
  select consult_days into cd from lost_lists_config where id = 1;
  with c0 as (
    select s.client_name, s.branch, s.date, s.item, s.employee_name
    from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= current_date - cd and s.date < current_date
      and s.item ilike '%consult%' and nullif(btrim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
  ), last_c as (
    select distinct on (client_name) client_name, branch, date as consult_on, item, employee_name
    from c0 order by client_name, date desc
  ), after as (
    select l.client_name, l.date, l.item, public.stl_item_kind(l.item) as kind
    from sales_transaction_lines l
    where l.date >= current_date - cd and l.client_name in (select client_name from last_c)
  ), blocked as (
    select distinct a.client_name
    from after a join last_c lc on lc.client_name = a.client_name
    where a.kind not in ('non_sale', 'voucher')
      and ((a.date > lc.consult_on) or (a.date = lc.consult_on and a.item not ilike '%consult%'))
  ), k as (
    select lc.*, public.stl_key_fold(regexp_replace(btrim(lc.client_name), '\s+', ' ', 'g')) as ck
    from last_c lc where lc.client_name not in (select client_name from blocked)
  ), bk as (
    select distinct public.stl_key_fold(b.client_key) as k from client_bookings b where b.date >= current_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', k.ck, 'client_name', k.client_name, 'branch', k.branch,
      'area', case when k.branch in ('MC','AQ') then 'Dubai' else 'Abu Dhabi' end,
      'consult_on', k.consult_on, 'days_since', (current_date - k.consult_on), 'item', k.item, 'by', k.employee_name,
      'mobile', case when lvl >= 3 then (select c2.mobile from client_contacts c2 where public.stl_key_fold(c2.client_key) = k.ck order by c2.updated_at desc limit 1) end,
      'contacted_on', ct.contacted_on, 'contacted_by', ct.contacted_by
    ) order by k.consult_on desc, k.client_name), '[]'::jsonb) into out
  from k left join lost_consult_contacted ct on ct.client_key = k.ck
  where not exists (select 1 from bk where bk.k = k.ck);
  return out;
end $function$;

create or replace function public.lost_consult_mark(p_keys text[], p_on boolean) returns int
language plpgsql security definer set search_path to 'public' as $function$
declare who text; n int;
begin
  select m.name into who from public.dashboard_me() m limit 1;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  if p_on then
    insert into lost_consult_contacted (client_key, contacted_by) select distinct unnest(p_keys), who
    on conflict (client_key) do update set contacted_on = current_date, contacted_by = excluded.contacted_by;
  else
    delete from lost_consult_contacted where client_key = any(p_keys);
  end if;
  get diagnostics n = row_count; return n;
end $function$;

revoke all on function public.lost_consults() from public, anon;
grant execute on function public.lost_consults() to authenticated;
revoke all on function public.lost_consult_mark(text[], boolean) from public, anon;
grant execute on function public.lost_consult_mark(text[], boolean) to authenticated;
