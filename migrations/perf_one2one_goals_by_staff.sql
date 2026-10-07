-- Yearly Goals are written by the stylist, not by the leader (Kate, 7 Oct 2026).
--   * The stylist fills the goals in on her own link. While she is writing it is a private draft: leaders
--     (Tara, Kate, Emma) read nothing of it, only that it is being written.
--   * When she submits (optional handwritten signature), the 13-week numbers freeze and the goals appear to
--     the leader keys. Coach Emma (the editor) can then sign off, which files the record, or reopen it, which
--     hands it back to the stylist as a draft. Leaders never edit her answers.
--   * 1-to-1s are unchanged: Coach Emma writes and signs, and the stylist sees one once it is signed.
-- New status 'submitted' and column submitted_at. perf_one2one_me, _get, _save, _sign and _reopen are
-- redefined (the others are as in perf_one2one_all.sql); two stylist-token functions are new.

alter table perf_one2one add column if not exists submitted_at timestamptz;
alter table perf_one2one drop constraint if exists perf_one2one_status_check;
alter table perf_one2one add constraint perf_one2one_status_check check (status in ('draft', 'submitted', 'signed', 'filed'));

-- The stylist's own page: goals come back in every state (her draft included); the others as before.
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
      case when o.kind = 'goals' then jsonb_build_object(
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
      where o.staff_id = s.id and (o.kind = 'goals' or o.status in ('signed', 'filed') or jsonb_array_length(o.history) > 0))
  );
end $function$;

-- The stylist writes her own goals: only the answers and the milestones, only while the record is her draft.
CREATE OR REPLACE FUNCTION public.perf_one2one_me_save(p_token uuid, p_period date, p_content jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s perf_staff; per date; cur text; mine jsonb;
begin
  select * into s from perf_staff where token = p_token and active and one2one_on;
  if s.id is null or p_content is null or jsonb_typeof(p_content) <> 'object' or length(p_content::text) > 60000 then return 'denied'; end if;
  per := perf_o2o_period('goals', p_period);
  select status into cur from perf_one2one where staff_id = s.id and kind = 'goals' and period = per;
  if cur is not null and cur <> 'draft' then return 'locked'; end if;
  mine := jsonb_build_object('goals', coalesce(p_content->'goals', '{}'::jsonb), 'mile', coalesce(p_content->'mile', '{}'::jsonb));
  insert into perf_one2one (staff_id, kind, period, content, updated_by)
  values (s.id, 'goals', per, mine, s.display_name)
  on conflict (staff_id, kind, period) do update
    set content = coalesce(perf_one2one.content, '{}'::jsonb) || mine, updated_by = s.display_name, updated_at = now();
  return 'ok';
end $function$;

-- She submits: the numbers freeze, her signature (optional) is kept, and the leaders can read it.
CREATE OR REPLACE FUNCTION public.perf_one2one_me_submit(p_token uuid, p_period date, p_sig text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s perf_staff; per date;
begin
  select * into s from perf_staff where token = p_token and active and one2one_on;
  if s.id is null then return 'denied'; end if;
  if p_sig is not null and (length(p_sig) > 400000 or p_sig !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then return 'bad signature'; end if;
  per := perf_o2o_period('goals', p_period);
  update perf_one2one set status = 'submitted', submitted_at = now(), confirmed_at = now(), staff_sig = p_sig, staff_comment = null,
         snapshot = perf_o2o_numbers(s), updated_by = s.display_name, updated_at = now()
   where staff_id = s.id and kind = 'goals' and period = per and status = 'draft' and jsonb_typeof(content->'goals') = 'object';
  return case when found then 'ok' else 'nothing to submit' end;
end $function$;

-- The leader's read: a goals draft shows as "being written", with none of her words.
CREATE OR REPLACE FUNCTION public.perf_one2one_get(p_admin uuid, p_token uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  who text; s perf_staff;
  m1 date := date_trunc('month', coalesce(p_month, current_date))::date;
  y1 date := date_trunc('year', coalesce(p_month, current_date))::date;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  if who is null then return null; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null or not s.one2one_on then return null; end if;
  return jsonb_build_object(
    'enabled', true, 'who', who, 'month', m1, 'year', y1,
    'can_edit', perf_o2o_editor(p_admin) is not null,
    'editor', (select name from perf_admins where one2one_editor and role = 'leader' limit 1),
    'staff', jsonb_build_object('name', s.display_name, 'role', coalesce(s.level, s.dept || ' team'), 'branch', s.branch),
    'numbers', perf_o2o_numbers(s),
    'monthly', (select to_jsonb(o) - 'staff_id' - 'history' from perf_one2one o where o.staff_id = s.id and o.kind = 'monthly' and o.period = m1),
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
               from perf_one2one o where o.staff_id = s.id)
  );
end $function$;

-- Goals are the stylist's to write: the editor saves 1-to-1s and 13-week checks only.
CREATE OR REPLACE FUNCTION public.perf_one2one_save(p_admin uuid, p_token uuid, p_kind text, p_period date, p_content jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text; sid uuid; per date; cur text;
begin
  who := perf_o2o_editor(p_admin);
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null or p_kind not in ('monthly', 'check') or p_content is null then return 'denied'; end if;
  per := perf_o2o_period(p_kind, p_period);
  select status into cur from perf_one2one where staff_id = sid and kind = p_kind and period = per;
  if cur is not null and cur <> 'draft' then return 'locked'; end if;
  insert into perf_one2one (staff_id, kind, period, content, updated_by)
  values (sid, p_kind, per, p_content, who)
  on conflict (staff_id, kind, period) do update
    set content = excluded.content, updated_by = who, updated_at = now();
  return 'ok';
end $function$;

-- Goals: the editor signs off a submitted record, which files it (the stylist's signature and the frozen
-- numbers from submission are kept). 1-to-1s and checks: draft to signed, as before.
CREATE OR REPLACE FUNCTION public.perf_one2one_sign(p_admin uuid, p_token uuid, p_kind text, p_period date, p_sig text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text; s perf_staff; per date;
begin
  who := perf_o2o_editor(p_admin);
  select * into s from perf_staff where token = p_token and active and one2one_on;
  if who is null or s.id is null or p_kind not in ('monthly', 'goals', 'check') then return 'denied'; end if;
  if p_sig is not null and (length(p_sig) > 400000 or p_sig !~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$') then return 'bad signature'; end if;
  per := perf_o2o_period(p_kind, p_period);
  update perf_one2one set
         status = case when p_kind = 'goals' then 'filed' else 'signed' end,
         signed_by = who, signed_at = now(), manager_sig = p_sig,
         confirmed_at = case when p_kind = 'goals' then confirmed_at else null end,
         staff_sig = case when p_kind = 'goals' then staff_sig else null end,
         staff_comment = case when p_kind = 'goals' then staff_comment else null end,
         snapshot = case when p_kind = 'goals' then snapshot else perf_o2o_numbers(s) end,
         updated_by = who, updated_at = now()
   where staff_id = s.id and kind = p_kind and period = per
     and status = case when p_kind = 'goals' then 'submitted' else 'draft' end;
  return case when found then 'ok' else 'nothing to sign' end;
end $function$;

-- Reopen: a goals record goes back to the stylist as her draft (the version before is kept in history).
CREATE OR REPLACE FUNCTION public.perf_one2one_reopen(p_admin uuid, p_token uuid, p_kind text, p_period date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text; sid uuid; per date;
begin
  who := perf_o2o_editor(p_admin);
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null or p_kind not in ('monthly', 'goals', 'check') then return 'denied'; end if;
  per := perf_o2o_period(p_kind, p_period);
  update perf_one2one set
         history = history || jsonb_build_object('status', status, 'signed_by', signed_by, 'signed_at', signed_at,
                                                 'confirmed_at', confirmed_at, 'content', content, 'snapshot', snapshot,
                                                 'manager_sig', manager_sig, 'staff_sig', staff_sig, 'staff_comment', staff_comment,
                                                 'submitted_at', submitted_at),
         status = 'draft', signed_by = null, signed_at = null, confirmed_at = null, snapshot = null, submitted_at = null,
         manager_sig = null, staff_sig = null, staff_comment = null, updated_by = who, updated_at = now()
   where staff_id = sid and kind = p_kind and period = per and status in ('submitted', 'signed', 'filed');
  return case when found then 'ok' else 'not signed' end;
end $function$;

grant execute on function perf_one2one_me(uuid)                       to anon, authenticated;
grant execute on function perf_one2one_me_save(uuid, date, jsonb)     to anon, authenticated;
grant execute on function perf_one2one_me_submit(uuid, date, text)    to anon, authenticated;
grant execute on function perf_one2one_get(uuid, uuid, date)          to anon, authenticated;
grant execute on function perf_one2one_save(uuid, uuid, text, date, jsonb)   to anon, authenticated;
grant execute on function perf_one2one_sign(uuid, uuid, text, date, text)    to anon, authenticated;
grant execute on function perf_one2one_reopen(uuid, uuid, text, date)        to anon, authenticated;
