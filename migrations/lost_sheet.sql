-- Lost Clients: the reception Google Sheet (Kate, 12 Oct 2026, from the coordinators' meeting).
-- Reception cannot open the dashboard (they were taken off dashboard_users on 3 Oct), but they answer most of the
-- replies and know who is a regular. So each branch gets a Google Sheet of its lost clients with a "Take out?" dropdown
-- (the same five reasons as the dashboard). scripts/lost-review/lost_review_sheets.py fills the sheets and reads the
-- dropdowns back every few minutes; this file is the database half.
--
--   lost_lists_core_x(lvl)   the body of lost_lists_core(), with the level passed in. lost_lists_core() is now a
--                            wrapper that checks the signed-in user's level and calls it, so the page is unchanged.
--                            Nobody can call _x directly (execute is revoked); only the two pass-gated functions below.
--   lost_sheet_rows(pass, branch)   one branch's clients (any group, still in or already taken out, booked ones too),
--                            names and dates only, no phone numbers.
--   lost_sheet_apply(pass, set, clear, by)   exclusions typed on a Sheet: set = [{"k": client_key, "r": reason}], clear =
--                            client keys to put back. Written into lost_excluded with set_by = 'Sheet: <branch> ...'.
-- Both gated by the push pass (push_passes), like push_client_roster.

create or replace function public.lost_lists_core_x(p_lvl int)
 returns table(client_key text, client_name text, area text, branch text, last_visit date, days_since integer, last_keratin date, last_colour date, last_toner date, cats text, stylist text, also_saw text, mobile text, n_numbers integer, wa text, last_in date, last_out date, booked_on date, f1 boolean, f2 boolean, f3 boolean, f4 boolean, f5 boolean, held boolean)
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
#variable_conflict use_column
declare lvl int := p_lvl; cfg lost_lists_config;
begin
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
         (j.lost and j.last_keratin between cfg.window_from and cfg.window_to),
         (j.last_keratin >= cfg.window_from and j.last_keratin < current_date - cfg.lost_days),
         (j.lost and j.hascol),
         (j.lost and j.st in ('act','r18','noreply')),
         (j.lost and j.last_other is not null and not j.hascol),
         (j.lost and j.bkd is not null)
  from j;
end $function$;
revoke all on function public.lost_lists_core_x(int) from public, anon, authenticated;

create or replace function public.lost_lists_core()
 returns table(client_key text, client_name text, area text, branch text, last_visit date, days_since integer, last_keratin date, last_colour date, last_toner date, cats text, stylist text, also_saw text, mobile text, n_numbers integer, wa text, last_in date, last_out date, booked_on date, f1 boolean, f2 boolean, f3 boolean, f4 boolean, f5 boolean, held boolean)
 language plpgsql stable security definer
 set search_path to 'public' set statement_timeout to '30s'
as $function$
declare lvl int;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 2 then raise exception 'Lost Clients is for Level 2 and above'; end if;
  return query select * from public.lost_lists_core_x(lvl);
end $function$;

create or replace function public.lost_sheet_rows(p_pass uuid, p_branch text) returns jsonb
language plpgsql stable security definer
set search_path to 'public' set statement_timeout to '60s'
as $function$
declare out jsonb;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if p_branch not in ('SAA','KCA','MC','AQ') then raise exception 'unknown branch'; end if;
  with c as (select * from public.lost_lists_core_x(2) co where co.branch = p_branch and (co.f1 or co.f2 or co.f3 or co.f4 or co.f5))
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', c.client_key, 'client_name', c.client_name, 'area', c.area, 'last_visit', c.last_visit,
      'last_service', greatest(c.last_keratin, c.last_colour, c.last_toner, b.last_other),
      'stylist', c.stylist, 'booked_on', c.booked_on,
      'excluded', e.reason, 'excluded_by', e.set_by) order by lower(c.client_name)), '[]'::jsonb)
  into out
  from c left join lost_lists_base b on b.client_key = c.client_key
         left join lost_excluded e on e.client_key = c.client_key;
  return out;
end $function$;

create or replace function public.lost_sheet_apply(p_pass uuid, p_set jsonb, p_clear text[], p_by text) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare ns int := 0; nc int := 0;
begin
  if not exists (select 1 from push_passes where token = p_pass and active) then raise exception 'bad pass'; end if;
  if jsonb_array_length(coalesce(p_set, '[]'::jsonb)) > 3000 or coalesce(array_length(p_clear, 1), 0) > 3000 then raise exception 'too many at once'; end if;
  insert into lost_excluded (client_key, reason, set_by)
    select distinct on (x->>'k') x->>'k', x->>'r', left(coalesce(p_by, 'Sheet'), 80) from jsonb_array_elements(coalesce(p_set, '[]'::jsonb)) x
    where coalesce(x->>'k', '') <> '' and x->>'r' in ('Visiting regularly','Stylist knows her','Do not contact','Wrong number','Other')
  on conflict (client_key) do update set reason = excluded.reason, set_by = excluded.set_by, set_at = now()
    where lost_excluded.reason is distinct from excluded.reason;
  get diagnostics ns = row_count;
  delete from lost_excluded where client_key = any(coalesce(p_clear, '{}'::text[]));
  get diagnostics nc = row_count;
  return jsonb_build_object('set', ns, 'cleared', nc);
end $function$;
revoke all on function public.lost_sheet_rows(uuid, text) from public;
revoke all on function public.lost_sheet_apply(uuid, jsonb, text[], text) from public;
grant execute on function public.lost_sheet_rows(uuid, text) to anon, authenticated;
grant execute on function public.lost_sheet_apply(uuid, jsonb, text[], text) to anon, authenticated;
