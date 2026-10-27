-- Kate, 27 Oct 2026: the Lost Client Blasts outcome facts (came back, done) count a visit the same way as
-- clients through the door and the rest of Client's Last Visit (lv_lines, lost_clients and the other lost_*
-- functions already do, door_clients_payment_entry.sql).
--
--   In lost_client_facts_live the "vis" step (first and last real visit since the message) now needs a paid
--   sale (an entry in Payment Type) that is not rung to BUSINESS TRS and is not a deposit, balance payment or
--   voucher sale, and leaves out client names with the word Staff in them. Before, any line that was not a
--   Deposit counted, so a balance payment or a zero-value consultation could mark a client as "came back".
--
-- The deposit balance (dep) is left as it was: it is about deposits on purpose.
-- Run this file as it is, then select public.lost_facts_refresh() to rebuild lost_client_facts_cache.

create or replace view public.lost_client_facts_live as
 WITH s AS (
         SELECT DISTINCT ON (j.client_key) j.client_key AS k,
            (j.sent_at AT TIME ZONE 'Asia/Dubai'::text)::date AS sent_d
           FROM lost_send_jobs j
          WHERE j.status = 'sent'::text AND NOT j.is_test
          ORDER BY j.client_key, j.sent_at
        ), nb AS (
         SELECT DISTINCT ON ((stl_key_fold(b.client_key))) stl_key_fold(b.client_key) AS k,
            b.date AS nxt
           FROM client_bookings b
          WHERE b.date >= CURRENT_DATE
          ORDER BY (stl_key_fold(b.client_key)), b.date
        ), sv AS (
         SELECT stl_key_fold(b.client_key) AS k,
            b.date,
            string_agg(b.services, ', '::text) AS svc
           FROM client_bookings b
          WHERE b.date >= CURRENT_DATE
          GROUP BY (stl_key_fold(b.client_key)), b.date
        ), ap AS (
         SELECT stl_key_fold(b.client_key) AS k,
            count(DISTINCT b.date) AS n
           FROM client_bookings b
          WHERE b.date >= CURRENT_DATE
          GROUP BY (stl_key_fold(b.client_key))
        ), dep AS (
         SELECT stl_key_fold(stl_client_key(l.client_name)) AS k,
            COALESCE(sum(l.net), 0::numeric) AS bal
           FROM sales_transaction_lines l
          WHERE (l.item = ANY (ARRAY['Deposit'::text, 'Deposit (Refund)'::text])) AND l.date >= (CURRENT_DATE - 90)
          GROUP BY (stl_key_fold(stl_client_key(l.client_name)))
        ), vis AS (
         SELECT q.k,
            min(q.d) AS first_d,
            max(q.d) AS last_d
           FROM ( SELECT stl_key_fold(stl_client_key(l.client_name)) AS k,
                    l.date AS d,
                    COALESCE(l.employee_name, ''::text) !~* '^\s*business\M'::text
                      AND bool_or(NULLIF(TRIM(BOTH FROM l.payment_raw), ''::text) IS NOT NULL) OVER (PARTITION BY l.branch, l.date, l.sale_id) AS is_visit
                   FROM sales_transaction_lines l
                  WHERE l.date >= (( SELECT min(s.sent_d) AS min
                           FROM s)) AND l.net >= 0::numeric AND l.item IS NOT NULL
                    AND (stl_item_kind(l.item) <> ALL (ARRAY['non_sale'::text, 'voucher'::text]))
                    AND l.client_name !~* '\mstaff\M'::text) q
          WHERE q.is_visit
          GROUP BY q.k
        ), stp AS (
         SELECT f.client_key AS k,
            bool_or(f.stop) AS stop
           FROM lost_send_flags f
          GROUP BY f.client_key
        ), x AS (
         SELECT s.k AS client_key,
            s.sent_d,
            nb.k IS NOT NULL AS ahead,
            nb.nxt,
            "left"(COALESCE(sv.svc, ''::text), 90) AS svc,
            COALESCE(ap.n, 0::bigint) AS n_appts,
            COALESCE(d.bal, 0::numeric) AS bal,
            nb.k IS NULL AND v.first_d IS NOT NULL AND v.first_d >= s.sent_d AS done,
            v.last_d,
                CASE
                    WHEN v.first_d >= s.sent_d THEN v.first_d
                    ELSE NULL::date
                END AS came_d,
            COALESCE(p.stop, false) AS stop,
            t.resched_on,
            t.cancelled_on,
            nb.k IS NOT NULL AND nb.nxt <> CURRENT_DATE AND COALESCE(sv.svc, ''::text) ~* 'balayage|foil|highlight|all over colo|restyle|extension'::text AS needs_dep
           FROM s
             LEFT JOIN nb ON nb.k = s.k
             LEFT JOIN sv ON sv.k = s.k AND sv.date = nb.nxt
             LEFT JOIN ap ON ap.k = s.k
             LEFT JOIN dep d ON d.k = s.k
             LEFT JOIN vis v ON v.k = s.k
             LEFT JOIN stp p ON p.k = s.k
             LEFT JOIN lost_booking_track t ON t.client_key = s.k
        )
 SELECT client_key,
    sent_d,
    ahead,
    nxt,
    svc,
    n_appts,
    bal,
    done,
    stop,
    resched_on,
    cancelled_on,
    needs_dep,
        CASE
            WHEN NOT ahead THEN NULL::text
            WHEN bal > 0::numeric THEN 'paid'::text
            WHEN nxt = CURRENT_DATE THEN 'today'::text
            WHEN needs_dep THEN 'need'::text
            ELSE 'none'::text
        END AS st,
        CASE
            WHEN stop THEN 'stop'::text
            WHEN ahead AND resched_on IS NOT NULL THEN 'rescheduled'::text
            WHEN ahead AND needs_dep THEN 'booked_dep'::text
            WHEN ahead THEN 'booked_nodep'::text
            WHEN cancelled_on IS NOT NULL AND NOT COALESCE(last_d >= cancelled_on, false) THEN 'cancelled'::text
            WHEN done THEN 'done'::text
            ELSE NULL::text
        END AS outcome,
    came_d AS came_on
   FROM x;
