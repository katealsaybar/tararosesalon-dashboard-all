-- Audit P7-01, P3-06. The My Numbers and payslip sign-in lock, built behind a switch that is OFF.
-- NOT RUN. Shown to Kate first (18 Oct 2026). Kate's rulings: staff links stay the same; staff sign in once with their own email (Google or an email link);
-- the lock is switched ON before the 4 Nov payslip send. While the switch is OFF nothing below changes what anybody sees.
--
-- What the lock does when it is ON: a staff member's token or name link (performance/?t=, /me/<slug>) still opens her page, but the database only answers
-- for a signed-in person whose email is her perf_staff email, or a dashboard login at Level 3 and above with no branch scope (leaders and the owner, who open
-- people's pages from Staff Benchmarks). A forwarded link no longer opens anything. The payslip mailer and the coach run as the service role and are let
-- through here; the payslips and perf-coach edge functions check the signed-in email themselves (supabase/functions/*/index.ts in the repo).
--
-- Today: 48 active staff, 0 have ever signed in, 36 Gmail and 12 not. Do not switch ON until the status list (perf_lock_status) is nearly all signed in.

-- 1. THE SWITCH, OFF.
insert into public.kb_settings (key, on_off, note, changed_at)
values ('my_numbers_lock', false, 'My Numbers and payslip sign-in lock. OFF until the 4 Nov 2026 payslip send; Kate switches it on from Staff Roster and Access.', now())
on conflict (key) do nothing;

-- 2. WHO MAY OPEN THIS TOKEN'S PAGE.
create or replace function public.perf_lock_ok(p_token uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when not coalesce((select s.on_off from public.kb_settings s where s.key = 'my_numbers_lock'), false) then true
    when coalesce(auth.role(), '') = 'service_role' then true
    else exists (
      select 1 from public.perf_staff p
      where p.token = p_token and p.active and public.kb_me_email() is not null
        and (lower(p.email) = public.kb_me_email()
             or exists (select 1 from public.dashboard_users d
                        where d.email = public.kb_me_email() and d.level >= 3 and d.scope is null)))
  end
$$;
revoke all on function public.perf_lock_ok(uuid) from public, anon, authenticated;

-- 3. THE GUARD in the nine functions a staff token reaches. Eight are plpgsql: the first line of the body becomes
--      if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
--    perf_tip is plain SQL: its WHERE gets  and public.perf_lock_ok(p_token)  (it answers nothing, as it does for a bad token).
do $$
declare f text; def text; newdef text;
begin
  foreach f in array array['perf_dashboard','perf_year_weeks_me','perf_one2one_me','perf_one2one_me_save','perf_one2one_me_submit',
                           'perf_one2one_confirm','perf_one2one_prep_save','perf_one2one_prep_submit']
  loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f
      and pg_get_function_identity_arguments(p.oid) like 'p_token uuid%';
    if def is null then raise exception 'function % not found', f; end if;
    if def like '%perf_lock_ok%' then continue; end if;
    newdef := regexp_replace(def, E'(\\n[ \\t]*begin[ \\t]*\\n)',
      E'\\1  if not public.perf_lock_ok(p_token) then raise exception ''sign_in_required''; end if;\n', 'i');
    if newdef = def then raise exception 'no BEGIN in %', f; end if;
    execute newdef;
  end loop;
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'perf_tip'
    and pg_get_function_identity_arguments(p.oid) like 'p_token uuid%';
  if def not like '%perf_lock_ok%' then
    newdef := replace(def, 's.token = p_token and s.active', 's.token = p_token and s.active and public.perf_lock_ok(p_token)');
    if newdef = def then raise exception 'perf_tip: where clause not found'; end if;
    execute newdef;
  end if;
end $$;

-- 4. THE STATUS LIST (Level 3 and above) and THE SWITCH (Level 5 only), for Staff Roster and Access.
create or replace function public.perf_lock_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when coalesce(public.kb_level(), 0) >= 3 then jsonb_build_object(
    'on', coalesce((select s.on_off from public.kb_settings s where s.key = 'my_numbers_lock'), false),
    'total', (select count(*) from public.perf_staff where active),
    'signed_in', (select count(*) from public.perf_staff p where p.active and exists
                    (select 1 from auth.users u where lower(u.email) = lower(p.email) and u.last_sign_in_at is not null)),
    'never', (select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'email', lower(p.email), 'branch', p.branch,
                    'gmail', lower(p.email) like '%@gmail.com') order by p.display_name), '[]'::jsonb)
              from public.perf_staff p where p.active and not exists
                    (select 1 from auth.users u where lower(u.email) = lower(p.email) and u.last_sign_in_at is not null)))
  end
$$;
revoke all on function public.perf_lock_status() from public, anon;
grant execute on function public.perf_lock_status() to authenticated;

create or replace function public.perf_lock_set(p_on boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(public.kb_level(), 0) < 5 then raise exception 'Level 5 only'; end if;
  update public.kb_settings set on_off = p_on, changed_at = now() where key = 'my_numbers_lock';
  return p_on;
end $$;
revoke all on function public.perf_lock_set(boolean) from public, anon;
grant execute on function public.perf_lock_set(boolean) to authenticated;

-- 5. CHECKS, write nothing. Expect: switch false; 9 functions mention perf_lock_ok; status answers (as Level 3 and above) with 48 staff.
-- select on_off from public.kb_settings where key = 'my_numbers_lock';
-- select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%perf_lock_ok%' order by 1;

-- 6. TESTS, rolled back (nothing kept), run AFTER the switch is flipped inside the same transaction:
--   begin;
--     update public.kb_settings set on_off = true where key = 'my_numbers_lock';
--     -- no sign-in (anon): expect 'sign_in_required'
--     set local role anon; select public.perf_dashboard('<a staff token>'::uuid, null);
--   rollback;
--   (and as that staff member's auth id: expect her page; as another staff member: expect 'sign_in_required'; as a Level 3 login: expect the page.)
-- With the switch OFF everything answers exactly as today.

-- TO SWITCH ON (Kate, from Staff Roster and Access, or here):   update public.kb_settings set on_off = true  where key = 'my_numbers_lock';
-- TO SWITCH OFF:                                                update public.kb_settings set on_off = false where key = 'my_numbers_lock';
-- TO REMOVE THE GUARDS: each function's first body line (the perf_lock_ok line); perf_tip's extra WHERE term.
