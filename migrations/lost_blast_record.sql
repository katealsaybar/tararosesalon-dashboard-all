-- Lost Client Blasts, Performance report: a daily record of what it took to get a booking (Kate, 26 Oct 2026).
-- "dba may est. AED 1068 tayo pang send ng blasts, i would need to also record how much it took to have the clients book (how many messages before they said yes)".
-- The page only ever shows today's totals, so the cost per booking cannot be looked back on. One row a day (Dubai date), written at 00:05 Dubai time by
-- lost_blast_record_run() (cron lost-blast-record, 20:05 UTC) and readable by Level 3 and above through lost_blast_record_get().
--
--   sent                 real messages sent so far (not tests)
--   cost_aed             sent times the rate (AED 0.17, the rate lost_campaign_money uses; an estimate, Meta's invoice has the exact amount)
--   booked_ahead         messaged clients with a booking from today on
--   booked_since         booked ahead plus the ones who already came in since our message (lost_client_facts, the same count as Booked since the message)
--   messages_per_booking sent / booked_since
--   cost_per_booking     cost_aed / booked_since
--   cost_per_ahead       cost_aed / booked_ahead (what the Spent card shows)
-- Clients with a booking who were sent two messages count once as a client; their messages both count in sent, which is the point: it is what it took.

create table if not exists public.lost_blast_record (
  day                  date primary key,
  sent                 int not null,
  cost_aed             numeric not null,
  rate                 numeric not null,
  replied              int not null,
  stop                 int not null,
  booked_ahead         int not null,
  booked_since         int not null,
  messages_per_booking numeric,
  cost_per_booking     numeric,
  cost_per_ahead       numeric,
  recorded_at          timestamptz not null default now()
);
alter table public.lost_blast_record enable row level security;
revoke all on public.lost_blast_record from public, anon, authenticated;

create or replace function public.lost_blast_record_run(p_rate numeric default 0.17) returns text
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Dubai')::date; s int; rp int; st int; ah int; sn int;
begin
  select count(*) filter (where status = 'sent'), count(*) filter (where replied and not coalesce(stop, false)), count(*) filter (where stop)
    into s, rp, st from public.lost_send_flags;
  select count(*) filter (where ahead), count(*) filter (where ahead or done) into ah, sn from public.lost_client_facts_live;
  insert into public.lost_blast_record (day, sent, cost_aed, rate, replied, stop, booked_ahead, booked_since, messages_per_booking, cost_per_booking, cost_per_ahead)
  values (d, s, s * p_rate, p_rate, rp, st, ah, sn, round(s::numeric / nullif(sn, 0), 1), round(s * p_rate / nullif(sn, 0), 2), round(s * p_rate / nullif(ah, 0), 2))
  on conflict (day) do update set sent = excluded.sent, cost_aed = excluded.cost_aed, rate = excluded.rate, replied = excluded.replied, stop = excluded.stop,
    booked_ahead = excluded.booked_ahead, booked_since = excluded.booked_since, messages_per_booking = excluded.messages_per_booking,
    cost_per_booking = excluded.cost_per_booking, cost_per_ahead = excluded.cost_per_ahead, recorded_at = now();
  return format('%s: %s sent, AED %s, %s booked since, %s ahead', d, s, round(s * p_rate, 0), sn, ah);
end $$;
revoke all on function public.lost_blast_record_run(numeric) from public, anon, authenticated;

create or replace function public.lost_blast_record_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.dashboard_scope() is not null then raise exception 'Not available for this login'; end if;
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  return jsonb_build_object('rows', coalesce((select jsonb_agg(to_jsonb(r) - 'recorded_at' order by r.day desc) from public.lost_blast_record r), '[]'::jsonb));
end $$;
revoke all on function public.lost_blast_record_get() from public, anon;
grant execute on function public.lost_blast_record_get() to authenticated;

select cron.schedule('lost-blast-record', '5 20 * * *', 'select public.lost_blast_record_run()');
select public.lost_blast_record_run();

-- Messages before a yes (Kate, 26 Oct 2026, "yes pls"): lost_client_facts_cache gets n_msgs (blast messages sent to her, from lost_send_jobs; lost_facts_refresh fills it),
-- the log and the pop-ups return msgs per row (the Messages to her column), and lost_blast_record_get also returns msgs: for one message and for two,
-- the clients, how many of them booked or came in since our message, and how many have a booking ahead. 26 Oct: 56 of 4,171 clients sent one message said yes (1.3%),
-- 8 of 1,056 sent two (0.8%), so 1.1 messages each on average.
