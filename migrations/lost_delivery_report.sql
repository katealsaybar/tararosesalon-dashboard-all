-- Lost Clients, Performance report: did our message arrive? (Kate, 18 Oct 2026). Seen / delivered / not delivered yet / failed, by branch and by day.
-- NOT applied yet: Kate said to build it and not deploy. Needs migrations/lost_wa_out_status.sql (applied 18 Oct) for lost_wa_status.out_msgs.
-- Per real message sent (lost_send_flags.status = 'sent'): respond.io's delivery status of the outgoing message nearest the send time (within 15
-- minutes), as kept by respond-status-sync on its nightly run. seen = read; delivered = delivered but not read; sent_only = accepted, not delivered yet;
-- failed = WhatsApp refused it; unknown = no status read yet (the number was not checked since). A client who replied still counts by the status of the message.
-- Statuses move nightly, so today's sends fill in tomorrow. Level 3 and above, like the rest of the report.

create or replace function public.lost_delivery_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if lost_send_level() < 3 then raise exception 'Level 3 and above'; end if;
  with j as (select f.id, f.branch, f.phone, f.sent_at from public.lost_send_flags f where f.status = 'sent'),
  x as (
    select j.id, j.branch, (j.sent_at at time zone 'Asia/Dubai')::date as d,
      case (select m->>'s' from jsonb_array_elements(coalesce(w.out_msgs, '[]'::jsonb)) m
            where abs((m->>'t')::double precision - extract(epoch from j.sent_at)) < 900
            order by abs((m->>'t')::double precision - extract(epoch from j.sent_at)) limit 1)
        when 'read' then 'seen' when 'delivered' then 'delivered' when 'failed' then 'failed' when 'sent' then 'sent' else 'unknown' end as st
    from j left join public.lost_wa_status w on w.phone = j.phone)
  select jsonb_build_object(
    'at', now(),
    'total', (select jsonb_build_object('sent', count(*), 'seen', count(*) filter (where st = 'seen'), 'delivered', count(*) filter (where st = 'delivered'),
              'sent_only', count(*) filter (where st = 'sent'), 'failed', count(*) filter (where st = 'failed'), 'unknown', count(*) filter (where st = 'unknown')) from x),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('k', branch, 'sent', n, 'seen', a, 'delivered', b, 'sent_only', c, 'failed', e, 'unknown', u) order by n desc, branch), '[]'::jsonb)
       from (select branch, count(*) n, count(*) filter (where st = 'seen') a, count(*) filter (where st = 'delivered') b, count(*) filter (where st = 'sent') c,
                    count(*) filter (where st = 'failed') e, count(*) filter (where st = 'unknown') u from x group by branch) q),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('k', d, 'sent', n, 'seen', a, 'delivered', b, 'sent_only', c, 'failed', e, 'unknown', u) order by d), '[]'::jsonb)
       from (select d, count(*) n, count(*) filter (where st = 'seen') a, count(*) filter (where st = 'delivered') b, count(*) filter (where st = 'sent') c,
                    count(*) filter (where st = 'failed') e, count(*) filter (where st = 'unknown') u from x group by d) q))
  into out;
  return out;
end $$;

revoke all on function public.lost_delivery_report() from public, anon;
grant execute on function public.lost_delivery_report() to authenticated;
