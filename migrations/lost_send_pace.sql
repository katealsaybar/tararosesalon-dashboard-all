-- Lost Clients sending pace (Kate, 16 Oct 2026). Applied live on 16 Oct 2026 (record only).
--
-- Wave 2 had to go out in one day, so the worker got a second brake besides the daily cap: lost_send_config.slot_cap messages in each slot_minutes
-- slot (100 every 30 minutes). lost_send_claim() applies it (10:00 to 19:00 Dubai = 18 slots = 1,800). slot_cap = 0 turns it off.
--   alter table lost_send_config add column slot_cap int not null default 0, add column slot_minutes int not null default 30;
--   daily_cap CHECK raised from 500 to 2000; lost_send_enqueue takes up to 2000 items a call (was 500).
-- This file: lost_send_config_set() accepts slot_cap and slot_minutes (Level 5), and lost_send_info() returns slot_cap, slot_minutes and sent_today
-- so the To message page can show and change the pace.

create or replace function public.lost_send_config_set(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare who text;
begin
  if lost_send_level() < 5 then raise exception 'Level 5 only'; end if;
  select m.name into who from dashboard_me() m limit 1;
  update lost_send_config set
    enabled = coalesce((p_patch ->> 'enabled')::boolean, enabled),
    daily_cap = coalesce((p_patch ->> 'daily_cap')::int, daily_cap),
    per_run = coalesce((p_patch ->> 'per_run')::int, per_run),
    slot_cap = coalesce((p_patch ->> 'slot_cap')::int, slot_cap),
    slot_minutes = coalesce((p_patch ->> 'slot_minutes')::int, slot_minutes),
    hour_from = coalesce((p_patch ->> 'hour_from')::int, hour_from),
    hour_to = coalesce((p_patch ->> 'hour_to')::int, hour_to),
    campaign_tag = coalesce(nullif(btrim(p_patch ->> 'campaign_tag'), ''), campaign_tag),
    offer_smoothing = coalesce(nullif(btrim(p_patch ->> 'offer_smoothing'), ''), offer_smoothing),
    offer_colour = coalesce(nullif(btrim(p_patch ->> 'offer_colour'), ''), offer_colour),
    offer_until = coalesce(nullif(btrim(p_patch ->> 'offer_until'), ''), offer_until),
    test_phone = case when p_patch ? 'test_phone' then nullif('+' || regexp_replace(coalesce(p_patch ->> 'test_phone', ''), '\D', '', 'g'), '+') else test_phone end,
    updated_at = now(), updated_by = who
  where id = 1;
  return lost_send_info();
end $function$;

create or replace function public.lost_send_info() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $function$
declare cfg lost_send_config; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  select * into cfg from lost_send_config where id = 1;
  return jsonb_build_object(
    'enabled', cfg.enabled, 'daily_cap', cfg.daily_cap, 'per_run', cfg.per_run, 'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to,
    'slot_cap', cfg.slot_cap, 'slot_minutes', cfg.slot_minutes,
    'campaign_tag', cfg.campaign_tag, 'offer_smoothing', cfg.offer_smoothing, 'offer_colour', cfg.offer_colour, 'offer_until', cfg.offer_until,
    'test_ready', cfg.test_phone is not null,
    'used_today', (select count(*) from lost_send_jobs j where not j.is_test and j.campaign = cfg.campaign_tag and j.status in ('queued', 'sending', 'sent')
                    and (j.requested_at at time zone 'Asia/Dubai')::date = today),
    'sent_today', (select count(*) from lost_send_jobs j where not j.is_test and j.status = 'sent' and (j.sent_at at time zone 'Asia/Dubai')::date = today),
    'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int,
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'qtype', t.qtype, 'variant', t.variant, 'respond_name', t.respond_name,
                    'body', t.body, 'footer', t.footer, 'vars', t.vars, 'approved', t.approved) order by t.sort), '[]'::jsonb) from lost_send_templates t),
    'branches', (select coalesce(jsonb_agg(c.branch), '[]'::jsonb) from lost_send_channels c));
end $function$;
