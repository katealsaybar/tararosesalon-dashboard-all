-- Lost Clients: campaign lists (Kate, 9 Oct 2026).
-- Coach Emma's five lists (smoothing lost, smoothing not back, colour, all 6m+ on WhatsApp,
-- other services), each with the client's WhatsApp status from respond.io, so the page can
-- show who is ready to message and who is text only. Additive: nothing existing is touched.
--
--   stl_key_fold(name)       the client key with a name Phorest stored twice folded to one copy
--                            ("anika berger anika berger" -> "anika berger")
--   lost_lists_config        the window and the "lost" age, one row
--   lost_lists_base          one row per client, rebuilt nightly by lost_lists_refresh()
--   lost_wa_status           respond.io status per phone, filled by the respond-status-sync edge function
--   lost_messaged            "Mark sent" ticks, so nobody is messaged twice
--   lost_lists(p_list)       the rows of one list (Level 2+; phones only for Level 3+)
--   lost_lists_summary()     the cards: size and WhatsApp mix of every list
--   lost_mark_sent / lost_unmark_sent
--
-- Everything reads through these functions (security definer, level checked inside); the
-- tables have RLS on and no policy, so only the functions and the service role can read them.

create or replace function public.stl_key_fold(p_name text) returns text
language sql immutable as $$
  select case when length(k) % 2 = 1
               and substr(k, (length(k) + 1) / 2, 1) = ' '
               and substr(k, 1, (length(k) - 1) / 2) = substr(k, (length(k) + 3) / 2)
              then substr(k, 1, (length(k) - 1) / 2) else k end
  from (select public.stl_client_key(p_name) as k) s
$$;

create table if not exists public.lost_lists_config (
  id int primary key default 1 check (id = 1),
  since date not null default '2025-01-01',          -- how far back sales are read ("2025 lang muna")
  window_from date not null default '2025-05-01',    -- Emma's window for "had the service"
  window_to date not null default '2026-05-31',
  lost_days int not null default 183                 -- 6 months
);
insert into public.lost_lists_config (id) values (1) on conflict do nothing;
alter table public.lost_lists_config enable row level security;

create table if not exists public.lost_lists_base (
  client_key text primary key,
  client_name text not null,
  area text not null,                 -- 'Dubai' (Motor City, Al Quoz) or 'Abu Dhabi' (Saadiyat, Khalifa City A)
  last_branch text not null,
  last_visit date not null,
  visits int not null,
  last_keratin date,                  -- smoothing (Phorest category KERATIN), any date since 'since'
  last_colour date,                   -- colouring, highlights, balayage, bleach, inside the window
  last_toner date,                    -- toning, inside the window
  last_other date,                    -- any other service, inside the window
  cats text,                          -- the categories of the services in the window
  stylist text,
  also_saw text,
  phones text,                        -- ' / ' between numbers, from client_contacts
  refreshed_at timestamptz not null default now()
);
alter table public.lost_lists_base enable row level security;

create table if not exists public.lost_wa_status (
  phone text primary key,
  found boolean not null default false,
  contact_id bigint,
  is_blocked boolean not null default false,
  last_in timestamptz,                -- last message the client sent us (newest of the last 50 messages)
  last_out timestamptz,
  err text,
  checked_at timestamptz not null default now()
);
alter table public.lost_wa_status enable row level security;

create table if not exists public.lost_messaged (
  id bigserial primary key,
  client_key text not null,
  list_id text not null,
  sent_on date not null default current_date,
  sent_by text,
  created_at timestamptz not null default now()
);
create index if not exists lost_messaged_key on public.lost_messaged (client_key, list_id);
alter table public.lost_messaged enable row level security;

-- Rebuild the client table. Cron at 21:50 UTC; Level 4+ may run it by hand.
create or replace function public.lost_lists_refresh() returns int
language plpgsql security definer set search_path = public set statement_timeout = '120s' as $$
declare cfg lost_lists_config; n int;
begin
  if auth.uid() is not null and coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 4 then
    raise exception 'Level 4 and above';
  end if;
  select * into cfg from lost_lists_config where id = 1;
  create temp table _items on commit drop as
    select distinct coalesce(s.item, '') as item from sales_transaction_lines s
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= cfg.since;
  create temp table _ic on commit drop as
    select i.item, public.stl_item_kind(i.item) as kind, x.category, x.family
    from _items i left join lateral (select category, family from public.item_classes(array[i.item]) limit 1) x on true;
  create temp table _lines on commit drop as
    select public.stl_key_fold(s.client_name) as k, s.client_name, s.branch, s.date, s.employee_name,
           c.kind, c.category, c.family
    from sales_transaction_lines s join _ic c on c.item = coalesce(s.item, '')
    where s.branch in ('SAA','KCA','MC','AQ') and s.date >= cfg.since
      and nullif(trim(s.client_name), '') is not null and s.client_name !~* '^\s*walk[\s-]*in\M'
      and c.kind not in ('non_sale', 'voucher');
  create temp table _team on commit drop as
    select k, employee_name, count(*) as n, max(date) as last, row_number() over (partition by k order by count(*) desc, max(date) desc) as rn
    from _lines where coalesce(employee_name, '') <> '' and employee_name !~* '^\s*business\M' group by k, employee_name;
  create index on _team (k);
  create temp table _ph on commit drop as
    select public.stl_key_fold(c.client_key) as k, btrim(x) as phone
    from client_contacts c, unnest(string_to_array(c.mobile, ' / ')) x
    where coalesce(c.mobile, '') <> '' and btrim(x) ~ '^\+\d{9,15}$';
  create index on _ph (k);
  delete from lost_lists_base;
  insert into lost_lists_base (client_key, client_name, area, last_branch, last_visit, visits, last_keratin, last_colour, last_toner,
                               last_other, cats, stylist, also_saw, phones)
  select l.k, (array_agg(l.client_name order by length(l.client_name), l.client_name))[1],
         case when (array_agg(l.branch order by l.date desc))[1] in ('MC','AQ') then 'Dubai' else 'Abu Dhabi' end,
         (array_agg(l.branch order by l.date desc))[1], max(l.date), count(distinct l.date)::int,
         max(l.date) filter (where l.category = 'KERATIN'),
         max(l.date) filter (where l.category in ('BALAYAGE','BLEACHING','COLOURING','HIGHLIGHTS') and l.date between cfg.window_from and cfg.window_to),
         max(l.date) filter (where l.category = 'TONING' and l.date between cfg.window_from and cfg.window_to),
         max(l.date) filter (where l.kind = 'service' and l.family not in ('retail','skip','colour') and l.category <> 'SKIP'
                             and l.date between cfg.window_from and cfg.window_to),
         string_agg(distinct l.category, ', ') filter (where l.kind = 'service' and l.family not in ('retail','skip')
                             and l.date between cfg.window_from and cfg.window_to),
         (select t.employee_name from _team t where t.k = l.k and t.rn = 1),
         (select string_agg(t.employee_name, ', ' order by t.rn) from _team t where t.k = l.k and t.rn between 2 and 5),
         (select string_agg(distinct p.phone, ' / ') from _ph p where p.k = l.k)
  from _lines l group by l.k
  having max(l.date) < current_date - cfg.lost_days or max(l.date) filter (where l.category = 'KERATIN') >= cfg.window_from;
  get diagnostics n = row_count;
  return n;
end $$;

-- Every client on every list, with the flags. Level 2+; phones only for Level 3+.
create or replace function public.lost_lists_core() returns table (
  client_key text, client_name text, area text, branch text, last_visit date, days_since int,
  last_keratin date, last_colour date, last_toner date, cats text, stylist text, also_saw text,
  mobile text, n_numbers int, wa text, last_in date, last_out date, booked_on date,
  f1 boolean, f2 boolean, f3 boolean, f4 boolean, f5 boolean, held boolean)
language plpgsql stable security definer set search_path = public set statement_timeout = '30s' as $$
#variable_conflict use_column
declare lvl int; cfg lost_lists_config;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 2 then raise exception 'Lost Clients is for Level 2 and above'; end if;
  select * into cfg from lost_lists_config where id = 1;
  return query
  with bk as (
    select public.stl_key_fold(b.client_key) as k, min(b.date) as booked_on from client_bookings b where b.date >= current_date group by 1
  ), ws as (
    select b.client_key as k,
           bool_or(w.is_blocked) as blk,
           bool_or(w.found and w.last_in > now() - interval '365 days') as a12,
           bool_or(w.found and w.last_in > now() - interval '548 days') as a18,
           bool_or(w.found) as fnd,
           bool_or(w.err like 'contact 400') as inv,
           bool_or(w.checked_at is not null and w.err is null) as okk,
           bool_or(w.checked_at is not null) as chk,
           max(w.last_in) as li, max(w.last_out) as lo
    from lost_lists_base b
    cross join lateral unnest(string_to_array(b.phones, ' / ')) as x
    left join lost_wa_status w on w.phone = btrim(x)
    where b.phones is not null group by b.client_key
  ), j as (
    select b.*, bk.booked_on as bkd,
      case when b.phones is null then 'nonum'
           when ws.blk then 'blocked'
           when ws.a12 then 'act'
           when ws.a18 then 'r18'
           when ws.fnd then 'noreply'
           when not coalesce(ws.chk, false) then 'unchecked'
           when ws.inv and not ws.okk then 'nonum'
           else 'text' end as st,
      ws.li, ws.lo,
      (b.last_visit < current_date - cfg.lost_days) as lost,
      (b.last_colour is not null or b.last_toner is not null) as hascol
    from lost_lists_base b left join bk on bk.k = b.client_key left join ws on ws.k = b.client_key
  )
  select j.client_key, j.client_name, j.area, j.last_branch, j.last_visit, (current_date - j.last_visit)::int,
         j.last_keratin, j.last_colour, j.last_toner, j.cats, j.stylist, j.also_saw,
         case when lvl >= 3 then j.phones end, coalesce(array_length(string_to_array(j.phones, ' / '), 1), 0), j.st,
         j.li::date, j.lo::date, j.bkd,
         (j.lost and j.bkd is null and j.last_keratin between cfg.window_from and cfg.window_to),
         (j.bkd is null and j.last_keratin >= cfg.window_from and j.last_keratin < current_date - cfg.lost_days),
         (j.lost and j.bkd is null and j.hascol),
         (j.lost and j.bkd is null and j.st in ('act','r18','noreply')),
         (j.lost and j.bkd is null and j.last_other is not null and not j.hascol),
         (j.lost and j.bkd is not null)
  from j;
end $$;

-- One list's rows as jsonb, newest lost first.
create or replace function public.lost_lists(p_list text) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '30s' as $$
declare out jsonb;
begin
  if p_list not in ('1','2','3','4','5','held') then raise exception 'unknown list'; end if;
  with c as (select * from public.lost_lists_core()),
  m as (
    select distinct on (x.client_key) x.client_key, x.sent_on, x.sent_by
    from lost_messaged x where x.list_id = p_list order by x.client_key, x.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', c.client_key, 'client_name', c.client_name, 'area', c.area, 'branch', c.branch,
      'last_visit', c.last_visit, 'days_since', c.days_since, 'last_keratin', c.last_keratin,
      'last_colour', c.last_colour, 'last_toner', c.last_toner, 'cats', c.cats,
      'stylist', c.stylist, 'also_saw', c.also_saw, 'mobile', c.mobile, 'n_numbers', c.n_numbers,
      'wa', c.wa, 'last_in', c.last_in, 'last_out', c.last_out, 'booked_on', c.booked_on,
      'also_on', (select jsonb_agg(v) from (values (case when c.f1 then '1' end), (case when c.f2 then '2' end), (case when c.f3 then '3' end),
                   (case when c.f4 then '4' end), (case when c.f5 then '5' end)) t(v) where v is not null),
      'still', (p_list = '2' and c.last_visit >= current_date - (select lost_days from lost_lists_config where id = 1)),
      'toner_only', (c.last_colour is null and c.last_toner is not null),
      'sent_on', m.sent_on, 'sent_by', m.sent_by,
      'sent_all', (select jsonb_agg(jsonb_build_object('l', z.list_id, 'on', z.sent_on, 'by', z.sent_by))
                   from (select distinct on (y.list_id) y.list_id, y.sent_on, y.sent_by from lost_messaged y
                         where y.client_key = c.client_key order by y.list_id, y.id desc) z)
    ) order by c.last_visit desc), '[]'::jsonb) into out
  from c left join m on m.client_key = c.client_key
  where case p_list when '1' then c.f1 when '2' then c.f2 when '3' then c.f3 when '4' then c.f4 when '5' then c.f5 else c.held end;
  return out;
end $$;

-- The cards: size, area split and WhatsApp mix of each list, plus how fresh each feed is.
create or replace function public.lost_lists_summary() returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '30s' as $$
declare out jsonb;
begin
  with c as (select * from public.lost_lists_core()),
  l as (
    select '1' as id, c.* from c where c.f1 union all select '2', c.* from c where c.f2 union all
    select '3', c.* from c where c.f3 union all select '4', c.* from c where c.f4 union all
    select '5', c.* from c where c.f5 union all select 'held', c.* from c where c.held
  )
  select jsonb_build_object(
    'lists', (select jsonb_object_agg(id, jsonb_build_object('n', n, 'dubai', dubai, 'abu_dhabi', ad, 'wa', wa))
              from (select id, count(*) as n, count(*) filter (where area = 'Dubai') as dubai, count(*) filter (where area = 'Abu Dhabi') as ad,
                           jsonb_object_agg(wa, k) as wa
                    from (select id, area, wa, count(*) over (partition by id, wa) as k from l) q group by id) z),
    'fresh', jsonb_build_object(
      'sales_to', (select max(date) from sales_transaction_lines where branch in ('SAA','KCA','MC','AQ')),
      'bookings_pulled', (select max(pulled_on) from client_bookings),
      'wa_checked', (select max(checked_at) from lost_wa_status),
      'base_built', (select max(refreshed_at) from lost_lists_base)))
  into out;
  return out;
end $$;

create or replace function public.lost_mark_sent(p_keys text[], p_list text) returns int
language plpgsql security definer set search_path = public as $$
declare who text; n int;
begin
  select m.name into who from public.dashboard_me() m limit 1;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  if p_list not in ('1','2','3','4','5') then raise exception 'unknown list'; end if;
  insert into lost_messaged (client_key, list_id, sent_by) select unnest(p_keys), p_list, who;
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.lost_unmark_sent(p_keys text[], p_list text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  delete from lost_messaged where list_id = p_list and client_key = any(p_keys);
  get diagnostics n = row_count; return n;
end $$;

-- Used only by the respond-status-sync edge function (service role): the numbers still to check, and where the answers go.
create or replace function public.lost_wa_queue(p_limit int default 400, p_stale interval default '20 hours') returns text[]
language sql security definer set search_path = public as $$
  select coalesce(array_agg(phone), '{}') from (
    select p.phone from (select distinct btrim(x) as phone from lost_lists_base b, unnest(string_to_array(b.phones, ' / ')) x where b.phones is not null) p
    left join lost_wa_status w on w.phone = p.phone
    where w.phone is null or w.checked_at < now() - p_stale
    order by w.checked_at nulls first limit p_limit) q
$$;

create or replace function public.lost_wa_save(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into lost_wa_status (phone, found, contact_id, is_blocked, last_in, last_out, err, checked_at)
  select r->>'phone', coalesce((r->>'found')::boolean, false), nullif(r->>'contact_id', '')::bigint, coalesce((r->>'is_blocked')::boolean, false),
         to_timestamp(nullif(r->>'last_in', '')::double precision), to_timestamp(nullif(r->>'last_out', '')::double precision), r->>'err', now()
  from jsonb_array_elements(p_rows) r
  on conflict (phone) do update set found = excluded.found, contact_id = excluded.contact_id, is_blocked = excluded.is_blocked,
    last_in = excluded.last_in, last_out = excluded.last_out, err = excluded.err, checked_at = excluded.checked_at;
  get diagnostics n = row_count; return n;
end $$;

-- Who may call what. The page and the edge function go through these only. Supabase grants new
-- functions to anon and authenticated by default, so those are taken away explicitly.
revoke all on function public.lost_lists_refresh(), public.lost_lists_core(), public.lost_lists(text), public.lost_lists_summary(),
  public.lost_mark_sent(text[], text), public.lost_unmark_sent(text[], text), public.lost_wa_queue(int, interval), public.lost_wa_save(jsonb)
  from public, anon, authenticated;
grant execute on function public.lost_lists(text), public.lost_lists_summary(), public.lost_mark_sent(text[], text),
  public.lost_unmark_sent(text[], text), public.lost_lists_refresh() to authenticated;
grant execute on function public.lost_lists_refresh(), public.lost_wa_queue(int, interval), public.lost_wa_save(jsonb), public.lost_lists_core() to service_role;
