-- Website & Search detail (Kate, 6 Oct 2026: rows clickable like Google Ads' campaigns).
-- Applied live on 6 Oct 2026. One source, page or search, day by day, for the row
-- the page opens: p_kind 'channel' (ga4_channel_daily), 'page' (ga4_page_daily) or
-- 'query' (gsc_query_daily). Level 3 and above, like website_report.
create or replace function public.website_item(p_kind text, p_key text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare out jsonb;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'Website & Search is for Level 3 and above';
  end if;
  if p_kind = 'channel' then
    select coalesce(jsonb_agg(d order by d.date), '[]') into out from (
      select date, sessions, engaged_sessions from ga4_channel_daily
      where channel = p_key and date between p_from and p_to) d;
  elsif p_kind = 'page' then
    select coalesce(jsonb_agg(d order by d.date), '[]') into out from (
      select date, views from ga4_page_daily
      where page = p_key and date between p_from and p_to) d;
  elsif p_kind = 'query' then
    select coalesce(jsonb_agg(d order by d.date), '[]') into out from (
      select date, clicks, impressions, position from gsc_query_daily
      where query = p_key and date between p_from and p_to) d;
  else
    raise exception 'website_item: unknown kind %', p_kind;
  end if;
  return jsonb_build_object('days', out);
end;
$function$;
revoke all on function public.website_item(text, text, date, date) from public, anon;
grant execute on function public.website_item(text, text, date, date) to authenticated;
