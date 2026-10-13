-- The stylist's part of the monthly 1-to-1, written before the meeting (Coach Emma, 7 Oct 2026: the template is
-- pre-sent to staff for self-completion and the answers appear in her view; built 13 Oct 2026).
--   * New record kind 'prep', one per stylist per month (period = first of the month, like the 1-to-1 it feeds).
--     content = { wins: text, social: text, prev: [ { progress: text } ] } (prev lines up with the actions in her last signed 1-to-1).
--   * While the stylist is writing it is her private draft: the leader keys read nothing of it, only that it is being written.
--     Send to Emma (perf_one2one_prep_submit) makes it readable by the leader keys. She can keep editing after sending until
--     that month's 1-to-1 is signed, and the leaders then see the new words.
--   * Leaders never edit it: Coach Emma's own form is separate and the page fills its empty boxes from this record.
--   * perf_one2one_me returns prep in every state to the stylist herself; perf_one2one_get returns it to the leader keys
--     (draft = no words). The leader's 'list' leaves it out.
-- Redefined from the live definitions: perf_one2one_me, perf_one2one_get. New: perf_one2one_prep_save, _prep_submit.

alter table perf_one2one drop constraint if exists perf_one2one_kind_check;
alter table perf_one2one add constraint perf_one2one_kind_check check (kind in ('monthly', 'goals', 'check', 'prep'));

CREATE OR REPLACE FUNCTION public.perf_one2one_me(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s perf_staff;
begin
  select * into s from perf_staff where token = p_token and active;
  if s.id is null or not s.one2one_on then return null; end if;
  return jsonb_build_object(
    'enabled', true,
    'staff', jsonb_build_object('name', s.display_name, 'role', coalesce(s.level, s.dept || ' team'), 'branch', s.branch),
    'numbers', perf_o2o_numbers(s),
    'records', (select coalesce(jsonb_agg(
      case when o.kind in ('goals', 'prep') then jsonb_build_object(
        'kind', o.kind, 'period', o.period, 'updating', false, 'status', o.status,
        'signed_by', o.signed_by, 'signed_at', o.signed_at::text, 'confirmed_at', o.confirmed_at::text,
        'submitted_at', o.submitted_at::text, 'manager_sig', o.manager_sig, 'staff_sig', o.staff_sig,
        'staff_comment', o.staff_comment, 'content', o.content, 'snapshot', o.snapshot, 'updated_at', o.updated_at)
      else jsonb_build_object(
        'kind', o.kind, 'period', o.period,
        'updating', o.status = 'draft',
        'status', case when o.status = 'draft' then (o.history->(-1)->>'status') else o.status end,
        'signed_by', case when o.status = 'draft' then o.history->(-1)->>'signed_by' else o.signed_by end,
        'signed_at', case when o.status = 'draft' then o.history->(-1)->>'signed_at' else o.signed_at::text end,
        'confirmed_at', case when o.status = 'draft' then o.history->(-1)->>'confirmed_at' else o.confirmed_at::text end,
        'manager_sig', case when o.status = 'draft' then o.history->(-1)->>'manager_sig' else o.manager_sig end,
        'staff_sig', case when o.status = 'draft' then o.history->(-1)->>'staff_sig' else o.staff_sig end,
        'staff_comment', case when o.status = 'draft' then o.history->(-1)->>'staff_comment' else o.staff_comment end,
        'content', case when o.status = 'draft' then o.history->(-1)->'content' else o.content end,
        'snapshot', case when o.status = 'draft' then o.history->(-1)->'snapshot' else o.snapshot end) end
        order by o.kind, o.period desc), '[]')
      from perf_one2one o
      where o.staff_id = s.id and (o.kind in ('goals', 'prep') or o.status in ('signed', 'filed') or jsonb_array_length(o.history) > 0))
  );
end $function$;

CREATE OR REPLACE FUNCTION public.perf_one2one_get(p_admin uuid, p_token uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  who text; s perf_staff; mc jsonb;
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  y1 date := date_trunc('year', coalesce(p_month, current_date))::date;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  if who is null then return null; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null or not s.one2one_on then return null; end if;
  select content into mc from perf_one2one where staff_id = s.id and kind = 'monthly' and period = m1;
  return jsonb_build_object(
    'enabled', true, 'who', who, 'month', m1, 'year', y1,
    'can_edit', perf_o2o_editor(p_admin) is not null,
    'editor', (select name from perf_admins where one2one_editor and role = 'leader' limit 1),
    'staff', jsonb_build_object('name', s.display_name, 'role', coalesce(s.level, s.dept || ' team'), 'branch', s.branch),
    'numbers', perf_o2o_numbers(s),
    'numbers_m', perf_o2o_numbers(s, perf_o2o_date(mc->>'period_from'), perf_o2o_date(mc->>'period_to')),
    'monthly', (select to_jsonb(o) - 'staff_id' - 'history' from perf_one2one o where o.staff_id = s.id and o.kind = 'monthly' and o.period = m1),
    'prep',    (select case when o.status = 'draft'
                    then jsonb_build_object('kind', 'prep', 'period', o.period, 'status', 'draft', 'content', '{}'::jsonb, 'updated_at', o.updated_at)
                    else to_jsonb(o) - 'staff_id' - 'history' end
                  from perf_one2one o where o.staff_id = s.id and o.kind = 'prep' and o.period = m1),
    'goals',   (select case when o.status = 'draft'
                    then jsonb_build_object('kind', 'goals', 'period', o.period, 'status', 'draft', 'content', '{}'::jsonb, 'updated_at', o.updated_at)
                    else to_jsonb(o) - 'staff_id' - 'history' end
                  from perf_one2one o where o.staff_id = s.id and o.kind = 'goals' and o.period = y1),
    'checks',  (select coalesce(jsonb_agg(to_jsonb(o) - 'staff_id' - 'history' order by o.period desc), '[]') from perf_one2one o
                 where o.staff_id = s.id and o.kind = 'check' and o.period >= y1 and o.period < (y1 + interval '1 year')::date),
    'previous', (select jsonb_build_object('period', o.period, 'content', o.content) from perf_one2one o
                  where o.staff_id = s.id and o.kind = 'monthly' and o.period < m1 order by o.period desc limit 1),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'period', o.period, 'status', o.status,
                    'signed_by', o.signed_by, 'signed_at', o.signed_at, 'confirmed_at', o.confirmed_at) order by o.period desc), '[]')
               from perf_one2one o where o.staff_id = s.id and o.kind <> 'prep')
  );
end $function$;

-- The stylist writes her part: only the three answers, and only until that month's 1-to-1 is signed.
CREATE OR REPLACE FUNCTION public.perf_one2one_prep_save(p_token uuid, p_period date, p_content jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s perf_staff; per date; cur text; mine jsonb;
begin
  select * into s from perf_staff where token = p_token and active and one2one_on;
  if s.id is null or p_content is null or jsonb_typeof(p_content) <> 'object' or length(p_content::text) > 30000 then return 'denied'; end if;
  per := perf_o2o_period('prep', p_period);
  select status into cur from perf_one2one where staff_id = s.id and kind = 'monthly' and period = per;
  if cur in ('signed', 'filed') then return 'locked'; end if;
  mine := jsonb_build_object(
    'wins',   case when jsonb_typeof(p_content->'wins') = 'string' then p_content->'wins' else '""'::jsonb end,
    'social', case when jsonb_typeof(p_content->'social') = 'string' then p_content->'social' else '""'::jsonb end,
    'prev',   case when jsonb_typeof(p_content->'prev') = 'array' then p_content->'prev' else '[]'::jsonb end);
  insert into perf_one2one (staff_id, kind, period, content, updated_by)
  values (s.id, 'prep', per, mine, s.display_name)
  on conflict (staff_id, kind, period) do update
    set content = mine, updated_by = s.display_name, updated_at = now();
  return 'ok';
end $function$;

-- Send to Emma: the leader keys can read it from now on (again, if she edits and sends once more).
CREATE OR REPLACE FUNCTION public.perf_one2one_prep_submit(p_token uuid, p_period date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s perf_staff; per date; cur text;
begin
  select * into s from perf_staff where token = p_token and active and one2one_on;
  if s.id is null then return 'denied'; end if;
  per := perf_o2o_period('prep', p_period);
  select status into cur from perf_one2one where staff_id = s.id and kind = 'monthly' and period = per;
  if cur in ('signed', 'filed') then return 'locked'; end if;
  update perf_one2one set status = 'submitted', submitted_at = now(), updated_by = s.display_name, updated_at = now()
   where staff_id = s.id and kind = 'prep' and period = per;
  return case when found then 'ok' else 'nothing to send' end;
end $function$;

grant execute on function perf_one2one_me(uuid)                          to anon, authenticated;
grant execute on function perf_one2one_get(uuid, uuid, date)             to anon, authenticated;
grant execute on function perf_one2one_prep_save(uuid, date, jsonb)      to anon, authenticated;
grant execute on function perf_one2one_prep_submit(uuid, date)           to anon, authenticated;
