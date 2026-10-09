-- Campaign lists: "messaged" comes from respond.io, not a tick (Kate, 9 Oct 2026). Already applied; this is the record.
-- The nightly respond-status-sync already keeps the last message we sent each number (lost_wa_status.last_out).
-- A client counts as messaged when that is on or after lost_lists_config.campaign_from (9 Oct 2026, the day
-- Emma's lists were handed over; change the date there for the next round). lost_lists returns it as "messaged"
-- and lost_lists_summary returns campaign_from. The manual lost_messaged table and lost_mark_sent / lost_unmark_sent
-- from lost_lists.sql are left in place but the page no longer uses them. Limit: only messages sent through
-- respond.io are seen; a text sent from another system is not.
alter table public.lost_lists_config add column if not exists campaign_from date not null default '2026-10-09';

create or replace function public.lost_lists(p_list text) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '30s' as $$
declare out jsonb; since date;
begin
  if p_list not in ('1','2','3','4','5','held') then raise exception 'unknown list'; end if;
  select campaign_from into since from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core())
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', c.client_key, 'client_name', c.client_name, 'area', c.area, 'branch', c.branch,
      'last_visit', c.last_visit, 'days_since', c.days_since, 'last_keratin', c.last_keratin,
      'last_colour', c.last_colour, 'last_toner', c.last_toner, 'cats', c.cats,
      'stylist', c.stylist, 'also_saw', c.also_saw, 'mobile', c.mobile, 'n_numbers', c.n_numbers,
      'wa', c.wa, 'last_in', c.last_in, 'last_out', c.last_out, 'booked_on', c.booked_on,
      'also_on', (select jsonb_agg(v) from (values (case when c.f1 then '1' end), (case when c.f2 then '2' end), (case when c.f3 then '3' end),
                   (case when c.f4 then '4' end), (case when c.f5 then '5' end)) t(v) where v is not null),
      'still', (p_list = '2' and c.last_visit >= current_date - (select lost_days from lost_lists_config where id = 1)),
      'toner_only', (c.last_colour is null and c.last_toner is not null),
      'messaged', (c.last_out is not null and c.last_out >= since)
    ) order by c.last_visit desc), '[]'::jsonb) into out
  from c
  where case p_list when '1' then c.f1 when '2' then c.f2 when '3' then c.f3 when '4' then c.f4 when '5' then c.f5 else c.held end;
  return out;
end $$;
revoke all on function public.lost_lists(text) from public, anon;
grant execute on function public.lost_lists(text) to authenticated;

-- lost_lists_summary: the same as before, plus 'campaign_from' under 'fresh' (see the function in the database).
