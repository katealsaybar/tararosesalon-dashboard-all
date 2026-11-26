-- QR Scans page: keep our own scans out of the client numbers (Kate, 26 Nov 2026, from the local mockup docs/mockups/qr-scans.html).
-- Page: js/qr-scans.js (Tools > QR Scans). Builds on migrations/qr_short_links.sql (qr_scans, qr_go).
--
-- WHY
--   The scan log keeps no name and no IP, so the page cannot tell a staff scan from a client's. Three ways to keep ours out:
--     1. Test mode: a person starts a 15 minute window; qr_go marks every scan that lands inside it (mark = 'win', win_id = the window).
--     2. That was me: the person who saved a code, or Level 5, marks one scan as theirs (mark = 'hand'). Not me clears it.
--     3. Count from: one date (qr_settings.count_from, Level 5 sets it); scans before it are left out of the client numbers.
--   A scan is counted as a client only when it is not a bot, has no mark, and is on or after count_from. The page works that out; the rows stay.
--
-- WHO
--   Level 2 and above (UI Level 3) read the scans and start or stop their own test mode. Marking: whoever saved the code, or Level 5.
--   Count from: Level 5. Nothing here is open to the browser except through these functions; the tables are closed.
--
-- Undo: drop function public.qr_scans_list(timestamptz, timestamptz), public.qr_scan_mark(bigint, boolean), public.qr_test_start(), public.qr_test_stop(),
--       public.qr_count_from_set(date); drop table public.qr_test_windows, public.qr_settings;
--       alter table public.qr_scans drop column mark, drop column marked_by, drop column win_id;  then put qr_go back from qr_short_links.sql.

alter table public.qr_scans add column if not exists mark      text check (mark is null or mark in ('win', 'hand'));
alter table public.qr_scans add column if not exists marked_by text;
alter table public.qr_scans add column if not exists win_id    bigint;

create table if not exists public.qr_test_windows (
  id        bigint generated always as identity primary key,
  by_email  text not null,
  by_name   text not null default '',
  starts_at timestamptz not null default now(),
  ends_at   timestamptz not null
);
create index if not exists qr_test_windows_time_idx on public.qr_test_windows (starts_at, ends_at);
alter table public.qr_test_windows enable row level security;
revoke all on public.qr_test_windows from public, anon, authenticated;

create table if not exists public.qr_settings (key text primary key, value text not null);
alter table public.qr_settings enable row level security;
revoke all on public.qr_settings from public, anon, authenticated;
-- Counting starts the day after this was set up, so the check scans made while building it never count. Level 5 changes it on the page.
insert into public.qr_settings (key, value) values ('count_from', '2026-11-27') on conflict (key) do nothing;

-- qr_go: same as before, and a scan that lands inside any person's test window is marked as a test.
create or replace function public.qr_go(p_slug text, p_device text default 'other', p_bot boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_value text; v_win bigint;
begin
  select q.id, q.value into v_id, v_value from public.qr_codes q where q.slug = lower(trim(coalesce(p_slug, ''))) and q.short;
  if v_id is null or v_value !~* '^https?://' then return null; end if;
  -- A failed count must never stop the redirect: the printed card has to reach the real link even if the scan row cannot be written.
  begin
    select w.id into v_win from public.qr_test_windows w where now() >= w.starts_at and now() < w.ends_at order by w.id desc limit 1;
    insert into public.qr_scans (code_id, device, is_bot, mark, win_id)
    values (v_id, case when p_device in ('ios', 'android', 'desktop') then p_device else 'other' end, coalesce(p_bot, false),
            case when v_win is not null then 'win' end, v_win);
  exception when others then
    null;
  end;
  return v_value;
end $$;
revoke all on function public.qr_go(text, text, boolean) from public, anon, authenticated;
grant execute on function public.qr_go(text, text, boolean) to service_role;

-- Everything the page needs for a window of time (both ends optional): the short codes, the scans, the test windows, my open test mode, count from.
create or replace function public.qr_scans_list(p_from timestamptz default null, p_to timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_lv int := coalesce(public.kb_level(), 0); v_cap constant int := 30000; v_n int;
begin
  if v_lv < 2 then return jsonb_build_object('denied', true); end if;
  select count(*) into v_n from public.qr_scans s where (p_from is null or s.scanned_at >= p_from) and (p_to is null or s.scanned_at < p_to);
  return jsonb_build_object(
    'count_from', (select value from public.qr_settings where key = 'count_from'),
    'level5', v_lv = 5,
    'truncated', v_n > v_cap,
    'codes', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'slug', q.slug, 'branch', q.branch, 'stylist', q.stylist,
                                                           'value', q.value, 'can_mark', (q.by_email = v_me or v_lv = 5)) order by q.name)
                         from public.qr_codes q where q.short), '[]'::jsonb),
    'scans', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'code_id', x.code_id, 't', x.scanned_at, 'device', x.device, 'bot', x.is_bot,
                                                          'mark', x.mark, 'by', x.marked_by, 'win', x.win_id) order by x.scanned_at desc)
                         from (select * from public.qr_scans s where (p_from is null or s.scanned_at >= p_from) and (p_to is null or s.scanned_at < p_to)
                               order by s.scanned_at desc limit v_cap) x), '[]'::jsonb),
    'windows', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'by', coalesce(nullif(w.by_name, ''), w.by_email), 'from', w.starts_at, 'to', w.ends_at,
                                                             'n', (select count(*) from public.qr_scans s where s.win_id = w.id), 'mine', w.by_email = v_me) order by w.id desc)
                           from (select * from public.qr_test_windows order by id desc limit 30) w), '[]'::jsonb),
    'active', (select jsonb_build_object('id', w.id, 'to', w.ends_at) from public.qr_test_windows w
               where w.by_email = v_me and now() >= w.starts_at and now() < w.ends_at order by w.id desc limit 1));
end $$;
revoke all on function public.qr_scans_list(timestamptz, timestamptz) from public, anon;
grant execute on function public.qr_scans_list(timestamptz, timestamptz) to authenticated;

-- That was me / Not me. Not a bot (a bot is already left out). Whoever saved the code, or Level 5.
create or replace function public.qr_scan_mark(p_id bigint, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_n int; v_name text;
begin
  if coalesce(public.kb_level(), 0) < 2 then return jsonb_build_object('denied', true); end if;
  select coalesce(nullif(d.name, ''), v_me) into v_name from public.dashboard_users d where d.email = v_me;
  update public.qr_scans s set mark = case when p_on then 'hand' end, marked_by = case when p_on then coalesce(v_name, v_me) end, win_id = case when p_on then s.win_id end
   from public.qr_codes q
   where s.id = p_id and q.id = s.code_id and not s.is_bot and (q.by_email = v_me or public.kb_level() = 5);
  get diagnostics v_n = row_count;
  return jsonb_build_object('updated', v_n);
end $$;
revoke all on function public.qr_scan_mark(bigint, boolean) from public, anon;
grant execute on function public.qr_scan_mark(bigint, boolean) to authenticated;

-- Test mode: 15 minutes from now, one open window per person.
create or replace function public.qr_test_start() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_name text; v_row public.qr_test_windows;
begin
  if coalesce(public.kb_level(), 0) < 2 then return jsonb_build_object('denied', true); end if;
  select coalesce(d.name, '') into v_name from public.dashboard_users d where d.email = v_me;
  update public.qr_test_windows w set ends_at = now() where w.by_email = v_me and w.ends_at > now();
  insert into public.qr_test_windows (by_email, by_name, starts_at, ends_at) values (v_me, coalesce(v_name, ''), now(), now() + interval '15 minutes') returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'to', v_row.ends_at);
end $$;
revoke all on function public.qr_test_start() from public, anon;
grant execute on function public.qr_test_start() to authenticated;

create or replace function public.qr_test_stop() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_n int;
begin
  if coalesce(public.kb_level(), 0) < 2 then return jsonb_build_object('denied', true); end if;
  update public.qr_test_windows w set ends_at = now() where w.by_email = v_me and w.ends_at > now();
  get diagnostics v_n = row_count;
  return jsonb_build_object('stopped', v_n);
end $$;
revoke all on function public.qr_test_stop() from public, anon;
grant execute on function public.qr_test_stop() to authenticated;

-- Count from: the first day that counts. Level 5 only.
create or replace function public.qr_count_from_set(p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.kb_level(), 0) < 5 then return jsonb_build_object('denied', true); end if;
  if p_date is null then return jsonb_build_object('error', 'date'); end if;
  insert into public.qr_settings (key, value) values ('count_from', to_char(p_date, 'YYYY-MM-DD')) on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('count_from', to_char(p_date, 'YYYY-MM-DD'));
end $$;
revoke all on function public.qr_count_from_set(date) from public, anon;
grant execute on function public.qr_count_from_set(date) to authenticated;
