-- Lost Clients: someone who came in within the last 6 weeks is not blasted (Kate, 12 Oct 2026, the coordinators' Zoom).
-- The coordinators: a client who has just been in (colour and highlights come back every 6 to 7 weeks, smoothing clients who still visit
-- for other services) is not due, and a "we've missed you" message to her reads wrong. 4 weeks was the first suggestion, then 6.
--
-- Only group 2's "still visiting" clients can be that recent (every other group needs 6 months without a visit), so the rule changes
-- little but it matters for them. Like a booked client she stays on her group's table, labelled Recent visit, and is left out of
-- To message, the cards' numbers and the review sheets. The number of days is lost_lists_config.recent_days (default 42), so it changes
-- in one place:  update public.lost_lists_config set recent_days = 28 where id = 1;
--   * lost_lists()          each row has recent (true/false)
--   * lost_lists_summary()  the cards count only clients still in; 'recent' is the number kept out for it, per group
--   * lost_queue()          skips them; 'recent' counts them (the Left out card)
--   * lost_sheet_rows()     they are not on the review sheets (nothing for a coordinator to review)
-- Additive; same signatures.

alter table public.lost_lists_config add column if not exists recent_days int not null default 42;

create or replace function public.lost_lists(p_list text)
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare out jsonb; since date; rd int;
begin
  if p_list not in ('1','2','3','4','5','held') then raise exception 'unknown list'; end if;
  select campaign_from, recent_days into since, rd from lost_lists_config where id = 1;
  with c as (
    select co.*, b.last_other
    from public.lost_lists_core() co
    left join public.lost_lists_base b on b.client_key = co.client_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', c.client_key, 'client_name', c.client_name, 'area', c.area, 'branch', c.branch,
      'last_visit', c.last_visit, 'days_since', c.days_since, 'last_keratin', c.last_keratin,
      'last_colour', c.last_colour, 'last_toner', c.last_toner, 'cats', c.cats,
      'last_other', c.last_other,
      'last_service', greatest(c.last_keratin, c.last_colour, c.last_toner, c.last_other),
      'stylist', c.stylist, 'also_saw', c.also_saw, 'mobile', c.mobile, 'n_numbers', c.n_numbers,
      'wa', c.wa, 'last_in', c.last_in, 'last_out', c.last_out, 'booked_on', c.booked_on,
      'recent', (c.last_visit >= current_date - rd),
      'excluded', e.reason, 'excluded_note', e.note, 'excluded_by', e.set_by, 'excluded_at', e.set_at,
      'also_on', (select jsonb_agg(v) from (values (case when c.f1 then '1' end), (case when c.f2 then '2' end), (case when c.f3 then '3' end),
                   (case when c.f4 then '4' end), (case when c.f5 then '5' end)) t(v) where v is not null),
      'still', (p_list = '2' and c.last_visit >= current_date - (select lost_days from lost_lists_config where id = 1)),
      'toner_only', (c.last_colour is null and c.last_toner is not null),
      'messaged', (c.last_out is not null and c.last_out >= since)
    ) order by c.last_visit desc), '[]'::jsonb) into out
  from c left join lost_excluded e on e.client_key = c.client_key
  where case p_list when '1' then c.f1 when '2' then c.f2 when '3' then c.f3 when '4' then c.f4 when '5' then c.f5 else c.held end;
  return out;
end $function$;

create or replace function public.lost_lists_summary()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare out jsonb; rd int;
begin
  select recent_days into rd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core()),
  l as (
    select '1' as id, c.* from c where c.f1 union all select '2', c.* from c where c.f2 union all
    select '3', c.* from c where c.f3 union all select '4', c.* from c where c.f4 union all
    select '5', c.* from c where c.f5 union all select 'held', c.* from c where c.held
  ), x as (select e.client_key from lost_excluded e),
  s as (select * from l where l.id = 'held' or (l.booked_on is null and l.last_visit < current_date - rd and not exists (select 1 from x where x.client_key = l.client_key)))
  select jsonb_build_object(
    'lists', (select jsonb_object_agg(id, jsonb_build_object('n', n, 'dubai', dubai, 'abu_dhabi', ad, 'wa', wa,
                     'booked', (select count(*) from l b where b.id = z.id and b.booked_on is not null),
                     'recent', (select count(*) from l b where b.id = z.id and b.booked_on is null and b.last_visit >= current_date - rd),
                     'excluded', (select count(*) from l b where b.id = z.id and b.booked_on is null
                                  and exists (select 1 from x where x.client_key = b.client_key))))
              from (select id, count(*) as n, count(*) filter (where area = 'Dubai') as dubai, count(*) filter (where area = 'Abu Dhabi') as ad,
                           jsonb_object_agg(wa, k) as wa
                    from (select id, area, wa, count(*) over (partition by id, wa) as k from s) q group by id) z),
    'review', (select coalesce(jsonb_object_agg(r.branch, jsonb_build_object('by', r.signed_by, 'at', r.signed_at)), '{}'::jsonb) from lost_review r),
    'fresh', jsonb_build_object(
      'sales_to', (select max(date) from sales_transaction_lines where branch in ('SAA','KCA','MC','AQ')),
      'bookings_pulled', (select max(pulled_on) from client_bookings),
      'wa_checked', (select max(checked_at) from lost_wa_status),
      'base_built', (select max(refreshed_at) from lost_lists_base),
      'campaign_from', (select campaign_from from lost_lists_config where id = 1),
      'recent_days', rd))
  into out;
  return out;
end $function$;

create or replace function public.lost_queue()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare lvl int; since date; lostd int; rd int; out jsonb;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 3 then raise exception 'To message is for Level 3 and above'; end if;
  select campaign_from, lost_days, recent_days into since, lostd, rd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core()),
  mk as (
    select distinct on (x.client_key) x.client_key, x.sent_on, x.sent_by
    from lost_messaged x where x.list_id = 'q' order by x.client_key, x.id desc
  ),
  q0 as (
    select c.* from c where (c.f1 or c.f2 or c.f3 or c.f4 or c.f5) and c.booked_on is null and c.last_visit < current_date - rd
  ),
  q as (
    select c.*, m.sent_on as mk_on, m.sent_by as mk_by,
      case when c.f3 then 'colour'
           when c.f1 or c.f2 then (case when c.f1 or c.last_visit < current_date - lostd then 'smoothing_lost' else 'smoothing_still' end)
           when c.f5 then 'other' else 'catchall' end as qtype,
      greatest(case when c.last_out >= since then c.last_out end, m.sent_on) as sent_date
    from q0 c left join mk m on m.client_key = c.client_key
    where not exists (select 1 from lost_excluded e where e.client_key = c.client_key)
  )
  select jsonb_build_object(
    'campaign_from', since,
    'held', (select count(*) from c where c.held),
    'recent', (select count(*) from c where (c.f1 or c.f2 or c.f3 or c.f4 or c.f5) and c.booked_on is null and c.last_visit >= current_date - rd),
    'recent_days', rd,
    'excluded', (select count(*) from q0 where exists (select 1 from lost_excluded e where e.client_key = q0.client_key)),
    'review', (select coalesce(jsonb_object_agg(r.branch, jsonb_build_object('by', r.signed_by, 'at', r.signed_at)), '{}'::jsonb) from lost_review r),
    'skipped', jsonb_build_object('nonum', count(*) filter (where q.wa = 'nonum'), 'blocked', count(*) filter (where q.wa = 'blocked'),
                                  'unchecked', count(*) filter (where q.wa = 'unchecked')),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'client_key', q.client_key, 'client_name', q.client_name, 'area', q.area, 'branch', q.branch,
      'last_visit', q.last_visit, 'days_since', q.days_since, 'last_keratin', q.last_keratin, 'last_colour', q.last_colour,
      'last_toner', q.last_toner, 'stylist', q.stylist, 'also_saw', q.also_saw, 'mobile', q.mobile, 'n_numbers', q.n_numbers,
      'wa', q.wa, 'last_in', q.last_in, 'last_out', q.last_out, 'qtype', q.qtype,
      'also_on', (select jsonb_agg(v) from (values (case when q.f1 then '1' end), (case when q.f2 then '2' end), (case when q.f3 then '3' end),
                   (case when q.f4 then '4' end), (case when q.f5 then '5' end)) t(v) where v is not null),
      'messaged', q.sent_date is not null,
      'sent_on', q.sent_date,
      'sent_by', case when q.sent_date is null then null when q.mk_on = q.sent_date then coalesce(q.mk_by, 'marked') else 'respond.io' end,
      'by_mark', (q.mk_on is not null and q.mk_on = q.sent_date),
      'replied', (q.sent_date is not null and q.last_in is not null and q.last_in >= q.sent_date)
    ) order by q.last_visit desc) filter (where q.wa in ('act', 'r18', 'noreply', 'text')), '[]'::jsonb))
  into out from q;
  return out;
end $function$;

create or replace function public.lost_sheet_rows(p_pass uuid, p_branch text) returns jsonb
language plpgsql stable security definer
set search_path to 'public' set statement_timeout to '60s'
as $function$
declare out jsonb; rd int;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_branch not in ('SAA','KCA','MC','AQ') then raise exception 'unknown branch'; end if;
  select recent_days into rd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core_x(2) co
             where co.branch = p_branch and (co.f1 or co.f2 or co.f3 or co.f4 or co.f5) and co.last_visit < current_date - rd)
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', c.client_key, 'client_name', c.client_name, 'area', c.area, 'last_visit', c.last_visit,
      'last_service', greatest(c.last_keratin, c.last_colour, c.last_toner, b.last_other),
      'stylist', c.stylist, 'booked_on', c.booked_on,
      'excluded', e.reason, 'excluded_note', e.note, 'excluded_by', e.set_by) order by lower(c.client_name)), '[]'::jsonb)
  into out
  from c left join lost_lists_base b on b.client_key = c.client_key
         left join lost_excluded e on e.client_key = c.client_key;
  return out;
end $function$;
