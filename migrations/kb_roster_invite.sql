-- Staff Roster & Access, Send invite (Kate, 6 Oct 2026): Level 5 can send the
-- dashboard invite email from /hub/roster to anyone on dashboard_users who has never
-- signed in, instead of running select dashboard_invite(...) in the SQL editor.
--
-- kb_send_invite(email): Level 5 only (kb_level(), the real account, so "View as"
-- changes nothing); the email must be on dashboard_users and must not have a
-- confirmed account. Unlike dashboard_invite() it also resends to someone who was
-- invited but never accepted (an unconfirmed auth.users row); Supabase's invite
-- resends in that case and refuses only confirmed accounts. Posts to the same
-- invite-user edge function with the vault secret.
-- kb_roster() also returns 'invited' (auth.users.invited_at), to Level 5 only, so the
-- page can show when the last invite went out.

create or replace function public.kb_send_invite(p_email text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_id bigint;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.dashboard_users d where lower(d.email) = v_email) then
    raise exception 'not on the dashboard list';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email and u.email_confirmed_at is not null) then
    raise exception 'already signed in';
  end if;
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/invite-user',
    body := jsonb_build_object('email', v_email,
              'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'invite_hook_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 20000
  ) into v_id;
  return v_id;
end $$;
revoke all on function public.kb_send_invite(text) from public, anon;
grant execute on function public.kb_send_invite(text) to authenticated;

create or replace function public.kb_roster()
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  with me as (
    select public.kb_level() lv,
           (select d.scope from public.dashboard_users d where d.email = public.kb_me_email()) sc
  ),
  dash as (
    select d.email, d.name, d.level, d.scope, null::text dept, null::text branch, 'dashboard' kind, null::text pos
    from public.dashboard_users d
  ),
  perf as (
    -- Kate, 3 Oct 2026: full names, so Phorest's name rather than the short display name.
    select distinct on (lower(trim(p.email))) lower(trim(p.email)) email, coalesce(p.phorest_name, p.display_name) name, 1 level,
           null::text scope, p.dept, p.branch, 'staff' kind, p.level pos
    from public.perf_staff p
    where p.active and p.email is not null and p.dept in ('Hair', 'Beauty')
    order by lower(trim(p.email)), p.created_at desc
  ),
  kbs as (
    select k.email, k.name, 1 level,
           case when k.note ilike '%bahrain%' then 'BAH' end scope,
           case k.category when 'Receptionist' then 'Front Desk' when 'Assistant' then 'Hair' end dept,
           null::text branch, 'staff' kind, k.category pos
    from public.kb_staff k
    where k.active and k.category in ('Receptionist', 'Assistant')
  ),
  everyone as (
    select * from dash
    union all select * from perf where email not in (select email from dash)
    union all select * from kbs where email not in (select email from dash)
                                  and email not in (select email from perf)
  )
  select case when (select lv from me) is null or (select lv from me) < 3 then null else jsonb_build_object(
    'staff_open', coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(kp.full_name, e.name), 'email', e.email,
               -- Kate, 3 Oct 2026: levels are Level 5's alone; below that the list is by team.
               'level', case when (select lv from me) = 5 then e.level end,
               'team', case when e.kind = 'dashboard' then 'Management & Office' else e.dept end,
               'position', coalesce(kp.position, e.pos),
               'photo', kp.photo,
               'scope', e.scope, 'dept', e.dept, 'branch', e.branch,
               'last_sign_in', u.last_sign_in_at,
               -- Kate, 6 Oct 2026: when the last invite went out, Level 5 only.
               'invited', case when (select lv from me) = 5 and e.kind = 'dashboard' then iu.invited_at end)
             order by case when (select lv from me) = 5 then e.level end desc nulls last, coalesce(kp.full_name, e.name))
      from everyone e
      left join public.kb_positions kp on kp.email = e.email
      left join auth.users u on lower(u.email) = e.email and u.email_confirmed_at is not null
      left join auth.users iu on lower(iu.email) = lower(e.email)
      where (select sc from me) is distinct from 'BAH' or e.scope = 'BAH'
    ), '[]'::jsonb)
  ) end
$function$;
