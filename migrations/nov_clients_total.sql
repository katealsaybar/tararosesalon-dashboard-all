-- nov_clients_total.sql (5 Nov 2026, Kate: "eh bat 3 nlng ha", "eto 0 huhu", "anong ginawa mooooo"). Replaces the audience and clients functions of nov_clients_not_sent.sql.
-- That migration made Clients count only the people not sent yet, so Hair to beauty fell from 1,001 to 3 and Beauty to hair showed 0: the number looked like the blast had shrunk.
-- Clients is the size of the blast again: the clients already messaged in this blast (one per client, read from the send jobs, whatever came of the message) plus the clients in the
-- audience who have no November message yet. The page says how many of each: "1,000 sent, 3 not sent yet". Branch counts add up the same way; warm and standard, colour, extensions and
-- the WhatsApp check only know the ones not sent yet (one message for everyone now, so nothing on the page splits by them). The list behind the number is the same set, the sent clients
-- with the last visit and spend of the count of 4 Nov where that count has them. Read only, same signatures and guards.

create or replace function public.nov_blast_audience(p_recount boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' set statement_timeout to '60s' as $$
declare out jsonb; at timestamptz;
begin
  perform public.blast_plan_guard_read();
  if p_recount then perform public.blast_plan_guard(); end if;
  at := public.nov_blast_snap_refresh(p_recount);
  with sent as (select distinct j.client_key as k, public.stl_key_fold(j.client_key) as f from public.nov_send_jobs j
                where not j.dry and not j.is_test and j.status in ('queued', 'sending', 'sent')),
  sh as (select distinct on (j.blast_id, public.stl_key_fold(j.client_key)) j.blast_id, j.branch from public.nov_send_jobs j
         where not j.dry and not j.is_test and (j.status in ('queued', 'sending', 'sent') or j.retried_at is not null) order by j.blast_id, public.stl_key_fold(j.client_key), j.id),
  mem as (select x.*, (x.k in (select k from sent) or public.stl_key_fold(x.k) in (select f from sent)) as is_sent from public.nov_blast_snap x),
  u as (select m.blast_id, count(*) filter (where not m.is_sent) as n, count(*) filter (where not m.is_sent and m.grp = 'warm') as warm, count(*) filter (where not m.is_sent and m.grp = 'std') as std,
               count(*) filter (where not m.is_sent and m.branch = 'SAA') as saa, count(*) filter (where not m.is_sent and m.branch = 'KCA') as kca,
               count(*) filter (where not m.is_sent and m.branch = 'MC') as mc, count(*) filter (where not m.is_sent and m.branch = 'AQ') as aq,
               count(*) filter (where not m.is_sent and m.ext) as ext, count(*) filter (where not m.is_sent and m.blonde) as blonde, count(*) filter (where not m.is_sent and m.colour) as colour,
               count(*) filter (where not m.is_sent and m.wa = 'unchecked') as unchecked from mem m group by m.blast_id),
  h as (select s.blast_id, count(*) as n, count(*) filter (where s.branch = 'SAA') as saa, count(*) filter (where s.branch = 'KCA') as kca,
               count(*) filter (where s.branch = 'MC') as mc, count(*) filter (where s.branch = 'AQ') as aq from sh s group by s.blast_id),
  t as (select coalesce(u.blast_id, h.blast_id) as blast_id, coalesce(u.n, 0) + coalesce(h.n, 0) as n, coalesce(u.n, 0) as unsent, coalesce(h.n, 0) as sent_here,
               coalesce(u.warm, 0) as warm, coalesce(u.std, 0) as std, coalesce(u.saa, 0) + coalesce(h.saa, 0) as saa, coalesce(u.kca, 0) + coalesce(h.kca, 0) as kca,
               coalesce(u.mc, 0) + coalesce(h.mc, 0) as mc, coalesce(u.aq, 0) + coalesce(h.aq, 0) as aq, coalesce(u.ext, 0) as ext, coalesce(u.blonde, 0) as blonde,
               coalesce(u.colour, 0) as colour, coalesce(u.unchecked, 0) as unchecked from u full join h on h.blast_id = u.blast_id)
  select jsonb_build_object('asof', (now() at time zone 'Asia/Dubai')::date, 'at', at,
    'blasts', coalesce(jsonb_object_agg(t.blast_id, jsonb_build_object('n', t.n, 'unsent', t.unsent, 'sent_here', t.sent_here, 'warm', t.warm, 'std', t.std,
              'SAA', t.saa, 'KCA', t.kca, 'MC', t.mc, 'AQ', t.aq, 'ext', t.ext, 'blonde', t.blonde, 'colour', t.colour, 'unchecked', t.unchecked)), '{}'::jsonb))
  into out from t;
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
  un as (
    select x.client, x.branch, x.last_visit, x.spend, x.grp, x.blast_id from public.nov_blast_snap x
    where (p_blast is null or x.blast_id = p_blast)
      and (p_group is null or p_group not in ('warm', 'std') or x.grp = p_group)
      and (p_branch is null or x.branch = p_branch)
      and (p_flag is null or (p_flag = 'colour' and x.colour) or (p_flag = 'ext' and x.ext) or (p_flag = 'blonde' and x.blonde))
      and not (x.k in (select k from sent) or public.stl_key_fold(x.k) in (select f from sent))),
  lo as (select o.blast_id, public.stl_key_fold(o.k) as f, max(o.last_visit) as last_visit, max(o.spend) as spend from public.nov_blast_leftout o where o.reason = 'in' group by 1, 2),
  sh as (
    select distinct on (j.blast_id, public.stl_key_fold(j.client_key)) j.blast_id, initcap(coalesce(nullif(j.client_name, ''), j.client_key)) as client, j.branch, lo.last_visit, lo.spend
    from public.nov_send_jobs j left join lo on lo.blast_id = j.blast_id and lo.f = public.stl_key_fold(j.client_key)
    where not j.dry and not j.is_test and (j.status in ('queued', 'sending', 'sent') or j.retried_at is not null)
      and (p_blast is null or j.blast_id = p_blast) and p_group is null and p_flag is null and (p_branch is null or j.branch = p_branch)
    order by j.blast_id, public.stl_key_fold(j.client_key), j.id),
  m as (select client, branch, last_visit, spend, grp, blast_id from un union all select client, branch, last_visit, spend, null::text, blast_id from sh),
  shown as (select * from m order by last_visit desc nulls last, spend desc nulls last, client limit 3000)
  select jsonb_build_object('total', (select count(*) from m),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('c', client, 'b', branch, 'lv', last_visit, 's', round(spend, 2), 'g', grp, 'k', blast_id)
                                       order by last_visit desc nulls last, spend desc nulls last, client) from shown), '[]'::jsonb))
  into out;
  return out;
end $$;
