-- The Podium Race's other stats on a stylist's own link (Kate, 23 Oct 2026: "i need the staff links to show the podium
-- race's other stats"). perf_podium_me already answers the one board (services plus retail). This answers every board in
-- one call, so the page can hop between them with no wait: she opens Podium Race and sees her place on each stat, taps
-- one and reads that whole board.
--
-- Same rules as perf_podium_me: it takes her token, her own team only (hair with hair, beauty with beauty), people on the
-- active performance list, podium_overrides hide/left applied on the full name, one month. The returned rows carry a name,
-- a branch, a rank and one figure; no ids, tokens, emails or ledger keys. Behind the same sign-in lock (perf_lock_ok).
--
-- Where the figures come from: perf_core, the function her This month page already reads, so a number here is the number
-- there. (Called for one team, about 200 ms for the 36 on hair.) 'sales' is perf_podium_me's own board, passed through,
-- so the Podium tab and the payslip email can never disagree with it.
--   services    total_revenue (services before VAT, Phorest Staff Daily)
--   retail      retail before VAT
--   treatments  treatment sales, hair only (the ledger's figure; beauty has no treatments)
--   rebooking   Phorest's rebooking %, only for people with 20 or more tracked visits in the month (a 3-visit month of
--               100% is not a win); people under it are left off, as the Podium Race ranks them after the rest
--   ncr         new client requests (ledger)
--   reviews     Google reviews that name her (perf_core's rule, the one Staff Benchmarks and This month show)
--   posts       Instagram posts and Reels that tag the salon with her (people with no handle on file are left off)
--   clients     Phorest visits she looked after
-- Anyone at 0, or with no figure, is not ranked and not counted.
create or replace function public.perf_podium_stats_me(p_token uuid, p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s perf_staff;
  base jsonb;
  m1 date;
  m2 date;
  out jsonb;
begin
  if not public.perf_lock_ok(p_token) then raise exception 'sign_in_required'; end if;
  select * into s from perf_staff where token = p_token and active;
  if s.id is null then return null; end if;

  base := public.perf_podium_me(p_token, p_month);
  m1 := (base->>'month')::date;
  m2 := (m1 + interval '1 month' - interval '1 day')::date;

  with who as (
    select p.* from perf_staff p
     where p.active and p.dept = s.dept
       and not exists (select 1 from podium_overrides o
                        where o.kind in ('hide', 'left')
                          and o.name_key in (upper(regexp_replace(p.display_name, '[^A-Za-z ]', '', 'g')),
                                             upper(regexp_replace(p.phorest_name, '[^A-Za-z ]', '', 'g'))))
  ), nums as materialized (   -- once per person: left to inline, perf_core ran once per figure read below (3 s instead of 0.5 s)
    select w.id, w.display_name nm, w.branch br, public.perf_core(w, m1, m2) n from who w
  ), vals as (
    select x.id, x.nm, x.br, v.k, v.v
      from nums x, lateral (values
        ('services',   (x.n->>'total_revenue')::numeric),
        ('retail',     (x.n->>'retail')::numeric),
        ('treatments', case when s.dept = 'Hair' then (x.n->>'treatments')::numeric end),
        ('rebooking',  case when coalesce((x.n->'phorest'->>'rebook_visits')::numeric, 0) >= 20
                            then (x.n->'phorest'->>'rebooking_pct')::numeric end),
        ('ncr',        (x.n->>'ncr')::numeric),
        ('reviews',    (x.n->>'google_reviews')::numeric),
        ('posts',      (x.n->>'social_feed')::numeric),
        ('clients',    (x.n->'phorest'->>'clients')::numeric)
      ) v(k, v)
  ), ranked as (
    select r.*, rank() over (partition by r.k order by round(r.v, case when r.k = 'rebooking' then 1 else 0 end) desc) rk
      from vals r where r.v > 0
  ), per as (
    select k,
           count(*) ranked,
           (select jsonb_build_object('rank', m.rk, 'value', round(m.v, case when m.k = 'rebooking' then 1 else 0 end))
              from ranked m where m.k = r.k and m.id = s.id) me,
           jsonb_agg(jsonb_build_object('rank', r.rk, 'name', r.nm, 'branch', r.br,
                                        'value', round(r.v, case when r.k = 'rebooking' then 1 else 0 end), 'me', r.id = s.id)
                     order by r.rk, r.nm) board
      from ranked r group by k
  )
  select jsonb_build_object(
    'month', base->'month', 'to', base->'to', 'dept', base->'dept',
    'stats',
      coalesce((select jsonb_object_agg(per.k, jsonb_build_object('ranked', per.ranked, 'me', per.me, 'board', per.board)) from per), '{}'::jsonb)
      || jsonb_build_object('sales', jsonb_build_object(
           'ranked', base->'ranked',
           'me', case when base->'me' is null or base->'me' = 'null'::jsonb then null
                      else jsonb_build_object('rank', base->'me'->'rank', 'value', base->'me'->'amount') end,
           'board', coalesce((select jsonb_agg(jsonb_build_object('rank', e->'rank', 'name', e->'name', 'branch', e->'branch',
                                                                  'value', e->'amount', 'me', e->'me') order by o)
                                from jsonb_array_elements(base->'board') with ordinality t(e, o)), '[]'::jsonb))))
    into out;
  return out;
end $$;
revoke all on function public.perf_podium_stats_me(uuid, date) from public;
grant execute on function public.perf_podium_stats_me(uuid, date) to anon, authenticated;
