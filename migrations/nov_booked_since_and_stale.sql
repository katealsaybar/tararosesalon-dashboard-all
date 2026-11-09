-- nov_booked_since_and_stale.sql, Kate, 9 Nov 2026 (Database Blasts, November: Results).
--
-- WHY: on 9 Nov the Results page showed Booked ahead 4 (it was 8 before Kate's leave) and Cost per booking, Projected spend and
-- Projected per booked client all moved with it. Cause: "booked ahead" is a snapshot of bookings dated from today on. The bookings sync
-- did not run 6 to 8 Nov (leave) and Sales were loaded only to 3 Nov, so the clients whose booking date passed on 5 to 8 Nov were
-- counted nowhere: no longer ahead, not yet "came in". Four blast clients fell into that hole (2 have since paid AED 625, 1 re-booked).
--
-- WHAT THIS DOES (all additive, nothing is deleted, nothing is sent):
--   1. client_booking_first_seen: the first day each booking (branch, client, booking date) was seen in client_bookings. A statement
--      trigger on client_bookings writes it on every sync, insert only, so a booking that is later attended, moved or cancelled keeps
--      its first-seen day. Names live here only as the lower-case client key, same as client_bookings. No policy, no grant: only
--      security definer functions read it.
--   2. nov_client_facts gets booked_since (the client has a booking first seen on or after her first send day, for a date on or after it)
--      and booked_first_seen. nov_job_rows carries booked_since. nov_drill: 'since' = ahead or booked_since or came_in (cumulative),
--      'bsince' = booked_since.
--   3. nov_results_core: money.booked_since added; booked_or_in = ahead or booked_since or came_in, so Cost per booking no longer shrinks
--      when a booking date passes. New top-level 'today', 'bookings_age_days', 'sales_age_days' and 'stale' {bookings, sales}: the page
--      holds back the dependent figures and says why when the bookings pull is more than 1 day old or sales are more than 2 days behind.
-- nov_results_core and nov_drill in their final form (with the deposit and by-day additions) are in nov_results_deposits_bookdays.sql, which also
-- restates nov_client_facts and nov_job_rows with dep_st and dep_soon. Apply this file first, then that one.
-- The 4 Nov snapshot was pulled at 17:44, during the send, so a booking first seen on 4 Nov may pre-date the message by a few hours.
-- Matching is by name key like the rest of the November results, so it stays a ceiling, not proof the message caused it.
-- Applied by hand on 9 Nov 2026 (project gvijxenafoowajqktqvd); backfilled from the saved 4 Nov, 5 Nov and 9 Nov snapshots.

-- 1. first-seen log ----------------------------------------------------------------------------------------------------
create table if not exists public.client_booking_first_seen (
  branch        text not null,
  client_key    text not null,
  date          date not null,
  first_seen_on date not null,
  primary key (branch, client_key, date)
);
create index if not exists client_booking_first_seen_key on public.client_booking_first_seen (client_key);
alter table public.client_booking_first_seen enable row level security;
revoke all on public.client_booking_first_seen from public, anon, authenticated;

create or replace function public.cbfs_capture() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.client_booking_first_seen (branch, client_key, date, first_seen_on)
  select branch, client_key, date, coalesce(min(pulled_on), (now() at time zone 'Asia/Dubai')::date)
  from new_rows group by branch, client_key, date
  on conflict (branch, client_key, date) do nothing;
  return null;
end $$;

drop trigger if exists cbfs_after_insert on public.client_bookings;
create trigger cbfs_after_insert after insert on public.client_bookings
  referencing new table as new_rows for each statement execute function public.cbfs_capture();

-- 2. facts and rows ------------------------------------------------------------------------------------------------------
create or replace view public.nov_client_facts as
 WITH s AS (
         SELECT DISTINCT ON ((stl_key_fold(j.client_key))) stl_key_fold(j.client_key) AS k,
            j.id, j.blast_id, j.client_key, j.branch, j.phone, j.sent_at, j.delivery, j.stop
           FROM nov_send_jobs j
          WHERE NOT j.is_test AND NOT j.dry AND j.status = 'sent'::text AND j.retried_at IS NULL
          ORDER BY (stl_key_fold(j.client_key)), j.sent_at
        ), f0 AS (
         SELECT stl_key_fold(nov_send_jobs.client_key) AS k,
            min((nov_send_jobs.sent_at AT TIME ZONE 'Asia/Dubai'::text)::date) AS sent_d
           FROM nov_send_jobs
          WHERE NOT nov_send_jobs.is_test AND NOT nov_send_jobs.dry AND nov_send_jobs.status = 'sent'::text
          GROUP BY (stl_key_fold(nov_send_jobs.client_key))
        ), nb AS (
         SELECT stl_key_fold(b.client_key) AS k, min(b.date) AS nxt, count(DISTINCT b.date) AS appts
           FROM client_bookings b
          WHERE b.date >= (now() AT TIME ZONE 'Asia/Dubai'::text)::date
          GROUP BY (stl_key_fold(b.client_key))
        ), sv AS (
         SELECT stl_key_fold(b.client_key) AS k, b.date, string_agg(b.services, ', '::text) AS svc
           FROM client_bookings b
          WHERE b.date >= (now() AT TIME ZONE 'Asia/Dubai'::text)::date
          GROUP BY (stl_key_fold(b.client_key)), b.date
        ), cl AS (
         SELECT item_classes.item, item_classes.kind, item_classes.category, item_classes.family, item_classes.stem, item_classes.via
           FROM item_classes(COALESCE(( SELECT array_agg(DISTINCT nov_client_lines.item) AS array_agg
                   FROM nov_client_lines), '{}'::text[])) item_classes(item, kind, category, family, stem, via)
        ), pay AS (
         SELECT ln.k, sum(ln.total) AS spent, bool_or(ln.vis_ok) AS vis
           FROM nov_client_lines ln JOIN cl c ON c.item = ln.item
          WHERE c.category <> 'SKIP'::text AND c.family <> 'skip'::text
          GROUP BY ln.k
        ), bs AS (
         SELECT stl_key_fold(c.client_key) AS k, min(c.first_seen_on) AS first_seen
           FROM client_booking_first_seen c JOIN f0 ON f0.k = stl_key_fold(c.client_key)
          WHERE c.date >= f0.sent_d AND c.first_seen_on >= f0.sent_d
          GROUP BY (stl_key_fold(c.client_key))
        )
 SELECT s.k, s.id, s.blast_id, s.client_key, s.branch, s.phone, s.sent_at, s.delivery, s.stop, f0.sent_d,
    nb.k IS NOT NULL AS ahead,
    nb.nxt,
    "left"(COALESCE(sv.svc, ''::text), 90) AS svc,
    COALESCE(nb.appts, 0::bigint) AS appts,
    nb.k IS NULL AND pay.spent > 0::numeric AND pay.vis AS came_in,
        CASE WHEN pay.spent > 0::numeric AND pay.vis THEN pay.spent ELSE 0::numeric END AS spent,
    bs.k IS NOT NULL AS booked_since,
    bs.first_seen AS booked_first_seen
   FROM s
     JOIN f0 ON f0.k = s.k
     LEFT JOIN nb ON nb.k = s.k
     LEFT JOIN sv ON sv.k = s.k AND sv.date = nb.nxt
     LEFT JOIN pay ON pay.k = s.k
     LEFT JOIN bs ON bs.k = s.k;
revoke all on public.nov_client_facts from public, anon, authenticated;

create or replace view public.nov_job_rows as
 SELECT j.id, j.blast_id, j.client_key, initcap(j.client_key) AS client, j.phone, j.branch, j.status, j.delivery, j.err_code, j.error,
    COALESCE(j.stop, false) AS stop, j.sent_at, j.requested_at, j.requested_by, COALESCE(j.status_checks, 0) AS status_checks,
    j.body_text, j.message_id, COALESCE(j.contact_id, w.contact_id) AS cid, w.last_in,
    COALESCE(w.last_in > j.sent_at, false) AS replied,
    COALESCE(f.ahead, false) AS ahead, f.nxt, f.svc, COALESCE(f.appts, 0::bigint) AS appts,
    COALESCE(f.came_in, false) AS came_in, COALESCE(f.spent, 0::numeric) AS spent,
    j.resend_of,
    COALESCE(f.booked_since, false) AS booked_since
   FROM nov_send_jobs j
     LEFT JOIN lost_wa_status w ON w.phone = j.phone
     LEFT JOIN nov_client_facts f ON f.k = stl_key_fold(j.client_key)
  WHERE NOT j.is_test AND NOT j.dry AND j.retried_at IS NULL;
revoke all on public.nov_job_rows from public, anon, authenticated;
