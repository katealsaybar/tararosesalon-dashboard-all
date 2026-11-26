-- QR short links and scan counts (Kate, 26 Nov 2026, from the meeting with David: "a QR code that goes to your own system first").
-- Page: qr/index.html (Tools > QR Code Maker, the Short code box). Redirect: supabase/functions/qr-go/index.ts.
--
-- HOW IT WORKS
--   A saved code can be a SHORT code: the picture holds https://go.trk-salon-os.com/<slug> (six letters/digits), not the real link.
--   A phone scans it, lands on qr-go, which looks the slug up here (qr_go), writes one row to qr_scans, and sends the phone on to qr_codes.value.
--   So the real link (qr_codes.value) can be changed any time without reprinting (qr_code_set_value), and every scan is counted per code
--   (and per stylist, through qr_codes.stylist). Codes saved before this stay as they were: short = false, the picture holds the link itself, no scans.
--   The scan log keeps only the time, the kind of phone (ios / android / desktop / other) and whether it looked like a bot. No IP, no name.
--
-- WHO
--   Same doors as before: Level 2 and above list and save; a code is changed or removed by whoever saved it, or Level 5.
--   qr_go is for the edge function only (service_role). Nobody signed in can call it from the browser.
--
-- Undo: drop function public.qr_go(text, text, boolean); drop function public.qr_code_set_value(uuid, text); drop function public.qr_code_set_stylist(uuid, text);
--       drop function public.qr_new_slug(); drop table public.qr_scans;
--       (then put qr_codes_list and qr_code_save back from qr_codes.sql, and alter table public.qr_codes drop column short, drop column slug, drop column stylist)

alter table public.qr_codes add column if not exists short   boolean not null default false;
alter table public.qr_codes add column if not exists slug    text;
alter table public.qr_codes add column if not exists stylist text not null default '';

alter table public.qr_codes drop constraint if exists qr_codes_slug_check;
alter table public.qr_codes add constraint qr_codes_slug_check check (slug is null or slug ~ '^[a-z0-9]{4,12}$');
alter table public.qr_codes drop constraint if exists qr_codes_short_slug_check;
alter table public.qr_codes add constraint qr_codes_short_slug_check check (not short or slug is not null);
alter table public.qr_codes drop constraint if exists qr_codes_stylist_check;
alter table public.qr_codes add constraint qr_codes_stylist_check check (char_length(stylist) <= 80);
create unique index if not exists qr_codes_slug_key on public.qr_codes (slug) where slug is not null;

create table if not exists public.qr_scans (
  id         bigint generated always as identity primary key,
  code_id    uuid not null references public.qr_codes(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  device     text not null default 'other' check (device in ('ios', 'android', 'desktop', 'other')),
  is_bot     boolean not null default false
);
create index if not exists qr_scans_code_idx on public.qr_scans (code_id, scanned_at desc);
alter table public.qr_scans enable row level security;
revoke all on public.qr_scans from public, anon, authenticated;

-- A free six-character slug. No 0 / o / 1 / l / i, so it can be read out loud or typed from a card.
create or replace function public.qr_new_slug() returns text
language plpgsql volatile set search_path = '' as $$
declare a constant text := 'abcdefghjkmnpqrstuvwxyz23456789'; s text; i int; n int := 0;
begin
  loop
    s := '';
    for i in 1..6 loop s := s || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from public.qr_codes q where q.slug = s);
    n := n + 1;
    if n > 20 then raise exception 'no free slug'; end if;
  end loop;
  return s;
end $$;
revoke all on function public.qr_new_slug() from public, anon, authenticated;

-- The list now also says which codes are short, their slug, stylist, and their scan counts (bots left out).
create or replace function public.qr_codes_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_lv int := coalesce(public.kb_level(), 0);
begin
  if v_lv < 2 then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('codes', coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'value', q.value, 'centre', q.centre, 'colour', q.colour, 'branch', q.branch,
                                        'short', q.short, 'slug', q.slug, 'stylist', q.stylist,
                                        'scans', coalesce(s.n, 0), 'scans_7d', coalesce(s.n7, 0), 'last_scan', s.last,
                                        'created_at', q.created_at, 'by', coalesce(nullif(q.by_name, ''), q.by_email),
                                        'mine', q.by_email = v_me, 'can_delete', (q.by_email = v_me or v_lv = 5))
                     order by q.created_at desc)
      from public.qr_codes q
      left join (select x.code_id,
                        count(*) filter (where not x.is_bot) as n,
                        count(*) filter (where not x.is_bot and x.scanned_at > now() - interval '7 days') as n7,
                        max(x.scanned_at) filter (where not x.is_bot) as last
                   from public.qr_scans x group by x.code_id) s on s.code_id = q.id), '[]'::jsonb));
end $$;

-- Save: three new arguments, all with defaults, so the old five-argument call from the old page still works.
-- p_short = true needs a web link (http or https). p_slug is the slug the page already drew into the picture; empty = the database picks one.
drop function if exists public.qr_code_save(text, text, text, text, text);
create or replace function public.qr_code_save(p_name text, p_value text, p_centre text, p_colour text, p_branch text default 'all',
                                               p_short boolean default false, p_slug text default null, p_stylist text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_row public.qr_codes; v_slug text := null;
begin
  if coalesce(public.kb_level(), 0) < 2 then return jsonb_build_object('denied', true); end if;
  if coalesce(p_short, false) then
    if trim(coalesce(p_value, '')) !~* '^https?://\S+$' then return jsonb_build_object('error', 'url'); end if;
    v_slug := lower(coalesce(nullif(trim(p_slug), ''), public.qr_new_slug()));
    if v_slug !~ '^[a-z0-9]{4,12}$' then return jsonb_build_object('error', 'slug'); end if;
  end if;
  begin
    insert into public.qr_codes (by_email, by_name, name, value, centre, colour, branch, short, slug, stylist)
    values (v_me, coalesce((select d.name from public.dashboard_users d where d.email = v_me), ''),
            left(trim(coalesce(nullif(trim(p_name), ''), p_value)), 120), trim(p_value), p_centre, p_colour, coalesce(nullif(p_branch, ''), 'all'),
            coalesce(p_short, false), v_slug, left(trim(coalesce(p_stylist, '')), 80))
    returning * into v_row;
  exception when unique_violation then
    return jsonb_build_object('error', 'slug');
  end;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'value', v_row.value, 'centre', v_row.centre, 'colour', v_row.colour, 'branch', v_row.branch,
                            'short', v_row.short, 'slug', v_row.slug, 'stylist', v_row.stylist, 'scans', 0, 'scans_7d', 0, 'last_scan', null,
                            'created_at', v_row.created_at, 'by', coalesce(nullif(v_row.by_name, ''), v_row.by_email), 'mine', true, 'can_delete', true);
end $$;
revoke all on function public.qr_code_save(text, text, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.qr_code_save(text, text, text, text, text, boolean, text, text) to authenticated;

-- Change where a short code goes. Only short codes (a direct code has its link inside the picture, so changing it would change the picture).
create or replace function public.qr_code_set_value(p_id uuid, p_value text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_value text := trim(coalesce(p_value, '')); v_n int;
begin
  if coalesce(public.kb_level(), 0) < 2 then return jsonb_build_object('denied', true); end if;
  if v_value !~* '^https?://\S+$' or char_length(v_value) > 1000 then return jsonb_build_object('error', 'url'); end if;
  update public.qr_codes q set value = v_value where q.id = p_id and q.short and (q.by_email = v_me or public.kb_level() = 5);
  get diagnostics v_n = row_count;
  return jsonb_build_object('updated', v_n, 'value', v_value);
end $$;
revoke all on function public.qr_code_set_value(uuid, text) from public, anon;
grant execute on function public.qr_code_set_value(uuid, text) to authenticated;

-- Which stylist or beautician a code is for (any code, short or not). Empty clears it.
create or replace function public.qr_code_set_stylist(p_id uuid, p_stylist text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_s text := left(trim(coalesce(p_stylist, '')), 80); v_n int;
begin
  if coalesce(public.kb_level(), 0) < 2 then return jsonb_build_object('denied', true); end if;
  update public.qr_codes q set stylist = v_s where q.id = p_id and (q.by_email = v_me or public.kb_level() = 5);
  get diagnostics v_n = row_count;
  return jsonb_build_object('updated', v_n, 'stylist', v_s);
end $$;
revoke all on function public.qr_code_set_stylist(uuid, text) from public, anon;
grant execute on function public.qr_code_set_stylist(uuid, text) to authenticated;

-- The edge function's one call: find the slug, write the scan, give back where to send the phone (null = unknown slug or not a web link).
create or replace function public.qr_go(p_slug text, p_device text default 'other', p_bot boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_value text;
begin
  select q.id, q.value into v_id, v_value from public.qr_codes q where q.slug = lower(trim(coalesce(p_slug, ''))) and q.short;
  if v_id is null or v_value !~* '^https?://' then return null; end if;
  -- A failed count must never stop the redirect: the printed card has to reach the real link even if the scan row cannot be written.
  begin
    insert into public.qr_scans (code_id, device, is_bot)
    values (v_id, case when p_device in ('ios', 'android', 'desktop') then p_device else 'other' end, coalesce(p_bot, false));
  exception when others then
    null;
  end;
  return v_value;
end $$;
revoke all on function public.qr_go(text, text, boolean) from public, anon, authenticated;
grant execute on function public.qr_go(text, text, boolean) to service_role;
