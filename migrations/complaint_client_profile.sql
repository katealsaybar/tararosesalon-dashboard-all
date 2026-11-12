-- Client profile on a complaint (Kate, 12 Nov 2026: "level 3 and up"). One call for the Client profile tab of a complaint record:
-- who she is (name, phone, email only when it is hers), the branches she sits under, how many visits Phorest holds for her, her last visits, and her other complaints.
-- Levels 3 and up, checked here (the Client Book stays Level 5 because it shows every note; this shows no notes, only the visit list and the contact details).
-- Read only. A complaint logged from the form with no Phorest client still answers, from the name and mobile typed on it.
create or replace function public.complaint_client_profile(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' set statement_timeout = '20s' as $$
declare c record; e record; out jsonb; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Client profile is for Levels 3 and up'; end if;
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
    out := out || jsonb_build_object(
      'visits', (select count(distinct v.visit_id) from public.phorest_visit_notes v where v.phorest_id = c.phorest_id and v.visit_date <= today),
      'first_visit', (select min(v.visit_date) from public.phorest_visit_notes v where v.phorest_id = c.phorest_id),
      'last_visit', (select max(v.visit_date) from public.phorest_visit_notes v where v.phorest_id = c.phorest_id and v.visit_date <= today),
      'recent', coalesce((select jsonb_agg(r order by r.date desc) from (
          select v.visit_date as date, trim(v.branch_short) as at,
                 coalesce((select jsonb_agg(jsonb_build_object('desc', i ->> 'desc', 'st', i ->> 'st'))
                             from jsonb_array_elements(coalesce(v.services -> 'items', '[]'::jsonb)) i
                            where coalesce(i ->> 'state', '') not in ('CANCELED', 'NO_SHOW')), '[]'::jsonb) as items
            from public.phorest_visit_notes v
           where v.phorest_id = c.phorest_id and v.visit_date <= today
           order by v.visit_date desc, v.visit_id limit 8) r), '[]'::jsonb),
      'others', coalesce((select jsonb_agg(o order by o.date desc nulls last) from (
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
