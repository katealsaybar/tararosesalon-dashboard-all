-- lost_send_lock.sql (9 Nov 2026, Kate: "pag natapos na yung blasts dapat na-lock sya, para ndi na makapag send", rule: "kusa pag tapos na"). The twin of migrations/nov_send_lock.sql for the
-- Lost Clients October sender (lost_send_*). Once the campaign has finished, sending LOCKS BY ITSELF: nobody can queue a message (send, test, retry) and nobody can change the
-- sending switch or the pace. Only Level 5 can unlock it, by typing UNLOCK; the next message queued or retried puts the lock back on.
--
-- "Finished" (lost_send_finished): at least one real (not test) message was sent, nothing is queued or sending, and no failed message is left to retry (a failed message that
-- lost_send_retry would take: no other message for the same client or number is queued, sending or sent in the campaign).
--
-- ADDITIVE. One new column on lost_send_config, new functions and three triggers. No existing sender function is rewritten: the lock is enforced where the rows are written.
-- Every UPDATE has a WHERE (the API role loads safeupdate).
--
-- ROLLBACK:
--   drop trigger if exists lost_send_lock_jobs_ins on public.lost_send_jobs;  drop trigger if exists lost_send_lock_jobs_upd on public.lost_send_jobs;  drop trigger if exists lost_send_lock_config on public.lost_send_config;
--   drop function if exists public.lost_send_lock_jobs_tg(), public.lost_send_lock_jobs_upd_tg(), public.lost_send_lock_config_tg(), public.lost_send_lock_info(), public.lost_send_unlock(text),
--                           public.lost_send_is_locked(), public.lost_send_finished();
--   alter table public.lost_send_config drop column if exists unlocked;

alter table public.lost_send_config add column if not exists unlocked boolean not null default false;

create or replace function public.lost_send_finished() returns boolean
language plpgsql stable security definer set search_path = public set statement_timeout = '60s' as $$
begin
  if not exists (select 1 from lost_send_jobs where not is_test and status = 'sent') then return false; end if;                    -- nothing real has gone yet
  if exists (select 1 from lost_send_jobs where not is_test and status in ('queued', 'sending')) then return false; end if;       -- cheap check first
  if exists (select 1 from lost_send_jobs j where not j.is_test and j.status = 'failed'
             and not exists (select 1 from lost_send_jobs k where k.id <> j.id and not k.is_test and k.campaign = j.campaign and k.status in ('queued', 'sending', 'sent')
                             and (k.client_key = j.client_key or k.phone = j.phone))) then return false; end if;                      -- a failed message is still left to retry
  return true;
end $$;

create or replace function public.lost_send_is_locked() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select unlocked from lost_send_config where id = 1), false) then return false; end if;
  return lost_send_finished();
end $$;

-- New messages (queue, test): refused while locked. After an unlock the first new message puts the lock back on.
create or replace function public.lost_send_lock_jobs_tg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lost_send_is_locked() then raise exception 'Sending is locked: the campaign has finished. Level 5 can unlock it.'; end if;
  update lost_send_config set unlocked = false where id = 1 and unlocked;
  return new;
end $$;
drop trigger if exists lost_send_lock_jobs_ins on public.lost_send_jobs;
create trigger lost_send_lock_jobs_ins before insert on public.lost_send_jobs for each row execute function public.lost_send_lock_jobs_tg();

-- A retry (a failed message put back in the queue) counts as a new message.
create or replace function public.lost_send_lock_jobs_upd_tg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'failed' and new.status = 'queued' then
    if lost_send_is_locked() then raise exception 'Sending is locked: the campaign has finished. Level 5 can unlock it.'; end if;
    update lost_send_config set unlocked = false where id = 1 and unlocked;
  end if;
  return new;
end $$;
drop trigger if exists lost_send_lock_jobs_upd on public.lost_send_jobs;
create trigger lost_send_lock_jobs_upd before update of status on public.lost_send_jobs for each row execute function public.lost_send_lock_jobs_upd_tg();

-- The switch and the pace: refused while locked. The unlocked flag itself is not covered.
create or replace function public.lost_send_lock_config_tg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.enabled is distinct from old.enabled or new.daily_cap is distinct from old.daily_cap or new.per_run is distinct from old.per_run
      or new.slot_cap is distinct from old.slot_cap or new.slot_minutes is distinct from old.slot_minutes
      or new.hour_from is distinct from old.hour_from or new.hour_to is distinct from old.hour_to) and lost_send_is_locked() then
    raise exception 'Sending is locked: the campaign has finished. Level 5 can unlock it.';
  end if;
  return new;
end $$;
drop trigger if exists lost_send_lock_config on public.lost_send_config;
create trigger lost_send_lock_config before update on public.lost_send_config for each row execute function public.lost_send_lock_config_tg();

create or replace function public.lost_send_lock_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean; un boolean;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  fin := lost_send_finished();
  select unlocked into un from lost_send_config where id = 1;
  return jsonb_build_object('finished', fin, 'unlocked', coalesce(un, false), 'locked', fin and not coalesce(un, false));
end $$;

create or replace function public.lost_send_unlock(p_confirm text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if lost_send_level() < 5 then raise exception 'Level 5 only'; end if;
  if upper(btrim(coalesce(p_confirm, ''))) <> 'UNLOCK' then raise exception 'Type UNLOCK to confirm'; end if;
  select m.name into who from dashboard_me() m limit 1;
  update lost_send_config set unlocked = true, updated_at = now(), updated_by = who where id = 1;
  return lost_send_lock_info();
end $$;

revoke all on function public.lost_send_finished(), public.lost_send_is_locked(), public.lost_send_lock_jobs_tg(), public.lost_send_lock_jobs_upd_tg(), public.lost_send_lock_config_tg(),
  public.lost_send_lock_info(), public.lost_send_unlock(text) from public, anon, authenticated;
grant execute on function public.lost_send_lock_info(), public.lost_send_unlock(text) to authenticated;
