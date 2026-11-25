-- QR Code Maker saved codes (Kate, 25 Nov 2026). Page: qr/index.html (Tools > QR Code Maker).
-- A saved code is just its settings (the link or text, the centre, the colour); the picture is drawn again in the browser on every download, so nothing big is stored.
-- Everyone signed in at Level 2 or above sees the whole list (it is the team's shelf of codes). Anyone at Level 2 or above saves; a code is removed by the person who saved it or by Level 5.
-- The table answers to nobody directly (RLS on, every grant revoked); the three functions below are the only door.
-- Undo: drop function public.qr_codes_list(); drop function public.qr_code_save(text, text, text, text); drop function public.qr_code_delete(uuid); drop table public.qr_codes;

create table if not exists public.qr_codes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  by_email   text not null,
  by_name    text not null default '',
  name       text not null check (char_length(name) between 1 and 120),
  value      text not null check (char_length(value) between 1 and 1000),
  centre     text not null check (centre in ('salons', 'web', 'internal', 'none')),   -- Tara Rose Salons logo, tararosesalon.com, trk-salon-os.com, nothing
  colour     text not null check (colour ~ '^#[0-9A-Fa-f]{6}$')
);
alter table public.qr_codes enable row level security;
revoke all on public.qr_codes from public, anon, authenticated;

create or replace function public.qr_codes_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_lv int := coalesce(public.kb_level(), 0);
begin
  if v_lv < 2 then return jsonb_build_object('denied', true); end if;
  return jsonb_build_object('codes', coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'value', q.value, 'centre', q.centre, 'colour', q.colour,
                                        'created_at', q.created_at, 'by', coalesce(nullif(q.by_name, ''), q.by_email),
                                        'mine', q.by_email = v_me, 'can_delete', (q.by_email = v_me or v_lv = 5))
                     order by q.created_at desc)
      from public.qr_codes q), '[]'::jsonb));
end $$;

create or replace function public.qr_code_save(p_name text, p_value text, p_centre text, p_colour text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_row public.qr_codes;
begin
  if coalesce(public.kb_level(), 0) < 2 then return jsonb_build_object('denied', true); end if;
  insert into public.qr_codes (by_email, by_name, name, value, centre, colour)
  values (v_me, coalesce((select d.name from public.dashboard_users d where d.email = v_me), ''),
          left(trim(coalesce(nullif(trim(p_name), ''), p_value)), 120), trim(p_value), p_centre, p_colour)
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'name', v_row.name, 'value', v_row.value, 'centre', v_row.centre, 'colour', v_row.colour,
                            'created_at', v_row.created_at, 'by', coalesce(nullif(v_row.by_name, ''), v_row.by_email), 'mine', true);
end $$;

create or replace function public.qr_code_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me text := public.kb_me_email(); v_n int;
begin
  if coalesce(public.kb_level(), 0) < 2 then return jsonb_build_object('denied', true); end if;
  delete from public.qr_codes q where q.id = p_id and (q.by_email = v_me or public.kb_level() = 5);
  get diagnostics v_n = row_count;
  return jsonb_build_object('deleted', v_n);
end $$;

revoke all on function public.qr_codes_list() from public, anon;
revoke all on function public.qr_code_save(text, text, text, text) from public, anon;
revoke all on function public.qr_code_delete(uuid) from public, anon;
grant execute on function public.qr_codes_list() to authenticated;
grant execute on function public.qr_code_save(text, text, text, text) to authenticated;
grant execute on function public.qr_code_delete(uuid) to authenticated;
