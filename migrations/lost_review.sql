-- Lost Clients: the coordinators' review (Kate, 12 Oct 2026, from the two 12 Oct meetings).
-- Before any blast the salon coordinators check each branch's list (1 to 2 days) and take out whoever is
-- already visiting, is known to a stylist, or must not be contacted. This gives them a switch per client and a
-- sign-off per branch, on the Lost Clients groups table.
--
--   lost_excluded   one row per client taken out of the blast (client_key = the lists' key, so she is out of
--                   every group at once), with the reason, who and when. Delete the row to put her back.
--   lost_review     one row per branch (SAA, KCA, MC, AQ) once a coordinator has marked it reviewed.
--   lost_exclude(keys, reason, note)   Level 2 and above (the coordinators are Level 2).
--   lost_include(keys)                 Level 2 and above; undo.
--   lost_review_set(branch, signed)    Level 2 and above.
-- Nothing is scoped to a branch (dashboard_users.scope is empty for the coordinators); every change records
-- the person's name and the date instead.
--
-- Booked clients are already out of the blast (lost_lists_keep_booked.sql). Excluded clients go the same way:
-- lost_queue() (To message) skips them, the cards count only clients still in, lost_lists() returns excluded /
-- excluded_by / excluded_at on each row, and the page leaves them out of Copy numbers and the files.
-- Additive: same signatures, extra keys only. Tables are reached only through these functions (RLS on, no policy).

create table if not exists public.lost_excluded (
  client_key text primary key,
  reason     text not null,
  note       text,
  set_by     text,
  set_at     timestamptz not null default now()
);
alter table public.lost_excluded enable row level security;
revoke all on public.lost_excluded from anon, authenticated;

create table if not exists public.lost_review (
  branch    text primary key check (branch in ('SAA','KCA','MC','AQ')),
  signed_by text,
  signed_at timestamptz not null default now()
);
alter table public.lost_review enable row level security;
revoke all on public.lost_review from anon, authenticated;

create or replace function public.lost_exclude(p_keys text[], p_reason text, p_note text default null) returns int
language plpgsql security definer set search_path to 'public' as $$
declare who text; n int;
begin
  select m.name into who from public.dashboard_me() m limit 1;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  if p_reason not in ('Visiting regularly','Stylist knows her','Do not contact','Wrong number','Other') then raise exception 'unknown reason'; end if;
  if coalesce(array_length(p_keys, 1), 0) > 500 then raise exception 'too many at once'; end if;
  insert into lost_excluded (client_key, reason, note, set_by)
    select distinct k, p_reason, nullif(btrim(p_note), ''), who from unnest(p_keys) k where k is not null and k <> ''
  on conflict (client_key) do update set reason = excluded.reason, note = excluded.note, set_by = excluded.set_by, set_at = now();
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.lost_include(p_keys text[]) returns int
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  delete from lost_excluded where client_key = any(p_keys);
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.lost_review_set(p_branch text, p_signed boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
declare who text;
begin
  select m.name into who from public.dashboard_me() m limit 1;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then raise exception 'Level 2 and above'; end if;
  if p_branch not in ('SAA','KCA','MC','AQ') then raise exception 'unknown branch'; end if;
  if p_signed then
    insert into lost_review (branch, signed_by) values (p_branch, who)
    on conflict (branch) do update set signed_by = excluded.signed_by, signed_at = now();
  else
    delete from lost_review where branch = p_branch;
  end if;
end $$;

grant execute on function public.lost_exclude(text[], text, text) to authenticated;
grant execute on function public.lost_include(text[]) to authenticated;
grant execute on function public.lost_review_set(text, boolean) to authenticated;

-- One list's rows: excluded / excluded_by / excluded_at added.
create or replace function public.lost_lists(p_list text)
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare out jsonb; since date;
begin
  if p_list not in ('1','2','3','4','5','held') then raise exception 'unknown list'; end if;
  select campaign_from into since from lost_lists_config where id = 1;
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

-- The cards count only clients still in the blast (no booking, not excluded); 'booked' and 'excluded' are the
-- numbers taken out, and 'review' says which branches a coordinator has marked reviewed.
create or replace function public.lost_lists_summary()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare out jsonb;
begin
  with c as (select * from public.lost_lists_core()),
  l as (
    select '1' as id, c.* from c where c.f1 union all select '2', c.* from c where c.f2 union all
    select '3', c.* from c where c.f3 union all select '4', c.* from c where c.f4 union all
    select '5', c.* from c where c.f5 union all select 'held', c.* from c where c.held
  ), x as (select e.client_key from lost_excluded e),
  s as (select * from l where l.id = 'held' or (l.booked_on is null and not exists (select 1 from x where x.client_key = l.client_key)))
  select jsonb_build_object(
    'lists', (select jsonb_object_agg(id, jsonb_build_object('n', n, 'dubai', dubai, 'abu_dhabi', ad, 'wa', wa,
                     'booked', (select count(*) from l b where b.id = z.id and b.booked_on is not null),
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
      'campaign_from', (select campaign_from from lost_lists_config where id = 1)))
  into out;
  return out;
end $function$;

-- To message: excluded clients are out, like booked ones; 'excluded' counts them and 'review' repeats the sign-offs.
create or replace function public.lost_queue()
 returns jsonb
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare lvl int; since date; lostd int; out jsonb;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 3 then raise exception 'To message is for Level 3 and above'; end if;
  select campaign_from, lost_days into since, lostd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core()),
  mk as (
    select distinct on (x.client_key) x.client_key, x.sent_on, x.sent_by
    from lost_messaged x where x.list_id = 'q' order by x.client_key, x.id desc
  ),
  q0 as (
    select c.* from c where (c.f1 or c.f2 or c.f3 or c.f4 or c.f5) and c.booked_on is null
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
