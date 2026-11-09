-- nov_send_lock.sql (9 Nov 2026, Kate: "pag natapos na yung blasts dapat na-lock sya, para ndi na makapag send", rule: "kusa pag tapos na").
-- Once every November blast has gone out, sending LOCKS BY ITSELF. Locked means nobody can queue a message (send, resend, test, dry run) and nobody can change the
-- sending switches or the pace. Only Level 5 can unlock it, by typing UNLOCK; the next message queued after an unlock puts the lock back on, so it can never stay open by accident.
--
-- "Finished" (nov_send_finished): at least one real (live, not test) message was sent, nothing is queued or sending, and no failed message is left to resend (no failed message
-- the resend pool says is ready now or still waiting out its 24 hours). Failed messages the pool leaves out for good (another reason, STOP, opted out, booked, wrote back)
-- do not hold the lock open.
--
-- ADDITIVE. One new column on nov_send_config, five new functions, two triggers. Nothing existing is rewritten, so the live sender functions are untouched: the lock is
-- enforced where the rows are written (a trigger on nov_send_jobs for new messages, a trigger on nov_send_config for the switches and the pace).
-- Every UPDATE has a WHERE (the API role loads safeupdate).
--
-- ROLLBACK:
--   drop trigger if exists nov_send_lock_jobs on public.nov_send_jobs;  drop trigger if exists nov_send_lock_config on public.nov_send_config;
--   drop function if exists public.nov_send_lock_jobs_tg(), public.nov_send_lock_config_tg(), public.nov_send_lock_info(), public.nov_send_unlock(text),
--                           public.nov_send_is_locked(), public.nov_send_finished();
--   alter table public.nov_send_config drop column if exists unlocked;

alter table public.nov_send_config add column if not exists unlocked boolean not null default false;

create or replace function public.nov_send_finished() returns boolean
language plpgsql stable security definer set search_path = public set statement_timeout = '60s' as $$
declare b record;
begin
  if not exists (select 1 from nov_send_jobs where not dry and not is_test and status in ('sent', 'failed')) then return false; end if;        -- nothing real has gone yet
  if exists (select 1 from nov_send_jobs where not is_test and status in ('queued', 'sending')) then return false; end if;                   -- cheap check first
  for b in select blast_id from nov_send_blasts loop
    if exists (select 1 from nov_send_resend_pool(b.blast_id) p where p.reason is null or p.reason like 'Waiting%') then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.nov_send_is_locked() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select unlocked from nov_send_config where id = 1), false) then return false; end if;
  return nov_send_finished();
end $$;

-- New messages: refused while locked. After an unlock the first new message puts the lock back on (it will lock again as soon as that send has finished).
create or replace function public.nov_send_lock_jobs_tg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if nov_send_is_locked() then raise exception 'Sending is locked: every blast has finished. Level 5 can unlock it.'; end if;
  update nov_send_config set unlocked = false where id = 1 and unlocked;
  return new;
end $$;
drop trigger if exists nov_send_lock_jobs on public.nov_send_jobs;
create trigger nov_send_lock_jobs before insert on public.nov_send_jobs for each row execute function public.nov_send_lock_jobs_tg();

-- The switches and the pace: refused while locked. The pause fields, the gate and the unlocked flag itself are not covered.
create or replace function public.nov_send_lock_config_tg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.enabled is distinct from old.enabled or new.dry_run is distinct from old.dry_run or new.slot_cap is distinct from old.slot_cap
      or new.slot_minutes is distinct from old.slot_minutes or new.per_run is distinct from old.per_run or new.hour_from is distinct from old.hour_from
      or new.hour_to is distinct from old.hour_to) and nov_send_is_locked() then
    raise exception 'Sending is locked: every blast has finished. Level 5 can unlock it.';
  end if;
  return new;
end $$;
drop trigger if exists nov_send_lock_config on public.nov_send_config;
create trigger nov_send_lock_config before update on public.nov_send_config for each row execute function public.nov_send_lock_config_tg();

-- What the page reads (Level 5 only, like the rest of the sender).
create or replace function public.nov_send_lock_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean; un boolean;
begin
  perform nov_send_guard();
  fin := nov_send_finished();
  select unlocked into un from nov_send_config where id = 1;
  return jsonb_build_object('finished', fin, 'unlocked', coalesce(un, false), 'locked', fin and not coalesce(un, false));
end $$;

create or replace function public.nov_send_unlock(p_confirm text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := nov_send_guard();
begin
  if upper(btrim(coalesce(p_confirm, ''))) <> 'UNLOCK' then raise exception 'Type UNLOCK to confirm'; end if;
  update nov_send_config set unlocked = true, updated_at = now(), updated_by = who where id = 1;
  return nov_send_lock_info();
end $$;

revoke all on function public.nov_send_finished(), public.nov_send_is_locked(), public.nov_send_lock_jobs_tg(), public.nov_send_lock_config_tg(),
  public.nov_send_lock_info(), public.nov_send_unlock(text) from public, anon, authenticated;
grant execute on function public.nov_send_lock_info(), public.nov_send_unlock(text) to authenticated;
