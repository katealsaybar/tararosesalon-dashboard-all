-- Client profile on a complaint (Kate, 12 Nov 2026: "level 3 and up"). One call for the Client profile tab of a complaint record:
-- who she is (name, phone, email only when it is hers), the branches she sits under, how many visits Phorest holds for her, her last visits, and her other complaints.
-- Levels 3 and up (the numbers in the database are the old ones: 3 in the UI is 2 here, and a Bahrain-scoped sign-in is refused), checked here (the Client Book stays Level 5 because it shows every note; this shows no notes, only the visit list and the contact details).
-- Read only. A complaint logged from the form with no Phorest client still answers, from the name and mobile typed on it.
create or replace function public.complaint_client_profile(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' set statement_timeout = '20s' as $$
declare c record; e record; out jsonb; out2 jsonb; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 or (select public.dashboard_scope()) is not null then raise exception 'Client profile is for Levels 3 and up'; end if;
  select x.id, x.phorest_id, x.client_name, x.client_phone, x.branch_code, coalesce(x.complaint_date, x.event_date) as cdate
    into c from public.client_complaints x where x.id = p_id;
  if not found then return null; end if;
  select pe.first_name, pe.last_name, pe.mobile, pe.email, pe.email_status, pe.archived
    into e from public.phorest_client_emails pe
   where pe.phorest_id = c.phorest_id
   order by (pe.branch = c.branch_code) desc, pe.pulled_at desc nulls last limit 1;
  out := jsonb_build_object(
    'id', c.id,
    'phorest_id', c.phorest_id,
    'name', coalesce(nullif(btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''), c.client_name),
    'phone', coalesce(nullif(e.mobile, ''), nullif(c.client_phone, '')),
    'email', case when e.email_status = 'real' then e.email end,
    'email_status', e.email_status,
    'archived', coalesce(e.archived, false),
    'on_phorest', e.first_name is not null or e.last_name is not null or e.mobile is not null,
    'branches', coalesce((select jsonb_agg(distinct b.branch_code) from public.phorest_client_branches b where b.phorest_id = c.phorest_id and b.branch_code is not null), '[]'::jsonb)
  );
  if c.phorest_id is not null then
    -- Visits come from what she was sold (sales_transaction_lines by Phorest client id), because phorest_visit_notes only holds visits that carry a note (13 Nov 2026: Steffy Gabriella's 10 Sep colour was missing).
    -- A visit from the notes table is added only for a day with no sale, and only when it has a service that was not cancelled or a no-show (older than the sales lines, or a sale that was never keyed).
    with sv as (
      select s.date::date as d, min(s.branch) as at,
             jsonb_agg(jsonb_build_object('desc', s.item, 'st', s.employee_name) order by s.item) as items
        from public.sales_transaction_lines s
       where s.client_id = c.phorest_id and s.date::date <= today
       group by s.date::date
    ), nv as (
      select v.visit_date as d, min(trim(v.branch_short)) as at,
             jsonb_agg(jsonb_build_object('desc', i ->> 'desc', 'st', i ->> 'st')) as items
        from public.phorest_visit_notes v
        cross join lateral jsonb_array_elements(coalesce(v.services -> 'items', '[]'::jsonb)) i
       where v.phorest_id = c.phorest_id and v.visit_date <= today
         and coalesce(i ->> 'state', '') not in ('CANCELED', 'NO_SHOW')
         and not exists (select 1 from sv where sv.d = v.visit_date)
       group by v.visit_date
    ), allv as (select * from sv union all select * from nv)
    select jsonb_build_object(
             'visits', count(*),
             'first_visit', min(d),
             'last_visit', max(d),
             'recent', coalesce((select jsonb_agg(jsonb_build_object('date', r.d, 'at', r.at, 'items', r.items) order by r.d desc)
                                   from (select * from allv order by d desc limit 8) r), '[]'::jsonb))
      into out2 from allv;
    out := out || coalesce(out2, jsonb_build_object('visits', 0, 'first_visit', null, 'last_visit', null, 'recent', '[]'::jsonb))
      || jsonb_build_object('others', coalesce((select jsonb_agg(o order by o.date desc nulls last) from (
          select y.id, y.code, coalesce(y.complaint_date, y.event_date) as date, y.complaint_type as type, y.status
            from public.client_complaints y
           where y.phorest_id = c.phorest_id and y.id <> c.id and y.is_complaint and y.duplicate_of is null
           order by coalesce(y.complaint_date, y.event_date) desc nulls last limit 20) o), '[]'::jsonb));
  else
    out := out || jsonb_build_object('visits', 0, 'first_visit', null, 'last_visit', null, 'recent', '[]'::jsonb, 'others', '[]'::jsonb);
  end if;
  return out;
end $$;

revoke all on function public.complaint_client_profile(bigint) from public, anon;
grant execute on function public.complaint_client_profile(bigint) to authenticated;
