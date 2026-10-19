-- Lost Client Blasts: Finish campaign also ends the wave that is still open (Kate, 19 Oct 2026).
-- After the last message went out the Wave 4 card still said Sending: a wave only closes when someone ends it or opens the next one, and Wave 4 has no next
-- wave. lost_campaign_finish(true) now closes every wave still open (closed_by "<name> (campaign finished)"); lost_campaign_finish(false) gives back only
-- the waves that finishing closed, never one ended by hand. Replaces the function from lost_campaign_finish.sql, everything else in it is unchanged.
create or replace function public.lost_campaign_finish(p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from public.dashboard_me() m limit 1;
  update public.lost_lists_config set finished_at = case when p_on then now() end, finished_by = case when p_on then who end where id = 1;
  update public.lost_sheet_config set add_new = not p_on, changed_by = who, changed_at = now() where id = 1;
  if p_on then
    update public.lost_waves set closed_at = now(), closed_by = coalesce(who, 'unknown') || ' (campaign finished)' where opened_at is not null and closed_at is null;
  else
    update public.lost_waves set closed_at = null, closed_by = null where closed_by like '% (campaign finished)';
  end if;
  return (select jsonb_build_object('finished', c.finished_at is not null, 'by', c.finished_by, 'at', c.finished_at) from public.lost_lists_config c where c.id = 1);
end $$;
revoke all on function public.lost_campaign_finish(boolean) from public, anon;
grant execute on function public.lost_campaign_finish(boolean) to authenticated;
