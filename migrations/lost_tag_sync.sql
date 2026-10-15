-- Lost Clients tag sync (Kate, 15 Oct 2026): who the lost-tag-sync edge function should look at.
-- 'jobs'   = contacts the site sent a Lost Clients message to (lost_send_jobs, sent, not a test).
-- 'recent' = contacts respond.io shows an outgoing message to on or after p_since (default campaign_from),
--            used for dry runs before the site has sent anything.
-- booked   = the client has a booking from today on in client_bookings (same key fold the lists use).
-- Service role only: it returns phone numbers, so anon and signed-in users cannot call it.
create or replace function public.lost_tag_candidates(p_source text default 'jobs', p_since date default null)
returns table(contact_id bigint, phone text, client_key text, sent_at timestamptz, booked boolean)
language plpgsql security definer set search_path = public as $$
begin
  if p_source = 'jobs' then
    return query
      select distinct on (j.contact_id) j.contact_id, j.phone, j.client_key, j.sent_at,
             exists (select 1 from client_bookings b where b.date >= current_date and public.stl_key_fold(b.client_key) = j.client_key)
      from lost_send_jobs j
      where j.status = 'sent' and not j.is_test and j.contact_id is not null
      order by j.contact_id, j.sent_at desc;
  else
    return query
      select distinct on (w.contact_id) w.contact_id, w.phone, b.client_key, w.last_out,
             exists (select 1 from client_bookings k where k.date >= current_date and public.stl_key_fold(k.client_key) = b.client_key)
      from lost_wa_status w
      join lost_lists_base b on b.phones like '%' || w.phone || '%'
      where w.found and w.contact_id is not null
        and w.last_out >= coalesce(p_since, (select campaign_from from lost_lists_config where id = 1))
      order by w.contact_id, w.last_out desc;
  end if;
end $$;

revoke all on function public.lost_tag_candidates(text, date) from public, anon, authenticated;
grant execute on function public.lost_tag_candidates(text, date) to service_role;
