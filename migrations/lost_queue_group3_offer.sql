-- Lost Clients: the 25% off colour offer for group 3 (Kate, 9 Oct 2026). Emma's brief: group 3 (lost clients who had colour or toner
-- May 2025 to May 2026) get a 25% off colour message with an introduction to the new stylists, until 31 October 2026.
-- "All group 3 get it" (Kate), so group 3 now comes FIRST in the To message order: a client in groups 1 or 2 and 3 (43 of them)
-- gets the colour offer, not the smoothing message. Order is now colour, smoothing, other services, everyone else.
-- The two colour templates carry the offer. Rows someone has already edited on the Templates tab (updated_by set) are left alone.

create or replace function public.lost_queue() returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '30s' as $$
declare lvl int; since date; lostd int; out jsonb;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 3 then raise exception 'To message is for Level 3 and above'; end if;
  select campaign_from, lost_days into since, lostd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core()),
  mk as (
    select distinct on (x.client_key) x.client_key, x.sent_on, x.sent_by
    from lost_messaged x where x.list_id = 'q' order by x.client_key, x.id desc
  ),
  q as (
    select c.*, m.sent_on as mk_on, m.sent_by as mk_by,
      case when c.f3 then 'colour'
           when c.f1 or c.f2 then (case when c.f1 or c.last_visit < current_date - lostd then 'smoothing_lost' else 'smoothing_still' end)
           when c.f5 then 'other' else 'catchall' end as qtype,
      greatest(case when c.last_out >= since then c.last_out end, m.sent_on) as sent_date
    from c left join mk m on m.client_key = c.client_key
    where c.f1 or c.f2 or c.f3 or c.f4 or c.f5
  )
  select jsonb_build_object(
    'campaign_from', since,
    'held', (select count(*) from c where c.held),
    'skipped', jsonb_build_object('nonum', count(*) filter (where q.wa = 'nonum'), 'blocked', count(*) filter (where q.wa = 'blocked'),
                                  'unchecked', count(*) filter (where q.wa = 'unchecked')),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'client_key', q.client_key, 'client_name', q.client_name, 'area', q.area, 'branch', q.branch,
      'last_visit', q.last_visit, 'days_since', q.days_since, 'last_keratin', q.last_keratin, 'last_colour', q.last_colour,
      'last_toner', q.last_toner, 'stylist', q.stylist, 'also_saw', q.also_saw, 'mobile', q.mobile, 'n_numbers', q.n_numbers,
      'wa', q.wa, 'last_in', q.last_in, 'last_out', q.last_out, 'qtype', q.qtype,
      'also_on', (select jsonb_agg(v) from (values (case when q.f1 then '1' end), (case when q.f2 then '2' end), (case when q.f3 then '3' end),
                   (case when q.f4 then '4' end), (case when q.f5 then '5' end)) t(v) where v is not null),
      'messaged', q.sent_date is not null,
      'sent_on', q.sent_date,
      'sent_by', case when q.sent_date is null then null when q.mk_on = q.sent_date then coalesce(q.mk_by, 'marked') else 'respond.io' end,
      'by_mark', (q.mk_on is not null and q.mk_on = q.sent_date),
      'replied', (q.sent_date is not null and q.last_in is not null and q.last_in >= q.sent_date)
    ) order by q.last_visit desc) filter (where q.wa in ('act', 'r18', 'noreply', 'text')), '[]'::jsonb))
  into out from q;
  return out;
end $$;

update public.lost_templates set body = 'Hi {first_name}, this is Tara Rose Salons {branch}. We were thinking of you. Your last colour[ with {stylist}] was in {month}, and we''d love to welcome you back with 25% off your next colour until 31 October, and an introduction to our new stylists. Would you like us to find you a time?'
  where key = 'wa_colour' and updated_by is null;
update public.lost_templates set body = 'Hi {first_name}, Tara Rose {branch} here. Enjoy 25% off your next colour until 31 October and meet our new stylists. Reply to book. Reply STOP to opt out.'
  where key = 'sms_colour' and updated_by is null;

revoke all on function public.lost_queue() from public, anon, authenticated;
grant execute on function public.lost_queue() to authenticated;
