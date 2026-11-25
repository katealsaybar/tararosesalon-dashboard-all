-- Site Traffic (Kate, 25 Nov 2026): who opens trk-salon-os.com, which pages, and for how long. Built from the local mockup docs/mockups/site-traffic.html in the cowork repo.
-- NOT APPLIED when this file was written: the page shows a plain note until it is, and the tracker (js/site-track.js) sends nothing that is kept (Kate's word first).
--
-- WHAT IS KEPT. One row per page opened (site_page_views): when, which page, the seconds it was open and on screen, phone or computer, where the visitor came from, and
-- who. A visit is the rows that share a visit_id (a new visit starts after 30 minutes of quiet, decided by the tracker). Nothing else: no IP address, no user agent text,
-- no phone, no email.
--   - Signed in (the team): aud 'T'. vid is a short hash of the login, so a person is one visitor; who is the name on dashboard_users, kept only for Level 6 to read.
--   - Not signed in (clients on a campaign page): aud 'C'. vid is a random id the browser made for itself, who stays empty. A signed-in team member opening a campaign page
--     counts as team, so staff previews never inflate the client numbers.
-- WHO MAY WRITE. Anyone, but only through site_track_open / site_track_time (security definer): the table has row level security on and no policy, so nobody reads or writes it
-- directly. The functions check every value (length, characters, device and source from a short list) and stop one visitor writing more than 300 rows an hour.
-- WHO MAY READ. Level 6 in the page, which is dashboard_users.level 5 in the database (the old numbering): site_traffic_summary and site_traffic_list raise for everyone else.
-- Days are Dubai days (UTC+4).

create table if not exists public.site_page_views (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null,
  seq int not null default 1 check (seq between 1 and 500),
  opened_at timestamptz not null default now(),
  aud text not null check (aud in ('T', 'C')),
  vid text not null check (length(vid) between 6 and 40),
  who text,
  device text not null default 'Computer' check (device in ('Phone', 'Computer')),
  src text not null default 'Direct' check (src in ('Direct', 'Instagram', 'WhatsApp', 'Google', 'Facebook', 'Other', 'Signed in')),
  path text not null check (length(path) between 1 and 200),
  page_name text not null check (length(page_name) between 1 and 80),
  seconds int not null default 0 check (seconds between 0 and 14400)
);
create index if not exists site_page_views_opened_idx on public.site_page_views (opened_at);
create index if not exists site_page_views_visit_idx on public.site_page_views (visit_id, seq);
create index if not exists site_page_views_vid_idx on public.site_page_views (vid, opened_at);
alter table public.site_page_views enable row level security;
revoke all on public.site_page_views from public, anon, authenticated;

-- 1. The tracker opens a page. Returns the row id (the tracker uses it to add seconds), or null when the values are not acceptable.
create or replace function public.site_track_open(
  p_visit uuid, p_seq int, p_vid text, p_path text, p_name text, p_dev text default 'Computer', p_src text default 'Direct')
returns uuid
language plpgsql volatile security definer
set search_path to ''
as $function$
declare uid uuid := auth.uid(); w text; a text; v text; dv text; sr text; new_id uuid;
begin
  if p_visit is null or p_path is null or p_name is null then return null; end if;
  if length(p_path) > 200 or length(p_name) > 80 or length(p_name) < 1 then return null; end if;
  if p_path !~ '^/[A-Za-z0-9_./?=&%+-]*$' then return null; end if;
  if uid is not null then
    select d.name into w from public.dashboard_users d
      join auth.users u on lower(u.email) = d.email
      where u.id = uid and u.email_confirmed_at is not null limit 1;
  end if;
  if w is not null then
    a := 'T'; v := 'p' || substr(md5(uid::text), 1, 10);
  else
    a := 'C'; v := regexp_replace(lower(coalesce(p_vid, '')), '[^a-z0-9]', '', 'g');
    if length(v) < 8 then return null; end if;
    v := 'a' || left(v, 20);
  end if;
  dv := case when p_dev = 'Phone' then 'Phone' else 'Computer' end;
  sr := case when a = 'T' then 'Signed in' when p_src in ('Direct', 'Instagram', 'WhatsApp', 'Google', 'Facebook', 'Other') then p_src else 'Direct' end;
  if (select count(*) from public.site_page_views x where x.vid = v and x.opened_at > now() - interval '1 hour') >= 300 then return null; end if;
  insert into public.site_page_views (visit_id, seq, aud, vid, who, device, src, path, page_name)
    values (p_visit, greatest(1, least(coalesce(p_seq, 1), 500)), a, v, w, dv, sr, p_path, p_name)
    returning id into new_id;
  return new_id;
end $function$;
revoke all on function public.site_track_open(uuid, int, text, text, text, text, text) from public;
grant execute on function public.site_track_open(uuid, int, text, text, text, text, text) to anon, authenticated;

-- 2. The tracker adds the seconds a page has been open and on screen. The number only ever goes up, and only for a row opened in the last 5 hours.
create or replace function public.site_track_time(p_id uuid, p_seconds int)
returns void
language plpgsql volatile security definer
set search_path to ''
as $function$
begin
  update public.site_page_views
     set seconds = greatest(seconds, least(greatest(coalesce(p_seconds, 0), 0), 14400))
   where id = p_id and opened_at > now() - interval '5 hours';
end $function$;
revoke all on function public.site_track_time(uuid, int) from public;
grant execute on function public.site_track_time(uuid, int) to anon, authenticated;

-- 3. The page: totals, days, pages, people, where from and device for a window, in one call. Level 6 only.
-- p_aud null = everyone, 'T' = team, 'C' = clients.
create or replace function public.site_traffic_summary(p_from date, p_to date, p_aud text default null)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb; v_f timestamptz; v_t timestamptz;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Site Traffic is for Level 6 only';
  end if;
  v_f := p_from::timestamp at time zone 'Asia/Dubai';
  v_t := (p_to + 1)::timestamp at time zone 'Asia/Dubai';
  with pv as materialized (
    select * from site_page_views where opened_at >= v_f and opened_at < v_t and (p_aud is null or aud = p_aud)
  ), vis as materialized (
    select visit_id, min(aud) as aud, min(vid) as vid, min(opened_at) as t, count(*)::int as pages, coalesce(sum(seconds), 0)::int as dur,
           (array_agg(path order by seq, opened_at))[1] as first_path, min(device) as device, min(src) as src
    from pv group by visit_id
  ), q as (
    select *, (aud = 'C' and pages = 1 and dur < 10) as quick from vis
  )
  select jsonb_build_object(
    'tot', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select aud, count(*)::int as visits, count(distinct vid)::int as visitors, sum(pages)::int as views, sum(dur)::int as secs, count(*) filter (where quick)::int as quick
        from q group by aud) x), '[]'::jsonb),
    'days', coalesce((select jsonb_agg(to_jsonb(x) order by x.d) from (
        select (t at time zone 'Asia/Dubai')::date as d, aud, count(*)::int as visits, sum(dur)::int as secs from q group by 1, 2) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select p.path, min(p.page_name) as name, p.aud, count(*)::int as views, count(distinct p.vid)::int as visitors, coalesce(sum(p.seconds), 0)::int as secs,
               (select count(*)::int from q where q.first_path = p.path and q.aud = p.aud) as entries
        from pv p group by p.path, p.aud order by count(*) desc limit 500) x), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select vid, min(who) as name, count(*)::int as visits, sum(pages)::int as pages, sum(dur)::int as secs, max(t) as last
        from q where aud = 'T' group by vid order by count(*) desc limit 500) x), '[]'::jsonb),
    'src', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select src as k, aud, count(*)::int as visits, count(distinct vid)::int as visitors, sum(dur)::int as secs, count(*) filter (where quick)::int as quick
        from q group by src, aud order by count(*) desc) x), '[]'::jsonb),
    'dev', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select device as k, aud, count(*)::int as visits, count(distinct vid)::int as visitors, sum(dur)::int as secs, count(*) filter (where quick)::int as quick
        from q group by device, aud order by count(*) desc) x), '[]'::jsonb),
    'first_day', (select (min(opened_at) at time zone 'Asia/Dubai')::date from site_page_views)
  ) into out;
  return out;
end $function$;
revoke all on function public.site_traffic_summary(date, date, text) from public, anon;
grant execute on function public.site_traffic_summary(date, date, text) to authenticated;

-- 4. The lists behind every figure. Same filters as the summary, so a list always adds up to the figure that opened it. Level 6 only (it carries names).
--   p_kind 'visits'  one row per visit      'views'  one row per page opened      'people'  one row per visitor      'visit'  the pages of one visit (p_visit)
--   p_vid one visitor; p_paths pages (a visit or a view counts when it opened one of them); p_src, p_dev, p_quick (client visits that left within 10 seconds on one page);
--   p_entry the page a visit began on; p_sort 'time' puts the longest first, anything else the newest.
create or replace function public.site_traffic_list(
  p_kind text, p_from date, p_to date, p_aud text default null, p_vid text default null, p_paths text[] default null, p_src text default null,
  p_dev text default null, p_quick boolean default false, p_entry text default null, p_visit uuid default null, p_sort text default null, p_limit int default 500)
returns jsonb
language plpgsql stable
set search_path to 'public'
set statement_timeout to '30s'
as $function$
declare out jsonb; v_f timestamptz; v_t timestamptz; lim int := greatest(1, least(coalesce(p_limit, 500), 2000));
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then
    raise exception 'Site Traffic is for Level 6 only';
  end if;
  if p_kind = 'visit' then
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.seq, x.t) from (
          select id, seq, opened_at as t, who, vid, aud, path, page_name, seconds, device, src from site_page_views where visit_id = p_visit) x), '[]'::jsonb)
    ) into out;
    return out;
  end if;
  v_f := p_from::timestamp at time zone 'Asia/Dubai';
  v_t := (p_to + 1)::timestamp at time zone 'Asia/Dubai';
  with pv as materialized (
    select * from site_page_views
    where opened_at >= v_f and opened_at < v_t and (p_aud is null or aud = p_aud) and (p_vid is null or vid = p_vid)
  ), vis as materialized (
    select visit_id, min(aud) as aud, min(vid) as vid, min(who) as who, min(opened_at) as t, count(*)::int as pages, coalesce(sum(seconds), 0)::int as dur,
           (array_agg(path order by seq, opened_at))[1] as first_path, min(device) as device, min(src) as src
    from pv group by visit_id
  ), visf as materialized (
    select v.* from vis v
    where (p_src is null or v.src = p_src) and (p_dev is null or v.device = p_dev)
      and (not coalesce(p_quick, false) or (v.aud = 'C' and v.pages = 1 and v.dur < 10))
      and (p_entry is null or v.first_path = p_entry)
      and (p_paths is null or exists (select 1 from pv x where x.visit_id = v.visit_id and x.path = any(p_paths)))
  ), pvf as materialized (
    select x.* from pv x join visf v on v.visit_id = x.visit_id where (p_paths is null or x.path = any(p_paths))
  )
  select case p_kind
    when 'visits' then jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
          select visit_id, t, who, vid, aud, pages, dur, device, src from visf
          order by case when p_sort = 'time' then dur end desc nulls last, t desc limit lim) x), '[]'::jsonb),
      'total', (select count(*)::int from visf), 'pages', (select coalesce(sum(pages), 0)::int from visf),
      'secs', (select coalesce(sum(dur), 0)::int from visf), 'people', (select count(distinct vid)::int from visf))
    when 'views' then jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
          select id, visit_id, opened_at as t, who, vid, aud, path, page_name, seconds from pvf
          order by case when p_sort = 'time' then seconds end desc nulls last, opened_at desc limit lim) x), '[]'::jsonb),
      'total', (select count(*)::int from pvf), 'secs', (select coalesce(sum(seconds), 0)::int from pvf), 'people', (select count(distinct vid)::int from pvf))
    when 'people' then jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(x)) from (
          select p.vid, min(p.who) as who, min(p.aud) as aud, count(distinct p.visit_id)::int as visits, count(*)::int as pages, coalesce(sum(p.seconds), 0)::int as secs, max(p.opened_at) as last
          from pvf p group by p.vid order by count(distinct p.visit_id) desc, max(p.opened_at) desc limit lim) x), '[]'::jsonb),
      'total', (select count(distinct vid)::int from pvf), 'visits', (select count(distinct visit_id)::int from pvf))
    else jsonb_build_object('rows', '[]'::jsonb, 'total', 0)
  end into out;
  return out;
end $function$;
revoke all on function public.site_traffic_list(text, date, date, text, text, text[], text, text, boolean, text, uuid, text, int) from public, anon;
grant execute on function public.site_traffic_list(text, date, date, text, text, text[], text, text, boolean, text, uuid, text, int) to authenticated;
