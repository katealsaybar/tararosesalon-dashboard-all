-- Kate, 9 Oct 2026: the Lost Clients table and downloads show "Last service", the date of the client's last service of
-- any kind, beside Last smoothing and Last colouring.
--
-- lost_lists() already sent last_keratin, last_colour and last_toner. The date of the last OTHER service (a cut, a
-- treatment, beauty, nails, extensions) sits in lost_lists_base.last_other (set by lost_lists_refresh(): the latest
-- non-colour service inside the window), so it is attached here by client_key instead of changing lost_lists_core()'s
-- return type. last_service is the latest of the four; greatest() skips nulls. Nothing is removed or renamed: two keys
-- are added to each row, so the page that is live today keeps working until it is updated to read them.
--
-- Same properties as before (security definer, stable, search_path public, 30s timeout); CREATE OR REPLACE would
-- otherwise drop the SET clauses.
create or replace function public.lost_lists(p_list text) returns jsonb
language plpgsql stable security definer set search_path to 'public' set statement_timeout to '30s'
as $function$
declare out jsonb; since date;
begin
  if p_list not in ('1','2','3','4','5','held') then raise exception 'unknown list'; end if;
  select campaign_from into since from lost_lists_config where id = 1;
  with c as (
    select co.*, b.last_other
    from public.lost_lists_core() co
    left join public.lost_lists_base b on b.client_key = co.client_key
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'client_key', c.client_key, 'client_name', c.client_name, 'area', c.area, 'branch', c.branch,
      'last_visit', c.last_visit, 'days_since', c.days_since, 'last_keratin', c.last_keratin,
      'last_colour', c.last_colour, 'last_toner', c.last_toner, 'cats', c.cats,
      'last_other', c.last_other,
      'last_service', greatest(c.last_keratin, c.last_colour, c.last_toner, c.last_other),
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
end $function$;
