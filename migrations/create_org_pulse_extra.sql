-- Organisation Pulse "More measures" (Kate, 8 Oct 2026). The stylist page's "Holding your
-- level" card scores 19 measures; Organisation Pulse's benchmark strip carries 7 of them.
-- This adds the other 8 as an unscored card: Retention %, Request rate %, Conversion %,
-- Colour %, Reputation, Google reviews, Social posts (feed) and Social posts (workdays).
-- Request rate comes from the ledger the page already has; the rest come from here.
-- Already run live.
--
-- Retention and Conversion are cohort figures over a fixed 180-day look-back (perf_clients),
-- the same for any period on screen, and perf_clients takes about 6 s for the whole roster.
-- So they are worked out once a night into perf_client_cache and read from there.
create table if not exists public.perf_client_cache (
  staff_id     uuid primary key references perf_staff(id) on delete cascade,
  asof         date,
  conv_n       int not null default 0,   -- new clients in the cohort
  conv_back    int not null default 0,   -- of those, back within 12 weeks
  ret_n        int not null default 0,   -- existing clients seen in the earlier window
  ret_back     int not null default 0,   -- of those, back in the last 90 days
  refreshed_at timestamptz not null default now()
);
alter table public.perf_client_cache enable row level security;   -- read through org_pulse_extra only

create or replace function public.refresh_perf_client_cache() returns void
language plpgsql security definer set search_path = public as $$
declare s perf_staff; j jsonb; cn int; rn int;
begin
  for s in select * from perf_staff where active loop
    j  := perf_clients(s, current_date - 30, current_date);
    cn := coalesce((j->>'conversion_n')::int, 0);
    rn := coalesce((j->>'retention_n')::int, 0);
    insert into perf_client_cache (staff_id, asof, conv_n, conv_back, ret_n, ret_back, refreshed_at)
    values (s.id, (j->>'asof')::date, cn,
            cn - coalesce((j->'conversion_weeks'->>'not_yet')::int, 0),
            rn, round(coalesce((j->>'retention_pct')::numeric, 0) * rn / 100)::int, now())
    on conflict (staff_id) do update set asof = excluded.asof, conv_n = excluded.conv_n, conv_back = excluded.conv_back,
      ret_n = excluded.ret_n, ret_back = excluded.ret_back, refreshed_at = excluded.refreshed_at;
  end loop;
  delete from perf_client_cache where staff_id not in (select id from perf_staff where active);
end $$;
revoke all on function public.refresh_perf_client_cache() from public, anon, authenticated;

-- 21:30 Dubai, after the 21:00 Instagram read.
select cron.unschedule('perf-client-cache-nightly') where exists (select 1 from cron.job where jobname = 'perf-client-cache-nightly');
select cron.schedule('perf-client-cache-nightly', '30 17 * * *', $$ select public.refresh_perf_client_cache(); $$);

-- One call for a date window. Per person (active perf_staff, so Bahrain is not in it yet):
-- home branch, dept, the cached retention and conversion counts, colour and total visits in the
-- window, posts, and days worked with a post. Per branch: Google reviews in the window and the
-- 90-day count and star total. The page adds them up for the branches on screen, so a rate is
-- always total over total, never an average of averages. Same key check as perf_weeks.
create or replace function public.org_pulse_extra(p_admin uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d90 date := least(p_to, current_date) - 89;
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader','viewer')) then return null; end if;
  return (
    with st as (select * from perf_staff where active),
    visits as (
      select s.id, count(*) v, count(*) filter (where is_col) c
      from st s
      join lateral (
        select client_name, date, bool_or(perf_is_colour(item)) is_col
        from sales_transaction_lines
        where employee_name = s.phorest_name and date between p_from and p_to
          and client_name is not null and client_name <> ''
        group by client_name, date
      ) x on true
      group by s.id
    ),
    posts as (
      select s.id, count(distinct x.media_id) n
      from st s
      join lateral (
        select t.media_id, t.posted_at from ig_tagged_posts t where lower(t.username) = any(s.ig_handles)
        union all
        select c.media_id, c.posted_at from ig_collab_posts c where lower(c.username) = any(s.ig_handles)
      ) x on true
      where s.ig_handles is not null
        and (x.posted_at at time zone 'Asia/Dubai')::date between greatest(p_from, coalesce(s.started_on, p_from)) and p_to
      group by s.id
    ),
    wd as (
      select s.id, count(*) n
      from st s
      join lateral (
        select date from branch_staff_daily
        where upper(trim(staff_name)) = any(s.ledger_names) and dept = s.dept
          and date between p_from and p_to and coalesce(total, 0) > 0
        union
        select date from phorest_staff_daily
        where employee_name = s.phorest_name and not is_total
          and date between p_from and p_to and coalesce(visits, 0) > 0
      ) w on true
      where s.ig_handles is not null and w.date in (
        select (t.posted_at at time zone 'Asia/Dubai')::date from ig_tagged_posts t where lower(t.username) = any(s.ig_handles)
        union select (c.posted_at at time zone 'Asia/Dubai')::date from ig_collab_posts c where lower(c.username) = any(s.ig_handles)
        union select (m.mentioned_at at time zone 'Asia/Dubai')::date from ig_story_mentions m where lower(m.username) = any(s.ig_handles))
      group by s.id
    ),
    rv as (
      select case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA'
                  when g.branch like 'Motor%' then 'MC' when g.branch like 'Saadiyat%' then 'SAA' end b,
             count(*) filter (where g.review_date between p_from and p_to) n_window,
             count(*) filter (where g.review_date between d90 and least(p_to, current_date)) n90,
             coalesce(sum(g.stars) filter (where g.review_date between d90 and least(p_to, current_date)), 0) stars90
      from google_reviews g
      where g.review_date between least(p_from, d90) and p_to
      group by 1
    )
    select jsonb_build_object(
      'staff', (select coalesce(jsonb_agg(jsonb_build_object(
          'branch', s.branch, 'dept', s.dept,
          'conv_n', coalesce(c.conv_n, 0), 'conv_back', coalesce(c.conv_back, 0),
          'ret_n', coalesce(c.ret_n, 0), 'ret_back', coalesce(c.ret_back, 0),
          'visits', coalesce(v.v, 0), 'colour', coalesce(v.c, 0),
          'social_feed', coalesce(p.n, 0), 'social_workdays', coalesce(w.n, 0))), '[]'::jsonb)
        from st s left join perf_client_cache c on c.staff_id = s.id left join visits v on v.id = s.id
                  left join posts p on p.id = s.id left join wd w on w.id = s.id),
      'reviews', (select coalesce(jsonb_agg(jsonb_build_object('branch', b, 'n_window', n_window, 'n90', n90, 'stars90', stars90)), '[]'::jsonb) from rv where b is not null),
      'cache_asof', (select max(asof) from perf_client_cache)
    )
  );
end $$;
grant execute on function public.org_pulse_extra(uuid, date, date) to anon, authenticated;
