-- Kate, 3 Oct 2026: adding someone to dashboard_users emails them an invite.
-- The trigger calls dashboard_invite(), which posts to the invite-user edge function
-- with a vault secret; the function checks it with invite_hook_ok() (service role only).
-- Send one again by hand, in the SQL editor:  select dashboard_invite('name@example.com');
-- Replies land in net._http_response (newest id last).

-- once: the shared secret, random, never written anywhere else
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'invite_hook_secret', 'invite-user edge function')
where not exists (select 1 from vault.secrets where name = 'invite_hook_secret');

create or replace function public.invite_hook_ok(p_secret text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'invite_hook_secret' and decrypted_secret = p_secret)
$$;
revoke all on function public.invite_hook_ok(text) from public, anon, authenticated;
grant execute on function public.invite_hook_ok(text) to service_role;

create or replace function public.dashboard_invite(p_email text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if exists (select 1 from auth.users where lower(email) = lower(trim(p_email))) then
    return null;   -- already has an account
  end if;
  select net.http_post(
    url := 'https://gvijxenafoowajqktqvd.supabase.co/functions/v1/invite-user',
    body := jsonb_build_object('email', lower(trim(p_email)),
              'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'invite_hook_secret')),
    headers := '{"Content-Type":"application/json"}'::jsonb
  ) into v_id;
  return v_id;
end $$;
revoke all on function public.dashboard_invite(text) from public, anon, authenticated;

create or replace function public.dashboard_users_invite_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.dashboard_invite(new.email);
  exception when others then
    raise warning 'dashboard invite for % failed: %', new.email, sqlerrm;   -- never block the insert
  end;
  return new;
end $$;
revoke all on function public.dashboard_users_invite_trg() from public, anon, authenticated;

drop trigger if exists dashboard_users_invite on public.dashboard_users;
create trigger dashboard_users_invite after insert on public.dashboard_users
  for each row execute function public.dashboard_users_invite_trg();
