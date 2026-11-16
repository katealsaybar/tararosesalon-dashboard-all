-- 16 Nov 2026 (Kate): Blast 2 reminders say "Tara Rose Salons", not "Tara Rose Saadiyat".
-- The approved Meta template tr_nov2_reminder_* keeps its {{2}}; what goes into {{2}} changes. No new template, nothing resubmitted.
-- Applied live on gvijxenafoowajqktqvd 16 Nov 2026. Blast 1 and the Due reminders (tr_nov_*) still get the branch name.
create or replace function public.nov_send_salon_for(p_tpl text, p_branch text) returns text
language sql immutable as $$
  select case when p_tpl like 'tr_nov2\_%' and public.nov_send_salon(p_branch) is not null then 'Salons' else public.nov_send_salon(p_branch) end
$$;

-- nov_send_enqueue: params and rendered body use nov_send_salon_for(d.tpl, c.branch) instead of nov_send_salon(c.branch)
-- nov_send_test:    uses nov_send_salon_for(d.tpl, 'SAA') instead of the fixed 'Saadiyat'
-- (done live by rewriting the two function bodies in place; the where-clause "nov_send_salon(c.branch) is not null" is unchanged)

-- Al Quoz today (Kate, 16 Nov 2026, "send na lahat now pati al quozzz"): nov_send_candidates() holds Al Quoz clients of Blast 2 on a Sunday or Monday
-- ("Al Quoz is shut today, it goes on its next open day"). For 16 Nov 2026 only, that hold is off: the line now reads
--   td.wv = 2 and e.branch = 'AQ' and td.dow in (0, 1) and (now() at time zone 'Asia/Dubai')::date <> date '2026-11-16'
-- so from 17 Nov it is back to normal. Applied live the same way (function body rewritten in place).

-- Slow page fix (Kate, 16 Nov 2026: "super bagal, hindi nag-aappear # of clients"): nov_blast_audience() took over 30 seconds once Blast 2 had queued about 800 more jobs.
-- The "is this client already sent in this wave" test was an EXISTS with an OR across the whole sent list, row by row. It is now two hashed IN tests with the same meaning:
--   mem as (select x.*, coalesce(((nov_wave(x.blast_id), x.k) in (select s0.w, s0.k from sent s0)
--                              or (nov_wave(x.blast_id), stl_key_fold(x.k)) in (select s1.w, s1.f from sent s1)), false) as is_sent from nov_blast_snap x)
-- Same counts, 0.9 seconds. Applied live by rewriting the function body in place. The client snapshot (nov_blast_snap) was also rebuilt by hand at 11:25 and 13:31 Dubai, because only
-- a Level 3 or 5 page session can run nov_blast_snap_refresh() and it is rebuilt when over 60 minutes old.
