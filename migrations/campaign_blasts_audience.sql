-- Campaign Blasts, live client numbers (Kate, 30 Oct 2026: "client numbers should be clickable, and always updated").
--
-- Until now the counts on the page (1,065 and so on) were typed into blast_plan_items from the 27 Oct plan. These functions work them out from the
-- till every time the page opens, with the audience rules in docs/CAMPAIGN-BLAST-TEMPLATES-OCT-NOV-2026.md, and give the clients behind each number.
--
--   blast_plan_members(p_asof)             one row per client per blast: who is in it, read from sales_transaction_lines (internal, not granted)
--   blast_plan_audience(p_asof)            counts: for each blast, how many, warm and standard
--   blast_plan_clients(blast, group, asof) the clients behind one number (names), newest visit first
--
-- Rules (UAE branches SAA, KCA, MC, AQ; Walk-in and staff names left out; "net" is the line's net, "visit" is a day with a line):
--   everyone   last visit within 6 months, spent something this year, not marked Do not contact or opted out (lost_optout_map), and not already sent a
--              Lost Client Blasts message (lost_messaged, lost_send_jobs sent) or Wellness Voucher blast 3 or 4 (wv_send_jobs, wv_last_jobs sent)
--   blonde-1   a foils, balayage or bleach service in the last 12 months, no extension service, spent AED 2,000 or more this year
--   blonde-2   same service rule, spent AED 1,000 to 1,999
--   extensions an extension service (tape, rings, bonds, weft, removal or refit, not lashes or nails) in the last 12 months, spent AED 2,000 or more
--   junior-1   a blow-dry, root colour, toner or treatment in the last 12 months, no blonde service, no extensions, spent AED 1,000 or more, two or more visits
--   junior-1b  the junior-1 clients with two or more blow-dry days (cut and blow-dry counts) in the last 12 months (they are also in junior-1).
--              Two, not three: two gives 234 on 27 Oct, the 232 the plan was checked on; three gives 121 (Kate, 30 Oct 2026)
--   junior-2a  a blow-dry (not cut and blow-dry) in the last 12 months, no blonde, no extensions, spent under AED 1,000
--   junior-2b  the rest of that group: a blow-dry, root colour, toner or treatment in the last 12 months but no plain blow-dry day (cut and blow-dry only counts here), no blonde, no extensions, spent under AED 1,000
--   mette-b    a nail service and no blow-dry in the last 12 months, and in none of the blasts above
--   warm       last visit within 90 days; standard: 91 days to 6 months
--
-- Names, so signed in and old Level 3 or 5 only (blast_plan_guard). Read only. p_asof defaults to today in Dubai (counts days up to yesterday).

create or replace function public.blast_plan_members(p_asof date default null)
returns table (blast_id text, k text, client text, branch text, last_visit date, spend numeric, visits int, grp text)
language plpgsql stable security definer
set search_path = public
set statement_timeout = '45s'
as $$
declare
  asof  date := coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date);
  y0    date := date_trunc('year', coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date))::date;
  m12   date := (coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date) - interval '12 months')::date;
  m6    date := (coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date) - interval '6 months')::date;
  d90   date := coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date) - 90;
begin
  perform public.blast_plan_guard();
  return query
  with src as materialized (
    select l.client_name, l.branch, l.date, l.net, coalesce(l.item, '') as item0
    from sales_transaction_lines l
    where l.date >= least(y0, m12) and l.date < asof
      and l.branch in ('SAA', 'KCA', 'MC', 'AQ')
      and coalesce(trim(l.client_name), '') <> ''
  ), nm as materialized (            -- the name rules and the key are worked out once per name, not once per line (25 s became a few)
    select x.cn as client_name, public.stl_key_fold(x.cn) as k
    from (select distinct s.client_name as cn from src s) x
    where x.cn !~* '^\s*walk[\s-]*in\M' and x.cn !~* '\mstaff\M'
  ), it as materialized (            -- and the service rules once per item name
    select x.i as item0, lower(x.i) as item,
           public.stl_item_kind(x.i) in ('service', 'prepaid') as svc,
           lower(x.i) ~ '(foil|balayage|bleach|blonde me detox|blonde package|r-(2|two) w)' as f_light,
           (lower(x.i) ~ '(hair extension|ext\. removal|extension removal|rings ext|bonds ext|weft ext|tape ext|tape-?in|nano|beaded|fusion)' and lower(x.i) !~ '(nail|lash)') as f_ext,
           (lower(x.i) ~ '(blow ?dry|root|toner|treatment)' and lower(x.i) !~ '(callus|paraffin|nail|foot|facial|eye|lash|brow)') as f_maint,
           (lower(x.i) ~ '(root|toner|treatment)' and lower(x.i) !~ '(callus|paraffin|nail|foot|facial|eye|lash|brow)') as f_rtt,
           (lower(x.i) ~ 'blow ?dry' and lower(x.i) !~ 'cut') as f_bd,
           (lower(x.i) ~ 'blow ?dry') as f_bdall,
           (lower(x.i) ~ '(nail|manicure|pedicure|polish|biab|gelish|overlay)' and lower(x.i) !~ 'extension removal') as f_nail
    from (select distinct s.item0 as i from src s) x
  ), ln as (
    select nm.k, s.client_name, s.branch, s.date, s.net, it.svc, it.f_light, it.f_ext, it.f_maint, it.f_rtt, it.f_bd, it.f_bdall, it.f_nail
    from src s join nm on nm.client_name = s.client_name join it on it.item0 = s.item0
  ), cd as materialized (            -- one row per client per day
    select ln.k, ln.date, min(ln.client_name) as client_name, max(ln.branch) as branch, sum(ln.net) as net,
           bool_or(ln.svc and ln.f_light) as f_light, bool_or(ln.svc and ln.f_ext) as f_ext, bool_or(ln.svc and ln.f_maint) as f_maint,
           bool_or(ln.svc and ln.f_rtt) as f_rtt, bool_or(ln.svc and ln.f_bd) as f_bd, bool_or(ln.svc and ln.f_bdall) as f_bdall, bool_or(ln.svc and ln.f_nail) as f_nail
    from ln group by ln.k, ln.date
  ), cl as (
    select cd.k, min(cd.client_name) as client, (array_agg(cd.branch order by cd.date desc))[1] as branch,
           max(cd.date) filter (where cd.date >= m12) as last_visit,
           coalesce(sum(cd.net) filter (where cd.date >= y0), 0) as spend,
           (count(*) filter (where cd.date >= y0))::int as visits,
           coalesce(bool_or(cd.date >= m12 and cd.f_light), false) as light,
           coalesce(bool_or(cd.date >= m12 and cd.f_ext), false) as ext,
           coalesce(bool_or(cd.date >= m12 and cd.f_maint), false) as maint,
           coalesce(bool_or(cd.date >= m12 and cd.f_rtt), false) as rtt,
           (count(*) filter (where cd.date >= m12 and cd.f_bd))::int as bd_days,
           (count(*) filter (where cd.date >= m12 and cd.f_bdall))::int as bd_all,
           coalesce(bool_or(cd.date >= m12 and cd.f_nail), false) as nails
    from cd group by cd.k
  ), done as (
    select public.stl_key_fold(x.client_key) as k from lost_messaged x
    union select public.stl_key_fold(x.client_key) from lost_send_jobs x where x.status = 'sent' and not x.is_test
    union select public.stl_key_fold(d) from lost_send_jobs x, unnest(coalesce(x.dup_keys, '{}'::text[])) d where x.status = 'sent' and not x.is_test
    union select public.stl_key_fold(x.client_key) from wv_send_jobs x where x.status = 'sent'
    union select public.stl_key_fold(x.client_key) from wv_last_jobs x where x.status = 'sent' and not x.is_test
  ), oo as (
    select o.k from public.lost_optout_map() o
  ), base as (
    select c.* from cl c
    where c.last_visit >= m6 and c.spend > 0
      and not exists (select 1 from done d where d.k = c.k)
      and not exists (select 1 from oo o where o.k = c.k)
  ), seg as (
    select 'blonde-1' as bid, b.* from base b where b.light and not b.ext and b.spend >= 2000
    union all select 'blonde-2', b.* from base b where b.light and not b.ext and b.spend >= 1000 and b.spend < 2000
    union all select 'extensions', b.* from base b where b.ext and b.spend >= 2000
    union all select 'junior-1', b.* from base b where b.maint and not b.light and not b.ext and b.spend >= 1000 and b.visits >= 2
    union all select 'junior-1b', b.* from base b where b.maint and not b.light and not b.ext and b.spend >= 1000 and b.visits >= 2 and b.bd_all >= 2
    union all select 'junior-2a', b.* from base b where b.bd_days >= 1 and not b.light and not b.ext and b.spend < 1000
    union all select 'junior-2b', b.* from base b where b.maint and b.bd_days = 0 and not b.light and not b.ext and b.spend < 1000
  )
  select s.bid, s.k, s.client, s.branch, s.last_visit, s.spend, s.visits, case when s.last_visit >= d90 then 'warm' else 'std' end
  from seg s
  union all
  select 'mette-b', b.k, b.client, b.branch, b.last_visit, b.spend, b.visits, case when b.last_visit >= d90 then 'warm' else 'std' end
  from base b
  where b.nails and b.bd_days = 0
    and not exists (select 1 from seg s where s.k = b.k and s.bid in ('blonde-1', 'blonde-2', 'extensions', 'junior-1', 'junior-2a', 'junior-2b'));
end $$;

create or replace function public.blast_plan_audience(p_asof date default null) returns jsonb
language plpgsql stable security definer
set search_path = public
set statement_timeout = '45s'
as $$
declare out jsonb;
begin
  perform public.blast_plan_guard();
  select jsonb_build_object(
    'asof', coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date),
    'blasts', coalesce(jsonb_object_agg(t.blast_id, jsonb_build_object('n', t.n, 'warm', t.warm, 'std', t.std)), '{}'::jsonb))
  into out
  from (select m.blast_id, count(*) as n, count(*) filter (where m.grp = 'warm') as warm, count(*) filter (where m.grp = 'std') as std
        from public.blast_plan_members(p_asof) m group by m.blast_id) t;
  return out;
end $$;

create or replace function public.blast_plan_clients(p_blast text, p_group text default null, p_asof date default null) returns jsonb
language plpgsql stable security definer
set search_path = public
set statement_timeout = '45s'
as $$
declare out jsonb;
begin
  perform public.blast_plan_guard();
  with m as (
    select * from public.blast_plan_members(p_asof) x
    where x.blast_id = p_blast and (p_group is null or p_group not in ('warm', 'std') or x.grp = p_group)
  ), shown as (select * from m order by last_visit desc, spend desc, client limit 3000)
  select jsonb_build_object(
    'total', (select count(*) from m),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('c', client, 'b', branch, 'lv', last_visit, 's', round(spend, 2), 'v', visits, 'g', grp)
                                       order by last_visit desc, spend desc, client) from shown), '[]'::jsonb))
  into out;
  return out;
end $$;

revoke all on function public.blast_plan_members(date), public.blast_plan_audience(date), public.blast_plan_clients(text, text, date) from public, anon, authenticated;
grant execute on function public.blast_plan_audience(date), public.blast_plan_clients(text, text, date) to authenticated;
