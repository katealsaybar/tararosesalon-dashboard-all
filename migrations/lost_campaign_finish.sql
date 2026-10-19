-- Lost Client Blasts: Finish campaign, and the Resend row (Kate, 19 Oct 2026).
--
-- 1. Finish campaign. Once every message of the October 2026 blast has gone out, Level 5 can finish it: no new client is added to the four Google
--    review sheets (the same switch as "Stop adding new clients", lost_sheet_config.add_new) and none to the client lists behind To message, because
--    every list (lost_lists_core_x) is built from lost_lists_base and the nightly lost_lists_refresh() is what rebuilds it. A finished campaign makes
--    the refresh do nothing, so the lists are frozen as they were at the end; clients already on them still update (booked, STOP, replied). Messages
--    already queued keep going: finishing does not touch sending (that is the switch on the send panel). Reopen undoes it.
--      lost_lists_config.finished_at / finished_by    the state
--      lost_campaign_get()                            Level 3 and up: {finished, by, at}
--      lost_campaign_finish(on)                       Level 5: finish (true) or reopen (false); also sets lost_sheet_config.add_new
--      lost_lists_refresh()                           returns 0 and changes nothing while finished
-- 2. The Resend row. lost_resend_info() also says how many resends have gone, how many wait, when the first and last is due and who queued them;
--    lost_resend_cancel() stops the ones that have not gone yet (Level 4 and up), which also puts those clients back in the pool.

alter table public.lost_lists_config add column if not exists finished_at timestamptz, add column if not exists finished_by text;

create or replace function public.lost_campaign_get()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  return (select jsonb_build_object('finished', c.finished_at is not null, 'by', c.finished_by, 'at', c.finished_at) from public.lost_lists_config c where c.id = 1);
end $$;

create or replace function public.lost_campaign_finish(p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from public.dashboard_me() m limit 1;
  update public.lost_lists_config set finished_at = case when p_on then now() end, finished_by = case when p_on then who end where id = 1;
  update public.lost_sheet_config set add_new = not p_on, changed_by = who, changed_at = now() where id = 1;
  return (select jsonb_build_object('finished', c.finished_at is not null, 'by', c.finished_by, 'at', c.finished_at) from public.lost_lists_config c where c.id = 1);
end $$;

revoke all on function public.lost_campaign_get(), public.lost_campaign_finish(boolean) from public, anon;
grant execute on function public.lost_campaign_get(), public.lost_campaign_finish(boolean) to authenticated;

-- The refresh is long, so it is patched in place: right after it reads the config it stops if the campaign is finished.
do $patch$
declare d text;
begin
  select pg_get_functiondef('public.lost_lists_refresh'::regproc) into d;
  if position('finished_at' in d) = 0 then
    d := replace(d, E'select * into cfg from lost_lists_config where id = 1;', E'select * into cfg from lost_lists_config where id = 1;\n  if cfg.finished_at is not null then return 0; end if;   -- campaign finished (lost_campaign_finish): the lists stay as they are');
    execute d;
  end if;
end $patch$;

create or replace function public.lost_resend_info()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 4 then raise exception 'Level 4 and above'; end if;
  with p as (select branch, count(*) n from lost_resend_pool() group by branch)
  select jsonb_build_object(
    'total', coalesce(sum(n), 0),
    'by_branch', coalesce(jsonb_object_agg(branch, n), '{}'::jsonb),
    'resent', (select count(*) from lost_send_jobs j where not j.is_test and j.requested_by like '% (resend)' and j.status in ('queued', 'sending', 'sent')),
    'resent_sent', (select count(*) from lost_send_jobs j where not j.is_test and j.requested_by like '% (resend)' and j.status = 'sent'),
    'resent_waiting', (select count(*) from lost_send_jobs j where not j.is_test and j.requested_by like '% (resend)' and j.status in ('queued', 'sending')),
    'resent_failed', (select count(*) from lost_send_jobs j where not j.is_test and j.requested_by like '% (resend)' and j.status = 'failed'),
    'resent_first', (select min(j.next_try_at) from lost_send_jobs j where not j.is_test and j.requested_by like '% (resend)' and j.status = 'queued'),
    'resent_last', (select max(j.next_try_at) from lost_send_jobs j where not j.is_test and j.requested_by like '% (resend)' and j.status = 'queued'),
    'resent_by', (select j.requested_by from lost_send_jobs j where not j.is_test and j.requested_by like '% (resend)' order by j.id desc limit 1))
  into out from p;
  return out;
end $$;

create or replace function public.lost_resend_cancel()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 4 then raise exception 'Level 4 and above'; end if;
  update lost_send_jobs set status = 'cancelled', error = null where status = 'queued' and not is_test and requested_by like '% (resend)';
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.lost_resend_cancel() from public, anon;
grant execute on function public.lost_resend_cancel() to authenticated;
