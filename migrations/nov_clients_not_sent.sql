-- nov_clients_not_sent.sql (5 Nov 2026, Kate: "bakit 120 na to, diba 1001 to nung una???? ... ayusin mo na").
-- After a blast went out, the Clients figure on its page (nov_blast_audience, from the hourly snapshot nov_blast_snap) still counted people who had already been sent it: 117 of the 120
-- "clients" of Hair to beauty were sent clients (91 delivered or read, 25 failed), only 3 were not sent yet. And Left out still said 1,001 "in" from the count of 4 Nov 15:37.
-- Now, read live, nothing is rebuilt and nothing is written:
--   nov_blast_audience     counts only clients with no November message queued, sending or sent (the same rule the Send button uses to drop "Already queued or sent in a November blast")
--   nov_blast_clients      the list behind that number, the same rule
--   nov_blast_leftout      the clients the left-out count of that time called "in" who have since been sent are reported as 'sent' instead; the rest stay 'in'
--   nov_blast_leftout_clients   reason 'sent' lists them, reason 'in' lists the ones not sent yet
-- Same guards and signatures as before, so an old copy of the page still works (it just shows the sent ones under "in").

create or replace function public.nov_blast_audience(p_recount boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' set statement_timeout to '60s' as $$
declare out jsonb; at timestamptz;
begin
  perform public.blast_plan_guard_read();
  if p_recount then perform public.blast_plan_guard(); end if;
  at := public.nov_blast_snap_refresh(p_recount);
  with sent as (select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f from public.nov_send_jobs j
                where not j.dry and not j.is_test and j.status in ('queued', 'sending', 'sent'))
  select jsonb_build_object('asof', (now() at time zone 'Asia/Dubai')::date, 'at', at,
    'blasts', coalesce(jsonb_object_agg(t.blast_id, jsonb_build_object('n', t.n, 'warm', t.warm, 'std', t.std,
              'SAA', t.saa, 'KCA', t.kca, 'MC', t.mc, 'AQ', t.aq, 'ext', t.ext, 'blonde', t.blonde, 'colour', t.colour, 'unchecked', t.unchecked, 'sent_already', t.sent_already)), '{}'::jsonb))
  into out
  from (select m.blast_id, count(*) filter (where not m.is_sent) as n, count(*) filter (where not m.is_sent and m.grp = 'warm') as warm, count(*) filter (where not m.is_sent and m.grp = 'std') as std,
               count(*) filter (where not m.is_sent and m.branch = 'SAA') as saa, count(*) filter (where not m.is_sent and m.branch = 'KCA') as kca,
               count(*) filter (where not m.is_sent and m.branch = 'MC') as mc, count(*) filter (where not m.is_sent and m.branch = 'AQ') as aq,
               count(*) filter (where not m.is_sent and m.ext) as ext, count(*) filter (where not m.is_sent and m.blonde) as blonde, count(*) filter (where not m.is_sent and m.colour) as colour,
               count(*) filter (where not m.is_sent and m.wa = 'unchecked') as unchecked, count(*) filter (where m.is_sent) as sent_already
        from (select x.*, (x.k in (select k from sent) or public.stl_key_fold(x.k) in (select f from sent)) as is_sent from public.nov_blast_snap x) m group by m.blast_id) t;
  return out;
end $$;

create or replace function public.nov_blast_clients(p_blast text default null, p_group text default null, p_branch text default null, p_flag text default null)
returns jsonb language plpgsql security definer set search_path to 'public' set statement_timeout to '60s' as $$
declare out jsonb;
begin
  perform public.blast_plan_guard();
  perform public.nov_blast_snap_refresh(false);
  with sent as (select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f from public.nov_send_jobs j
                where not j.dry and not j.is_test and j.status in ('queued', 'sending', 'sent')),
  m as (
    select * from public.nov_blast_snap x
    where (p_blast is null or x.blast_id = p_blast)
      and (p_group is null or p_group not in ('warm', 'std') or x.grp = p_group)
      and (p_branch is null or x.branch = p_branch)
      and (p_flag is null or (p_flag = 'colour' and x.colour) or (p_flag = 'ext' and x.ext) or (p_flag = 'blonde' and x.blonde))
      and not (x.k in (select k from sent) or public.stl_key_fold(x.k) in (select f from sent))
  ), shown as (select * from m order by last_visit desc, spend desc, client limit 3000)
  select jsonb_build_object('total', (select count(*) from m),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('c', client, 'b', branch, 'lv', last_visit, 's', round(spend, 2), 'g', grp, 'k', blast_id)
                                       order by last_visit desc, spend desc, client) from shown), '[]'::jsonb))
  into out;
  return out;
end $$;

create or replace function public.nov_blast_leftout(p_recount boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' set statement_timeout to '150s' as $$
declare t timestamptz;
begin
  perform public.blast_plan_guard_read();
  if p_recount then perform public.blast_plan_guard(); perform public.nov_blast_leftout_refresh(); end if;
  select m.at into t from public.nov_blast_leftout_meta m where m.id = 1;
  return jsonb_build_object('at', t, 'blasts', coalesce((
    with sent as (select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f from public.nov_send_jobs j
                  where not j.dry and not j.is_test and j.status in ('queued', 'sending', 'sent')),
    l0 as (select o.blast_id, case when o.reason = 'in' and (o.k in (select k from sent) or public.stl_key_fold(o.k) in (select f from sent)) then 'sent' else o.reason end as reason from public.nov_blast_leftout o)
    select jsonb_object_agg(x.b, x.r) from (select l.blast_id as b, jsonb_object_agg(l.reason, l.n) as r from (select blast_id, reason, count(*)::int as n from l0 group by 1, 2) l group by l.blast_id) x), '{}'::jsonb));
end $$;

create or replace function public.nov_blast_leftout_clients(p_blast text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' set statement_timeout to '60s' as $$
declare tot int; rws jsonb;
begin
  perform public.blast_plan_guard_read();
  with sent as (select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f from public.nov_send_jobs j
                where not j.dry and not j.is_test and j.status in ('queued', 'sending', 'sent')),
  l as (select o.*, (o.k in (select k from sent) or public.stl_key_fold(o.k) in (select f from sent)) as is_sent from public.nov_blast_leftout o where o.blast_id = p_blast),
  f as (select * from l where case when p_reason = 'sent' then l.reason = 'in' and l.is_sent when p_reason = 'in' then l.reason = 'in' and not l.is_sent else l.reason = p_reason end)
  select (select count(*) from f),
         coalesce((select jsonb_agg(jsonb_build_object('c', r.client, 'b', r.branch, 'lv', r.last_visit, 's', r.spend, 'k', r.blast_id) order by r.spend desc nulls last)
                   from (select * from f order by spend desc nulls last limit 500) r), '[]'::jsonb)
  into tot, rws;
  return jsonb_build_object('total', tot, 'rows', rws);
end $$;
