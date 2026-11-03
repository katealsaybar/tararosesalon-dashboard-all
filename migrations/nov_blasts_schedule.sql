-- November blasts: move a blast to another day or start time from the page (applied live 3 Nov 2026, additive).
-- The send day, Al Quoz day and start time of each blast sit in nov_blast_items.data (date, aq_date, time). This writes them.
-- Al Quoz is shut Sundays and Mondays, so its clients go on the next Tuesday; every other day it sends the same day.
-- Never a Friday (Kate, 21 Oct 2026), nothing before today, and the last day is 28 Nov so every message still has its offer window.
-- Same level check as nov_blast_decide and nov_blast_review (Levels 3 and 5 edit).

create or replace function public.nov_blast_schedule(p_id text, p_date date, p_time text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.blast_plan_guard(); aq date;
begin
  if not exists (select 1 from public.nov_blast_items where id = p_id and data ? 'date') then raise exception 'Unknown blast'; end if;
  if p_date is null or p_date <= (now() at time zone 'Asia/Dubai')::date then raise exception 'Pick a day after today'; end if;
  if p_date > date '2026-11-28' then raise exception 'The last day is 28 November'; end if;
  if extract(dow from p_date) = 5 then raise exception 'No blasts on a Friday'; end if;
  if p_time is null or p_time !~ '^(09|1[0-5]):(00|30)$' then raise exception 'Start between 9:00 am and 3:30 pm, on the hour or half hour'; end if;
  aq := case extract(dow from p_date) when 1 then p_date + 1 when 0 then p_date + 2 else p_date end;
  update public.nov_blast_items
     set data = data || jsonb_build_object('date', to_char(p_date, 'YYYY-MM-DD'), 'aq_date', to_char(aq, 'YYYY-MM-DD'), 'time', p_time)
   where id = p_id;
  return jsonb_build_object('ok', true, 'date', p_date, 'aq_date', aq, 'time', p_time);
end $$;

revoke all on function public.nov_blast_schedule(text, date, text) from public, anon, authenticated;
grant execute on function public.nov_blast_schedule(text, date, text) to authenticated;
