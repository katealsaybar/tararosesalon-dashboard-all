-- November Blasts (Kate, 2 Nov 2026): the database blasts for November, planned from the 2 Nov Zoom with Coach Emma. One page, ?view=novblasts.
-- Who sees what is the same as Campaign Blasts: old Levels 3 and 5 edit (blast_plan_guard); a person whose dashboard_users.extra_pages holds
-- 'campaignblasts' may read the plan and the counts (blast_plan_guard_read) but gets no client names, no decisions and no Approve.
-- Every table is closed to the browser (RLS on, no policies); the page reads and writes only through the functions below. Nothing here sends
-- a message: it is the plan, the decisions and Coach Emma's review. Kate launches from respond.io or the Lost Clients send panel.
--
-- The content (message drafts, who-gets-it wording, the seven decisions) is NOT in this file. The repo is public, so it was loaded straight into
-- nov_blast_items on 2 Nov 2026 and stays out of the repo (the cowork repo holds docs/NOV-2026-BLAST-SEED.sql). Shape of nov_blast_items.data:
--   blasts  (id D, A, B, C, E):  { title, short, date, time, who, brand:[good|bad, text], terms, arms, gold, footer, versions:{v1,v2}, msg }
--   decisions (id dec1 to dec7): { q, why, o:[[label, description, suggested 0 or 1], ...] }
--
-- Counts come from the till (nov_blast_members), kept in a snapshot (nov_blast_snap) that is rebuilt when it is more than 60 minutes old, or when an
-- editor taps Count again, because counting takes about 18 seconds. Rules, UAE branches SAA KCA MC AQ, walk-in and staff names left out:
--   active   last visit within 183 days (the rule the October lost list used) and spent something this year, with a valid mobile
--   left out opted out (lost_optout_map rules, inline), blocked, or marked Do not contact; already sent a Lost Clients or Wellness Voucher blast 3 or 4
--            by name; any number a Lost or WV message went to (even under another name); anyone we wrote to on WhatsApp since 9 Oct 2026
--   D smoothing  blow-dry or cut and blow-dry in the last 12 months, no keratin in the last 12 months
--   B beauty to hair  a beauty or nail service, never a hair service
--   C Junior  blow-dry, root, toner or treatment in the last 12 months, no blonde service, no extensions
--   A hair to beauty  hair services only, never beauty or nails, Motor City out (no beauty or nail team there)
--   one blast per client, in this order: D, B, C, A. E (newly due) is last visit 17 Apr 2026 to 183 days ago, nothing booked: never in A to D.
--   warm = last visit within 90 days, standard = older. E is always standard.
-- Not covered: Wellness Voucher blasts 1 and 2 (Aug 2026), their recipients live in GoHighLevel only.

create table if not exists public.nov_blast_items (
  id   text primary key,
  sort int  not null default 0,
  data jsonb not null
);
create table if not exists public.nov_blast_decisions (
  idx  int primary key,
  pick int,
  by   text,
  at   timestamptz not null default now()
);
create table if not exists public.nov_blast_review (
  blast_id  text primary key references public.nov_blast_items (id) on delete cascade,
  review    text not null default 'none' check (review in ('none', 'ok', 'changes')),
  review_by text,
  review_at timestamptz
);
create table if not exists public.nov_blast_snap (
  blast_id text not null, k text not null, client text, branch text, last_visit date, spend numeric, grp text,
  ext boolean, blonde boolean, colour boolean,
  primary key (blast_id, k)
);
create table if not exists public.nov_blast_snap_meta (id int primary key, at timestamptz not null);
alter table public.nov_blast_snap      enable row level security;
alter table public.nov_blast_snap_meta enable row level security;
revoke all on public.nov_blast_snap, public.nov_blast_snap_meta from anon, authenticated;
alter table public.nov_blast_items     enable row level security;
alter table public.nov_blast_decisions enable row level security;
alter table public.nov_blast_review    enable row level security;
revoke all on public.nov_blast_items, public.nov_blast_decisions, public.nov_blast_review from anon, authenticated;

-- ── the clients in each blast (names, so internal: wrappers below check the level) ─────────────────────────────
create or replace function public.nov_blast_members(p_asof date default null)
returns table (blast_id text, k text, client text, branch text, last_visit date, spend numeric, grp text, ext boolean, blonde boolean, colour boolean)
language plpgsql stable security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  asof    date := coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date);
  y0      date := date_trunc('year', coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date))::date;
  m12     date := (coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date) - interval '12 months')::date;
  m6      date := coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date) - 183;
  d90     date := coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date) - 90;
  newfrom date := date '2026-04-17';
  since   timestamptz := timestamptz '2026-10-09';
begin
  return query
  with src as materialized (
    select l.client_name as cn, coalesce(l.item, '') as item, max(l.date) as maxd,
           sum(l.net) filter (where l.date >= y0) as net_y, (array_agg(l.branch order by l.date desc))[1] as br
    from sales_transaction_lines l
    where l.branch in ('SAA', 'KCA', 'MC', 'AQ') and l.date < asof
      and coalesce(trim(l.client_name), '') <> '' and l.client_name !~* '^\s*walk[\s-]*in\M' and l.client_name !~* '\mstaff\M'
    group by 1, 2
  ), cls as materialized (select * from public.item_classes((select array_agg(distinct s.item) from src s))),
  ln as (
    select public.stl_key_fold(s.cn) as k, s.cn, s.maxd, s.net_y, s.br, c.family, c.category, lower(s.item) as li
    from src s join cls c on c.item = s.item where c.kind = 'service'
  ), cl as materialized (
    select ln.k, (array_agg(ln.cn order by length(ln.cn), ln.cn))[1] as cn, max(ln.maxd) as last_visit,
      (array_agg(ln.br order by ln.maxd desc))[1] as branch, coalesce(sum(ln.net_y), 0) as spend_y,
      bool_or(ln.family in ('colour', 'cut', 'extensions', 'treat')) as hair_ever,
      bool_or(ln.family in ('beauty', 'nails')) as beauty_ever,
      max(ln.maxd) filter (where ln.category = 'KERATIN') as keratin_last,
      max(ln.maxd) filter (where ln.li ~ 'blow ?dry') as bd_last,
      max(ln.maxd) filter (where ln.category in ('BALAYAGE', 'BLEACHING', 'COLOURING', 'HIGHLIGHTS', 'TONING')) as colour_last,
      max(ln.maxd) filter (where ln.li ~ '(foil|balayage|bleach|blonde me detox|blonde package|r-(2|two) w)') as light_last,
      max(ln.maxd) filter (where (ln.li ~ '(hair extension|ext\. removal|extension removal|rings ext|bonds ext|weft ext|tape ext|tape-?in|nano|beaded|fusion)' and ln.li !~ '(nail|lash)')) as ext_last,
      max(ln.maxd) filter (where (ln.li ~ '(blow ?dry|root|toner|treatment)' and ln.li !~ '(callus|paraffin|nail|foot|facial|eye|lash|brow)')) as maint_last
    from ln group by ln.k
  ), ph as (
    select public.stl_key_fold(c.client_key) as k, btrim(x) as phone
    from client_contacts c, unnest(string_to_array(c.mobile, ' / ')) x
    where coalesce(c.mobile, '') <> '' and btrim(x) ~ '^\+\d{9,15}$'
  ), phk as (select distinct ph.k from ph),
  oo as (
    select ph.k from ph join lost_send_optout o on o.phone = ph.phone
    union select ph.k from ph join lost_wa_status w on w.phone = ph.phone and (w.opted_out or w.is_blocked)
    union select public.stl_key_fold(e.client_key) from lost_excluded e where e.reason = 'Do not contact'
  ), done as (
    select public.stl_key_fold(x.client_key) as k from lost_messaged x
    union select public.stl_key_fold(x.client_key) from lost_send_jobs x where x.status = 'sent' and not x.is_test
    union select public.stl_key_fold(d) from lost_send_jobs x, unnest(coalesce(x.dup_keys, '{}'::text[])) d where x.status = 'sent' and not x.is_test
    union select public.stl_key_fold(x.client_key) from wv_send_jobs x where x.status = 'sent'
    union select public.stl_key_fold(x.client_key) from wv_last_jobs x where x.status = 'sent' and not x.is_test
    -- by phone number: a number a Lost or WV message went to, even under another name
    union select ph.k from ph where exists (select 1 from lost_send_jobs j where j.phone = ph.phone and j.status = 'sent' and not j.is_test)
        or exists (select 1 from wv_send_jobs j where j.phone = ph.phone) or exists (select 1 from wv_last_jobs j where j.phone = ph.phone and not j.is_test)
    -- anyone we wrote to on WhatsApp since 9 Oct: hand messages, chats in progress, sends under another key
    union select ph.k from ph join lost_wa_status w on w.phone = ph.phone where w.last_out >= since
  ), bk as (select distinct public.stl_key_fold(b.client_key) as k from client_bookings b where b.date >= asof),
  e as (
    select cl.* from cl join phk on phk.k = cl.k
    where not exists (select 1 from oo where oo.k = cl.k) and not exists (select 1 from done where done.k = cl.k)
  ), s as (
    select e.*,
      coalesce(e.hair_ever and not e.beauty_ever and e.branch <> 'MC' and e.last_visit >= m6 and e.spend_y > 0, false) as sa,
      coalesce(e.beauty_ever and not e.hair_ever and e.last_visit >= m6 and e.spend_y > 0, false) as sb,
      coalesce(e.last_visit >= m6 and e.spend_y > 0 and e.maint_last >= m12 and (e.light_last is null or e.light_last < m12) and (e.ext_last is null or e.ext_last < m12), false) as sc,
      coalesce(e.last_visit >= m6 and e.spend_y > 0 and e.bd_last >= m12 and (e.keratin_last is null or e.keratin_last < m12), false) as sd,
      (e.last_visit >= newfrom and e.last_visit < m6 and not exists (select 1 from bk where bk.k = e.k)) as newlost
    from e
  )
  select (case when s.sd then 'D' when s.sb then 'B' when s.sc then 'C' else 'A' end)::text, s.k, s.cn, s.branch, s.last_visit, s.spend_y,
         (case when s.last_visit >= d90 then 'warm' else 'std' end)::text,
         coalesce(s.ext_last >= m12, false), coalesce(s.light_last >= m12, false), coalesce(s.colour_last >= m12, false)
  from s where s.sa or s.sb or s.sc or s.sd
  union all
  select 'E'::text, s.k, s.cn, s.branch, s.last_visit, s.spend_y, 'std'::text,
         coalesce(s.ext_last >= m12, false), coalesce(s.light_last >= m12, false), coalesce(s.colour_last >= m12, false)
  from s where s.newlost;
end $$;

-- ── the snapshot: rebuilt when older than 60 minutes (or on demand), one rebuild at a time ────────────────────
create or replace function public.nov_blast_snap_refresh(p_force boolean default false) returns timestamptz
language plpgsql security definer set search_path = public set statement_timeout = '60s' as $$
declare t timestamptz;
begin
  select m.at into t from public.nov_blast_snap_meta m where m.id = 1;
  if not p_force and t is not null and t > now() - interval '60 minutes' then return t; end if;
  if not pg_try_advisory_xact_lock(727001) then return t; end if;   -- someone else is counting: use what is there
  delete from public.nov_blast_snap;
  insert into public.nov_blast_snap select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour from public.nov_blast_members() m;
  insert into public.nov_blast_snap_meta (id, at) values (1, now()) on conflict (id) do update set at = excluded.at;
  return now();
end $$;

-- ── the counts only (no names), so the numbers fill in for a commenter too ─────────────────────────────────────
create or replace function public.nov_blast_audience(p_recount boolean default false) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '60s' as $$
declare out jsonb; at timestamptz;
begin
  perform public.blast_plan_guard_read();
  if p_recount then perform public.blast_plan_guard(); end if;
  at := public.nov_blast_snap_refresh(p_recount);
  select jsonb_build_object('asof', (now() at time zone 'Asia/Dubai')::date, 'at', at,
    'blasts', coalesce(jsonb_object_agg(t.blast_id, jsonb_build_object('n', t.n, 'warm', t.warm, 'std', t.std,
              'SAA', t.saa, 'KCA', t.kca, 'MC', t.mc, 'AQ', t.aq, 'ext', t.ext, 'blonde', t.blonde, 'colour', t.colour)), '{}'::jsonb))
  into out
  from (select m.blast_id, count(*) as n, count(*) filter (where m.grp = 'warm') as warm, count(*) filter (where m.grp = 'std') as std,
               count(*) filter (where m.branch = 'SAA') as saa, count(*) filter (where m.branch = 'KCA') as kca,
               count(*) filter (where m.branch = 'MC') as mc, count(*) filter (where m.branch = 'AQ') as aq,
               count(*) filter (where m.ext) as ext, count(*) filter (where m.blonde) as blonde, count(*) filter (where m.colour) as colour
        from public.nov_blast_snap m group by m.blast_id) t;
  return out;
end $$;

-- ── the clients behind a number: names, so old Levels 3 and 5 only ─────────────────────────────────────────────
-- p_blast null = every blast; p_group warm or std; p_branch SAA, KCA, MC or AQ; p_flag colour (E colour clients), ext or blonde (the smoothing exceptions)
create or replace function public.nov_blast_clients(p_blast text default null, p_group text default null, p_branch text default null, p_flag text default null) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '60s' as $$
declare out jsonb;
begin
  perform public.blast_plan_guard();
  perform public.nov_blast_snap_refresh(false);
  with m as (
    select * from public.nov_blast_snap x
    where (p_blast is null or x.blast_id = p_blast)
      and (p_group is null or p_group not in ('warm', 'std') or x.grp = p_group)
      and (p_branch is null or x.branch = p_branch)
      and (p_flag is null or (p_flag = 'colour' and x.colour) or (p_flag = 'ext' and x.ext) or (p_flag = 'blonde' and x.blonde))
  ), shown as (select * from m order by last_visit desc, spend desc, client limit 3000)
  select jsonb_build_object('total', (select count(*) from m),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('c', client, 'b', branch, 'lv', last_visit, 's', round(spend, 2), 'g', grp, 'k', blast_id)
                                       order by last_visit desc, spend desc, client) from shown), '[]'::jsonb))
  into out;
  return out;
end $$;

-- ── read: the blasts, the seven decisions and the review ───────────────────────────────────────────────────────
create or replace function public.nov_blast_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := public.blast_plan_guard_read();
begin
  return jsonb_build_object(
    'me', who,
    'editor', coalesce((select m.level in (3, 5) from public.dashboard_me() m limit 1), false),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'data', i.data,
                 'review', coalesce(r.review, 'none'), 'review_by', r.review_by, 'review_at', r.review_at) order by i.sort, i.id)
               from public.nov_blast_items i left join public.nov_blast_review r on r.blast_id = i.id), '[]'::jsonb),
    'decisions', coalesce((select jsonb_agg(jsonb_build_object('idx', d.idx, 'pick', d.pick, 'by', d.by, 'at', d.at) order by d.idx)
               from public.nov_blast_decisions d), '[]'::jsonb));
end $$;

create or replace function public.nov_blast_decide(p_idx int, p_pick int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.blast_plan_guard();
begin
  if p_idx is null or p_idx < 1 or p_idx > 20 then raise exception 'Unknown decision'; end if;
  if p_pick is null then delete from public.nov_blast_decisions where idx = p_idx;
  else
    insert into public.nov_blast_decisions (idx, pick, by, at) values (p_idx, p_pick, who, now())
    on conflict (idx) do update set pick = excluded.pick, by = excluded.by, at = excluded.at;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.nov_blast_review(p_id text, p_review text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := public.blast_plan_guard();
begin
  if p_review not in ('none', 'ok', 'changes') then raise exception 'Unknown review'; end if;
  if not exists (select 1 from public.nov_blast_items where id = p_id) then raise exception 'Unknown blast'; end if;
  insert into public.nov_blast_review (blast_id, review, review_by, review_at) values (p_id, p_review, who, now())
  on conflict (blast_id) do update set review = excluded.review, review_by = excluded.review_by, review_at = excluded.review_at;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.nov_blast_members(date), public.nov_blast_snap_refresh(boolean), public.nov_blast_audience(boolean), public.nov_blast_clients(text, text, text, text),
  public.nov_blast_get(), public.nov_blast_decide(int, int), public.nov_blast_review(text, text) from public, anon, authenticated;
grant execute on function public.nov_blast_audience(boolean), public.nov_blast_clients(text, text, text, text), public.nov_blast_get(),
  public.nov_blast_decide(int, int), public.nov_blast_review(text, text) to authenticated;
