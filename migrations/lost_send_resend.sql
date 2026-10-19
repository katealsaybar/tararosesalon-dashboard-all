-- Lost Client Blasts: resend the messages WhatsApp did not deliver (Kate, 19 Oct 2026).
--
-- Meta refused 1,058 of the first 5,225 messages ("not delivered to maintain healthy ecosystem engagement", nothing charged). The send job for those
-- reads "sent" (respond.io accepted it), so lost_send_enqueue refuses them as "already queued or sent". This adds a separate path that queues a
-- NEW job, same client, same template and wording, with a run time and a pace like every other send (send_slot_norm / send_slot_next), so the
-- worker, the claim, the daily cap and the send window all behave as before.
--
--   lost_resend_pool()   the jobs eligible for a resend (internal, not callable from the page)
--   lost_resend_info()   what the page shows: how many per branch, and how many resends are already queued or sent (Level 4 and up)
--   lost_send_resend()   queues them for one branch (or all), optionally at a time and in batches (Level 4 and up)
--
-- Eligible: the delivery report for that message says "failed" (lost_wa_status.out_msgs, read from respond.io each night), and the client has not
-- replied, written STOP, is blocked, has booked, is on lost_send_optout, or already has a later job queued or sent (so a resend can never double).

create or replace function public.lost_resend_pool()
returns table (job_id bigint, client_key text, dup_keys text[], phone text, branch text, channel_id bigint, qtype text, tkey text, params text[], body_text text, campaign text)
language sql stable security definer set search_path = public as $$
  select j.id, j.client_key, j.dup_keys, j.phone, j.branch, j.channel_id, j.qtype, j.tkey, j.params, j.body_text, j.campaign
  from lost_send_jobs j
  join lost_send_flags f on f.id = j.id
  left join lost_wa_status w on w.phone = j.phone
  where j.status = 'sent' and not j.is_test
    and (select m ->> 's' from jsonb_array_elements(coalesce(w.out_msgs, '[]'::jsonb)) m
          where abs((m ->> 't')::double precision - extract(epoch from j.sent_at)) < 900
          order by abs((m ->> 't')::double precision - extract(epoch from j.sent_at)) limit 1) = 'failed'
    and not coalesce(f.replied, false) and not coalesce(f.stop, false) and not coalesce(f.blocked, false) and not coalesce(f.booked, false)
    and not coalesce(w.opted_out, false) and not coalesce(w.is_blocked, false)
    and not exists (select 1 from lost_send_optout o where o.phone = j.phone)
    and not exists (select 1 from lost_send_jobs k where not k.is_test and k.id > j.id and k.status in ('queued', 'sending', 'sent')
                    and (k.phone = j.phone or k.client_key = j.client_key))
$$;
revoke all on function public.lost_resend_pool() from public, anon, authenticated;

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
    'resent_waiting', (select count(*) from lost_send_jobs j where not j.is_test and j.requested_by like '% (resend)' and j.status in ('queued', 'sending')))
  into out from p;
  return out;
end $$;

create or replace function public.lost_send_resend(p_branch text default null, p_limit integer default null, p_at timestamptz default null, p_batch integer default null, p_every integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg lost_send_config; who text; r record; n int := 0; slot timestamptz; first_at timestamptz; last_at timestamptz; skipped int := 0;
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 4 then raise exception 'Level 4 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  if not cfg.enabled then raise exception 'Sending from the site is switched off'; end if;
  if p_at is not null and (p_at < now() - interval '2 minutes' or p_at > now() + interval '60 days') then raise exception 'Pick a time from now to 60 days ahead'; end if;
  if not send_pace_ok(p_batch, p_every) then raise exception 'Pick a batch size (1 to 500) and an interval (1 to 720 minutes)'; end if;
  select m.name into who from dashboard_me() m limit 1;
  slot := case when p_every is null then coalesce(p_at, now()) else send_slot_norm(coalesce(p_at, now()), cfg.hour_from, cfg.hour_to) end;
  first_at := slot;
  for r in select * from lost_resend_pool() p where (p_branch is null or p.branch = p_branch) order by p.job_id limit coalesce(p_limit, 100000) loop
    if not exists (select 1 from lost_send_templates t where t.key = r.tkey and t.approved) then skipped := skipped + 1; continue; end if;
    if p_every is not null and n > 0 and n % p_batch = 0 then slot := send_slot_next(slot, p_every, cfg.hour_from, cfg.hour_to); end if;
    -- The campaign gets "-resend" on the end: one live job per client per campaign (lost_send_jobs_one_per_client) would refuse a second job under the
    -- same name, and the worker puts this name on the contact as a tag, so these show up as their own group in respond.io.
    insert into lost_send_jobs (client_key, dup_keys, phone, branch, channel_id, qtype, tkey, params, body_text, campaign, requested_by, next_try_at, scheduled_for)
    values (r.client_key, r.dup_keys, r.phone, r.branch, r.channel_id, r.qtype, r.tkey, r.params, r.body_text, cfg.campaign_tag || '-resend',
            coalesce(who, 'unknown') || ' (resend)', slot, case when p_at is not null or p_every is not null then slot end);
    n := n + 1; last_at := slot;
  end loop;
  return jsonb_build_object('queued', n, 'skipped', skipped, 'first_at', first_at, 'last_at', last_at);
end $$;

revoke all on function public.lost_resend_info() from public, anon;
revoke all on function public.lost_send_resend(text, integer, timestamptz, integer, integer) from public, anon;
grant execute on function public.lost_resend_info() to authenticated;
grant execute on function public.lost_send_resend(text, integer, timestamptz, integer, integer) to authenticated;
