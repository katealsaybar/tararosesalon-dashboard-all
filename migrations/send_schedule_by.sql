-- Kate, 16 Oct 2026: who set the schedule. requested_by is who queued a message; scheduled_by is who last set its time (queue, Change time, retry).
-- The worker runs as the service role (no signed-in person), so its own retries leave scheduled_by alone.
alter table public.lost_send_jobs add column if not exists scheduled_by text;

create or replace function public.lost_send_set_by() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'INSERT' then
    new.scheduled_by := coalesce(new.scheduled_by, new.requested_by);
  elsif new.next_try_at is distinct from old.next_try_at then
    select m.name into who from public.dashboard_me() m limit 1;
    if who is not null then new.scheduled_by := who; end if;
  end if;
  return new;
end $$;

drop trigger if exists lost_send_set_by on public.lost_send_jobs;
create trigger lost_send_set_by before insert or update of next_try_at on public.lost_send_jobs
  for each row execute function public.lost_send_set_by();

update public.lost_send_jobs set scheduled_by = requested_by where scheduled_by is null;

-- lost_send_jobs_get also returns 'scheduled_by' (added after 'requested_by'; the rest of the body is unchanged, see send_schedule_pace_triage.sql).
