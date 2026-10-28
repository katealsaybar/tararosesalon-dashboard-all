-- Client to Staff Matching (Kate, 28 Oct 2026): who does what, the checklist Belle keeps, with a history that can be restored.
-- Applied live 28 Oct 2026 (migration "client_matching"). Pages: hub/find-stylist.html and hub/matching.html, script hub/matching.js.
-- Everyone who may open the Team Home section 'client-matching' reads it (Level 1 Front Desk, Levels 2, 3 and 5; Level 4 does not,
-- see kb_client_matching.sql). Only the people in matching_editors (Belle and Kate) change it, and only through these functions, never
-- through the tables (no table policies, no table grants). The history is append-only: a restore is one more entry, nothing is deleted.
-- Not in this public file: the editors' emails and the starting list of stylists and ticks (loaded live from Belle's sheet).

create table if not exists public.matching_editors (
  email text primary key check (email = lower(trim(email))),
  name  text not null
);
create table if not exists public.matching_stylists (
  name      text primary key,
  branch    text not null check (branch in ('SAA','KCA','MC','AQ')),
  level     text not null check (level in ('SD','SS','S','JS')),
  ticks     text not null check (ticks ~ '^[01]{41}$'),   -- one character per column on the page: services, style, vibe
  gone      boolean not null default false,
  added     boolean not null default false,
  card_slug text not null default '',
  photo_file text not null default '',
  sort      int not null default 0
);
create table if not exists public.matching_history (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  who       text not null,
  who_email text not null,
  type      text not null check (type in ('seed','tick','add','remove','restore','revert')),
  name      text,
  col       int,
  on_       boolean,
  branch    text,
  level     text,
  ticks     text,
  label     text,
  snap      jsonb
);
alter table public.matching_editors  enable row level security;
alter table public.matching_stylists enable row level security;
alter table public.matching_history  enable row level security;
revoke all on public.matching_editors, public.matching_stylists, public.matching_history from anon, authenticated;
revoke all on sequence public.matching_history_id_seq from anon, authenticated;

create or replace function public.matching_is_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matching_editors e where e.email = lower(public.kb_me_email()))
$$;

create or replace function public.matching_who() returns text
language sql stable security definer set search_path = '' as $$
  select (select e.name from public.matching_editors e where e.email = lower(public.kb_me_email()))
$$;

-- Read: the checklist. Editors also get the stylists who were taken off it.
create or replace function public.matching_get() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ed boolean := public.matching_is_editor();
begin
  if not public.kb_can_read('client-matching') then raise exception 'This is not open to your account'; end if;
  return jsonb_build_object(
    'editor', ed,
    'stylists', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort) from public.matching_stylists s where ed or not s.gone), '[]'::jsonb),
    'last', (select jsonb_build_object('who', h.who, 'ts', (extract(epoch from h.at) * 1000)::bigint)
               from public.matching_history h where h.type <> 'seed' order by h.id desc limit 1));
end $$;

-- Read: every change, oldest first (editors only).
create or replace function public.matching_history() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.matching_is_editor() then raise exception 'Only Belle and Kate can see the history'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'ts', (extract(epoch from h.at) * 1000)::bigint, 'who', h.who, 'type', h.type,
           'name', h.name, 'col', h.col, 'on', h.on_, 'branch', h.branch, 'level', h.level, 'ticks', h.ticks, 'label', h.label, 'snap', h.snap) order by h.id)
         from public.matching_history h), '[]'::jsonb);
end $$;

create or replace function public.matching_tick(p_name text, p_col int, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_who text := public.matching_who(); v text := case when p_on then '1' else '0' end;
begin
  if v_who is null then raise exception 'Only Belle and Kate can change this'; end if;
  if p_col is null or p_col < 0 or p_col > 40 then raise exception 'No such column'; end if;
  if not exists (select 1 from public.matching_stylists where name = p_name) then raise exception 'No such stylist'; end if;
  update public.matching_stylists set ticks = overlay(ticks placing v from p_col + 1 for 1)
   where name = p_name and substr(ticks, p_col + 1, 1) <> v;
  if found then
    insert into public.matching_history (who, who_email, type, name, col, on_) values (v_who, lower(public.kb_me_email()), 'tick', p_name, p_col, p_on);
  end if;
end $$;

create or replace function public.matching_add(p_name text, p_branch text, p_level text, p_ticks text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_who text := public.matching_who(); n text := trim(p_name); t text := coalesce(p_ticks, repeat('0', 41));
begin
  if v_who is null then raise exception 'Only Belle and Kate can change this'; end if;
  if n is null or length(n) < 1 or length(n) > 40 then raise exception 'Type her name first'; end if;
  if exists (select 1 from public.matching_stylists where lower(name) = lower(n) and not gone) then raise exception '% is already on the checklist', n; end if;
  if exists (select 1 from public.matching_stylists where lower(name) = lower(n) and gone) then raise exception '% was removed earlier. Put her back from the history.', n; end if;
  insert into public.matching_stylists (name, branch, level, ticks, added, sort)
    values (n, p_branch, p_level, t, true, coalesce((select max(sort) from public.matching_stylists), 0) + 1);
  insert into public.matching_history (who, who_email, type, name, branch, level, ticks) values (v_who, lower(public.kb_me_email()), 'add', n, p_branch, p_level, t);
end $$;

create or replace function public.matching_remove(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_who text := public.matching_who();
begin
  if v_who is null then raise exception 'Only Belle and Kate can change this'; end if;
  update public.matching_stylists set gone = true where name = p_name and not gone;
  if found then insert into public.matching_history (who, who_email, type, name) values (v_who, lower(public.kb_me_email()), 'remove', p_name); end if;
end $$;

create or replace function public.matching_restore(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_who text := public.matching_who();
begin
  if v_who is null then raise exception 'Only Belle and Kate can change this'; end if;
  update public.matching_stylists set gone = false where name = p_name and gone;
  if found then insert into public.matching_history (who, who_email, type, name) values (v_who, lower(public.kb_me_email()), 'restore', p_name); end if;
end $$;

-- Restore an old version: the checklist becomes that snapshot, and that is one more entry in the history.
create or replace function public.matching_revert(p_label text, p_snap jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_who text := public.matching_who();
begin
  if v_who is null then raise exception 'Only Belle and Kate can change this'; end if;
  if jsonb_typeof(p_snap) <> 'array' or jsonb_array_length(p_snap) = 0 then raise exception 'Nothing to restore'; end if;
  delete from public.matching_stylists where true;
  insert into public.matching_stylists (name, branch, level, ticks, gone, added, card_slug, photo_file, sort)
    select x.name, x.branch, x.level, x.ticks, coalesce(x.gone, false), coalesce(x.added, false), coalesce(x.card_slug, ''), coalesce(x.photo_file, ''), coalesce(x.sort, 0)
      from jsonb_to_recordset(p_snap) as x(name text, branch text, level text, ticks text, gone boolean, added boolean, card_slug text, photo_file text, sort int);
  insert into public.matching_history (who, who_email, type, label, snap) values (v_who, lower(public.kb_me_email()), 'revert', left(coalesce(p_label, ''), 80), p_snap);
end $$;

revoke all on function public.matching_is_editor(), public.matching_who(), public.matching_get(), public.matching_history(),
  public.matching_tick(text, int, boolean), public.matching_add(text, text, text, text), public.matching_remove(text),
  public.matching_restore(text), public.matching_revert(text, jsonb) from public, anon;
grant execute on function public.matching_is_editor(), public.matching_get(), public.matching_history(),
  public.matching_tick(text, int, boolean), public.matching_add(text, text, text, text), public.matching_remove(text),
  public.matching_restore(text), public.matching_revert(text, jsonb) to authenticated;
