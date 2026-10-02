-- Lost Clients: clients who moved branch (Kate, 2 Oct 2026). Applied live on 2 Oct 2026.
-- A check of the list found 238 "lost regulars" (about 8%) had come back within the
-- window, only at a different branch: they switched salons, they didn't leave. Each
-- row now carries now_at (the other branches she visited inside the same p_days
-- window, e.g. 'KCA') and now_last (her latest visit there). The page keeps those
-- rows off the list and the tiles and counts them on a line of their own.
-- Same function as lost_clients_level2.sql otherwise. The other branches are read
-- under the reader's own policies (security invoker), like the rest.

create or replace function public.lost_clients(
  p_branch text, p_min_visits int default 3, p_max_visits int default null, p_days int default 90)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout = '30s'
as $function$
declare out jsonb;
begin
  -- Level 2 and above only (Kate, 2 Oct 2026). Level 1 is reception; the page hides
  -- the menu entry for them too, but the refusal is here.
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 2 then
    raise exception 'Lost Clients is for Level 2 and above';
  end if;
  with l as (
    select public.stl_client_key(s.client_name) as k,
           regexp_replace(trim(s.client_name), '\s+', ' ', 'g') as name,
           s.date, s.net, s.employee_name
    from sales_transaction_lines s
    where s.branch = p_branch and s.date >= date '2025-01-01'
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
  ), c as (
    select k, max(name) as client_name, count(distinct date)::int as visits,
           min(date) as first_visit, max(date) as last_visit, round(sum(coalesce(net, 0)), 2) as spend
    from l group by k
  ), st as (
    select k, employee_name,
           row_number() over (partition by k order by count(*) desc, max(date) desc) as rn
    from l where coalesce(employee_name, '') <> ''
    group by k, employee_name
  ), elsewhere as (
    -- Seen at another UAE branch inside the same window.
    select public.stl_client_key(s.client_name) as k,
           string_agg(distinct s.branch, ', ' order by s.branch) as now_at, max(s.date) as now_last
    from sales_transaction_lines s
    where s.branch <> p_branch and s.branch in ('SAA', 'KCA', 'MC', 'AQ')
      and s.date >= current_date - p_days
      and nullif(trim(s.client_name), '') is not null
      and s.client_name !~* '^\s*walk[\s-]*in\M'
    group by 1
  ), r as (
    select c.client_name, c.visits, c.first_visit, c.last_visit,
           (current_date - c.last_visit) as days_since, c.spend,
           st.employee_name as stylist, cc.mobile, cc.landline, cc.match,
           e.now_at, e.now_last
    from c
    left join st on st.k = c.k and st.rn = 1
    left join client_contacts cc on cc.branch = p_branch and cc.client_key = c.k
    left join elsewhere e on e.k = c.k
    where c.visits >= p_min_visits
      and (p_max_visits is null or c.visits <= p_max_visits)
      and c.last_visit < current_date - p_days
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.spend desc), '[]'::jsonb) into out from r;
  return out;
end;
$function$;
revoke all on function public.lost_clients(text, int, int, int) from public, anon;
grant execute on function public.lost_clients(text, int, int, int) to authenticated;
