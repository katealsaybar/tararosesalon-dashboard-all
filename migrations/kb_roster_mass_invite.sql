-- Staff Roster & Access, mass site invite (Kate, 4 Nov 2026: "bigyan mo nga ko button to mass send site invites").
-- Until now Send invite only worked one row at a time and only for the dashboard list (Management & Office). Now Level 5 can invite everyone on the
-- roster who has never signed in (stylists, beauticians, reception, assistants, call centre as well) with one button, and each row gets its own Send invite.
--
-- kb_send_invite_bulk(emails): Level 5 only (kb_level(), the real account). Keeps only people who are on the roster, have never signed in, and were not
--   invited in the last 3 days, at most 80 a press. Writes one 'queued' row per person to kb_invite_log and makes ONE call to the invite-user edge
--   function, which answers at once and then sends the emails one by one, a second apart (so Supabase's email limit is not hit all at once), writing each
--   result back to kb_invite_log. The page polls kb_invite_status(batch) to show "sent 12 of 41".
-- kb_send_invite(email): the single-row button, now for anyone on the roster (it was dashboard_users only).
-- kb_roster(): 'invited' (when the last invite went out) is now returned for every kind of person, to Level 5 only, so a stylist's row shows it too.
-- The invite is the same no-expiry "Open Team Home" email as before (Supabase invite template), so nothing in it needs a link that times out.

create table if not exists public.kb_invite_log (
  id         bigserial primary key,
  batch      uuid not null,
  email      text not null,
  status     text not null default 'queued' check (status in ('queued', 'invited', 'skipped', 'failed')),
  error      text,
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  created_by text
);
create index if not exists kb_invite_log_batch on public.kb_invite_log (batch);
alter table public.kb_invite_log enable row level security;   -- no policies: only the functions below and the edge function (service role) touch it

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
    select distinct on (lower(trim(p.email)))
           lower(trim(p.email)) email, coalesce(p.phorest_name, p.display_name) name, 1 level, null::text scope,
           p.dept, p.branch, 'staff' kind, p.level pos
    from public.perf_staff p
    where p.active and p.email is not null and p.dept in ('Hair', 'Beauty')
    order by lower(trim(p.email)), p.created_at desc
  ),
  kbs as (
    select k.email, k.name, 1 level, case when k.note ilike '%bahrain%' then 'BAH' end scope,
           case k.category when 'Receptionist' then 'Front Desk' when 'Assistant' then 'Hair'
                           when 'Call Centre' then 'Call Centre' end dept,
           null::text branch, 'staff' kind, k.category pos
    from public.kb_staff k
    where k.active and k.category in ('Receptionist', 'Assistant', 'Call Centre')
  ),
  everyone as (
    select * from dash
    union all select * from perf where email not in (select email from dash)
    union all select * from kbs where email not in (select email from dash) and email not in (select email from perf)
  )
  select case when (select lv from me) is null or (select lv from me) < 3 then null else
    jsonb_build_object(
      'staff_open', coalesce((select s.on_off from public.kb_settings s where s.key = 'staff_open'), false),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', coalesce(kp.full_name, e.name), 'email', e.email,
          'level', case when (select lv from me) = 5 then e.level end,
          'team', case when e.kind = 'dashboard' then 'Management & Office' else e.dept end,
          'position', coalesce(kp.position, e.pos), 'photo', kp.photo, 'scope', e.scope, 'dept', e.dept, 'branch', e.branch,
          'last_sign_in', u.last_sign_in_at,
          'invited', case when (select lv from me) = 5 then iu.invited_at end)
          order by case when (select lv from me) = 5 then e.level end desc nulls last, coalesce(kp.full_name, e.name))
        from everyone e
        left join public.kb_positions kp on kp.email = e.email
        left join auth.users u on lower(u.email) = e.email and u.email_confirmed_at is not null
        left join auth.users iu on lower(iu.email) = lower(e.email)
        where ((select sc from me) is distinct from 'BAH' or e.scope = 'BAH')
          and not public.kb_is_blocked(e.email)
      ), '[]'::jsonb),
      'revoked', case when (select lv from me) = 5 then coalesce((
        select jsonb_agg(jsonb_build_object('email', b.email, 'name', coalesce(b.name, b.email),
                 'note', b.note, 'blocked_at', b.blocked_at) order by b.blocked_at desc)
        from public.kb_access_blocked b), '[]'::jsonb) end
    ) end
$function$;

create or replace function public.kb_send_invite(p_email text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_id bigint;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  if not exists (select 1 from jsonb_array_elements(public.kb_roster() -> 'people') p where p ->> 'email' = v_email) then
    raise exception 'not on the roster';
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

create or replace function public.kb_send_invite_bulk(p_emails text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid := gen_random_uuid();
  v_want text[]; v_ok text[]; v_cap int := 80;
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  select array_agg(distinct lower(trim(x))) into v_want from unnest(coalesce(p_emails, '{}')) x where trim(x) <> '';
  if coalesce(array_length(v_want, 1), 0) = 0 then raise exception 'nobody to invite'; end if;
  -- on the roster, never signed in, not invited in the last 3 days
  select array_agg(e order by e) into v_ok from (
    select p ->> 'email' e
      from jsonb_array_elements(public.kb_roster() -> 'people') p
     where p ->> 'email' = any (v_want)
       and (p ->> 'last_sign_in') is null
       and ((p ->> 'invited') is null or (p ->> 'invited')::timestamptz < now() - interval '3 days')
     limit v_cap
  ) s;
  if coalesce(array_length(v_ok, 1), 0) = 0 then raise exception 'nobody on that list needs an invite'; end if;
  insert into public.kb_invite_log (batch, email, created_by) select v_batch, e, public.kb_me_email() from unnest(v_ok) e;
  perform net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/invite-user',
    body := jsonb_build_object('emails', to_jsonb(v_ok), 'batch', v_batch,
              'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'invite_hook_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 20000
  );
  return jsonb_build_object('batch', v_batch, 'queued', array_length(v_ok, 1), 'asked', array_length(v_want, 1), 'cap', v_cap);
end $$;
revoke all on function public.kb_send_invite_bulk(text[]) from public, anon;
grant execute on function public.kb_send_invite_bulk(text[]) to authenticated;

create or replace function public.kb_invite_status(p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'not allowed'; end if;
  return (select jsonb_build_object(
    'total',   count(*),
    'queued',  count(*) filter (where status = 'queued'),
    'invited', count(*) filter (where status = 'invited'),
    'skipped', count(*) filter (where status = 'skipped'),
    'failed',  count(*) filter (where status = 'failed'),
    'errors',  coalesce((select jsonb_agg(jsonb_build_object('email', f.email, 'error', f.error) order by f.id)
                         from (select * from public.kb_invite_log l2 where l2.batch = p_batch and l2.status = 'failed' order by l2.id limit 8) f), '[]'::jsonb))
    from public.kb_invite_log where batch = p_batch);
end $$;
revoke all on function public.kb_invite_status(uuid) from public, anon;
grant execute on function public.kb_invite_status(uuid) to authenticated;
