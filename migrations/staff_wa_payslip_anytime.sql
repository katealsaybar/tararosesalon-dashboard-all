-- Payslip WhatsApp goes the moment the payslip email is sent (Kate, 4 Nov 2026: "dapat auto send na pag naka on yung sending button
-- and pag nasend na yung emails"). Until now every staff WhatsApp, payslip or not, waited for the 09:00 to 20:59 Dubai window, so the
-- 07:00 payslip emails left 66 WhatsApps queued until 9. Now a payslip job (batch 'payslip-YYYY-MM', queued by staff_wa_enqueue_payslip)
-- skips the window. The kill switch and the daily cap still apply, and every other message (campaigns, reminders) keeps the window.
-- The staff-wa-worker cron also ran only 05:00 to 16:59 UTC (09:00 to 20:59 Dubai), so it would never have fired at 07:00 Dubai:
-- it now runs every minute all day; staff_wa_claim returns nothing when there is nothing it may send.

create or replace function public.staff_wa_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg staff_wa_config; hr int; room int; n int; out jsonb; today date := (now() at time zone 'Asia/Dubai')::date;
begin
  select * into cfg from staff_wa_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  update staff_wa_jobs set status = 'failed', error = 'Interrupted while sending. Look in respond.io before you retry; it may have gone.'
    where status = 'sending' and claimed_at < now() - interval '10 minutes';
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  select greatest(0, cfg.daily_cap - count(*)) into room from staff_wa_jobs j
    where not j.is_test and j.status in ('sending', 'sent') and (coalesce(j.sent_at, j.claimed_at) at time zone 'Asia/Dubai')::date = today;
  with cand as (
    select j.id, j.is_test, row_number() over (partition by j.is_test order by j.id) rn
    from staff_wa_jobs j
    where j.status = 'queued' and j.next_try_at <= now()
      and (j.is_test or (cfg.enabled and (j.batch like 'payslip-%' or (hr >= cfg.hour_from and hr < cfg.hour_to))))
  ), pick as (
    select j.id from staff_wa_jobs j join cand c on c.id = j.id
    where c.is_test or c.rn <= room
    order by j.is_test desc, j.id limit n for update of j skip locked
  ), upd as (
    update staff_wa_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1
    from pick where j.id = pick.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'staff_id', u.staff_id, 'phone', u.phone, 'channel_id', u.channel_id, 'msg_type', u.msg_type,
      'params', u.params, 'body_text', u.body_text, 'is_test', u.is_test, 'attempts', u.attempts, 'template', t.respond_name, 'language', coalesce(t.language, 'en'),
      'name', s.name) order by u.id), '[]'::jsonb)
  into out from upd u join staff_phones s on s.id = u.staff_id left join staff_wa_templates t on t.key = u.tkey;
  return out;
end $$;

revoke all on function public.staff_wa_claim(int) from public, anon, authenticated;

select cron.alter_job((select jobid from cron.job where jobname = 'staff-wa-worker'), schedule := '* * * * *');
