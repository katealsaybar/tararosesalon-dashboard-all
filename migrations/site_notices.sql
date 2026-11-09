-- Site notices (Kate, 9 Nov 2026): a bell on every signed-in page, and one popup for an important notice.
-- A notice is written by Kate (Team Home > Tools > Notices) or made by the database itself (the automatic kinds below).
-- Who sees it: levels (OLD numbers 1 to 5, the same as everywhere in the database; null = every level), depts (level 1 only: Hair, Beauty,
-- Front Desk, Call Centre; null = any), branches (perf_staff.branch codes AQ, KCA, MC, SAA; a person whose branch is not known, such as
-- reception and call centre, only gets a notice that has no branch ticked), or one person (to_email).
-- Everything is closed to the browser (RLS on, no policies, no grants); the page reads and writes only through the functions at the bottom.
-- Notices carry no client names: an automatic one says the complaint code, branch and type only.
-- Undo: drop trigger site_notice_cc on public.complaint_people; drop table public.site_notice_reads, public.site_notices, public.site_notice_auto cascade.

create table if not exists public.site_notices (
  id          bigserial primary key,
  kind        text not null default 'manual',
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 600),
  icon        text not null default 'megaphone' check (icon in ('megaphone','podium','complaint','clock','reply','chat','pay')),
  link_url    text check (link_url is null or link_url ~ '^/[A-Za-z0-9_./?=&%#:-]{0,200}$'),
  link_label  text check (link_label is null or char_length(link_label) <= 40),
  levels      int[],
  depts       text[],
  branches    text[],
  to_email    text,
  popup       boolean not null default false,
  show_from   timestamptz not null default now(),
  show_until  timestamptz,
  source_key  text unique,
  created_by  text,
  created_at  timestamptz not null default now(),
  withdrawn   boolean not null default false
);
create index if not exists site_notices_from on public.site_notices (show_from desc);
create index if not exists site_notices_to on public.site_notices (to_email) where to_email is not null;

create table if not exists public.site_notice_reads (
  notice_id      bigint not null references public.site_notices (id) on delete cascade,
  email          text not null,
  read_at        timestamptz not null default now(),
  popup_seen_at  timestamptz,
  primary key (notice_id, email)
);

-- Which automatic kinds are switched on (Kate can turn one off). A kind with no row is on.
create table if not exists public.site_notice_auto (
  kind        text primary key,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.site_notices enable row level security;
alter table public.site_notice_reads enable row level security;
alter table public.site_notice_auto enable row level security;
revoke all on public.site_notices, public.site_notice_reads, public.site_notice_auto from anon, authenticated;
revoke all on sequence public.site_notices_id_seq from anon, authenticated;

-- ── internal: the notices one person may see right now (never granted to the browser) ───────────────
create or replace function public._notice_visible(em text) returns setof public.site_notices
language plpgsql stable security definer set search_path = '' as $$
declare lv int := public.kb_level_for(em); dp text := public.kb_staff_dept_for(em); br text;
begin
  if lv is null then return; end if;
  select p.branch into br from public.perf_staff p where p.active and lower(trim(p.email)) = em limit 1;
  return query
    select n.* from public.site_notices n
     where not n.withdrawn
       and n.show_from <= now() and n.show_from > now() - interval '30 days'
       and (n.show_until is null or n.show_until > now())
       and (n.to_email = em
            or (n.to_email is null
                and (n.levels   is null or lv = any (n.levels))
                and (n.depts    is null or lv <> 1 or dp = any (n.depts))   -- teams only narrow level 1; higher levels are never cut by it
                and (n.branches is null or br = any (n.branches))))
     order by n.show_from desc, n.id desc
     limit 60;
end $$;

-- ── internal: make one notice for one person from the database (automatic kinds); one per source_key ─────
create or replace function public._notice_push(p_kind text, p_key text, p_to text, p_title text, p_body text, p_icon text,
                                               p_link text, p_label text, p_popup boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((select a.enabled from public.site_notice_auto a where a.kind = p_kind), true) is not true then return; end if;
  insert into public.site_notices (kind, title, body, icon, link_url, link_label, to_email, popup, source_key, created_by)
  values (p_kind, p_title, coalesce(p_body, ''), p_icon, p_link, p_label, lower(p_to), p_popup, p_kind || ':' || p_key, 'system')
  on conflict (source_key) do nothing;
end $$;
revoke all on function public._notice_visible(text), public._notice_push(text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;

-- ── staff: the bell. Everything the signed-in person can see, the unread count, and the one popup waiting (if any) ──
create or replace function public.notices_my() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare em text := public.kb_me_email(); res jsonb;
begin
  if em is null then raise exception 'Not signed in'; end if;
  with v as (
    select n.*, r.read_at, r.popup_seen_at from public._notice_visible(em) n
    left join public.site_notice_reads r on r.notice_id = n.id and r.email = em)
  select jsonb_build_object(
    'unread', (select count(*) from v where read_at is null),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'kind', v.kind, 'title', v.title, 'body', v.body, 'icon', v.icon, 'link', v.link_url, 'label', v.link_label,
        'at', v.show_from, 'read', v.read_at is not null, 'popup', v.popup) order by v.show_from desc, v.id desc) from v), '[]'::jsonb),
    'popup', (select jsonb_build_object('id', v.id, 'title', v.title, 'body', v.body, 'icon', v.icon, 'link', v.link_url, 'label', v.link_label)
                from v where v.popup and v.popup_seen_at is null order by v.show_from desc, v.id desc limit 1))
  into res;
  return res;
end $$;

create or replace function public.notices_mark_read(p_ids bigint[]) returns void
language plpgsql security definer set search_path = '' as $$
declare em text := public.kb_me_email();
begin
  if em is null then raise exception 'Not signed in'; end if;
  insert into public.site_notice_reads (notice_id, email)
    select v.id, em from public._notice_visible(em) v where v.id = any (coalesce(p_ids, '{}'))
  on conflict (notice_id, email) do nothing;
end $$;

create or replace function public.notices_mark_all_read() returns void
language plpgsql security definer set search_path = '' as $$
declare em text := public.kb_me_email();
begin
  if em is null then raise exception 'Not signed in'; end if;
  insert into public.site_notice_reads (notice_id, email)
    select v.id, em from public._notice_visible(em) v
  on conflict (notice_id, email) do nothing;
end $$;

-- the popup was shown and dismissed: it counts as read and never comes back
create or replace function public.notices_popup_seen(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare em text := public.kb_me_email();
begin
  if em is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public._notice_visible(em) v where v.id = p_id) then return; end if;
  insert into public.site_notice_reads (notice_id, email, popup_seen_at) values (p_id, em, now())
  on conflict (notice_id, email) do update set popup_seen_at = now();
end $$;

-- ── writing: Level 5 (Kate) only ─────────────────────────────────────────────────────────────────────
create or replace function public._notice_writer() returns text
language plpgsql stable security definer set search_path = '' as $$
declare em text := public.kb_me_email();
begin
  if em is null or coalesce(public.kb_level_for(em), 0) < 5 then raise exception 'Level 5 only'; end if;
  return em;
end $$;
revoke all on function public._notice_writer() from public, anon, authenticated;

create or replace function public.notice_send(p_title text, p_body text, p_icon text, p_link text, p_label text,
                                              p_levels int[], p_depts text[], p_branches text[], p_popup boolean,
                                              p_from timestamptz default null, p_until timestamptz default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare em text := public._notice_writer(); nid bigint;
begin
  if p_levels is not null and (cardinality(p_levels) = 0 or exists (select 1 from unnest(p_levels) l where l < 1 or l > 5)) then
    raise exception 'Pick at least one Level'; end if;
  insert into public.site_notices (kind, title, body, icon, link_url, link_label, levels, depts, branches, popup, show_from, show_until, created_by)
  values ('manual', btrim(p_title), coalesce(btrim(p_body), ''), coalesce(nullif(p_icon, ''), 'megaphone'), nullif(btrim(coalesce(p_link, '')), ''),
          nullif(btrim(coalesce(p_label, '')), ''), p_levels, nullif(p_depts, '{}'), nullif(p_branches, '{}'), coalesce(p_popup, false),
          coalesce(p_from, now()), p_until, em)
  returning id into nid;
  return nid;
end $$;

create or replace function public.notices_sent() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare em text := public._notice_writer();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'title', n.title, 'at', n.show_from, 'until', n.show_until, 'popup', n.popup, 'withdrawn', n.withdrawn,
      'levels', n.levels, 'depts', n.depts, 'branches', n.branches, 'to', n.to_email is not null,
      'seen', (select count(*) from public.site_notice_reads r where r.notice_id = n.id)) order by n.show_from desc, n.id desc)
    from (select * from public.site_notices order by show_from desc, id desc limit 50) n), '[]'::jsonb);
end $$;

create or replace function public.notice_withdraw(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare em text := public._notice_writer();
begin
  update public.site_notices set withdrawn = true where id = p_id;
end $$;

create or replace function public.notices_auto_get() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare em text := public._notice_writer();
begin
  return coalesce((select jsonb_object_agg(a.kind, a.enabled) from public.site_notice_auto a), '{}'::jsonb);
end $$;

create or replace function public.notices_auto_set(p_kind text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare em text := public._notice_writer();
begin
  if p_kind is null or p_kind !~ '^[a-z_]{1,40}$' then raise exception 'No kind'; end if;
  insert into public.site_notice_auto (kind, enabled, updated_by) values (p_kind, coalesce(p_enabled, true), em)
  on conflict (kind) do update set enabled = excluded.enabled, updated_at = now(), updated_by = excluded.updated_by;
end $$;

revoke all on function public.notices_my(), public.notices_mark_read(bigint[]), public.notices_mark_all_read(), public.notices_popup_seen(bigint),
  public.notice_send(text, text, text, text, text, int[], text[], text[], boolean, timestamptz, timestamptz), public.notices_sent(),
  public.notice_withdraw(bigint), public.notices_auto_get(), public.notices_auto_set(text, boolean) from public, anon;
grant execute on function public.notices_my(), public.notices_mark_read(bigint[]), public.notices_mark_all_read(), public.notices_popup_seen(bigint),
  public.notice_send(text, text, text, text, text, int[], text[], text[], boolean, timestamptz, timestamptz), public.notices_sent(),
  public.notice_withdraw(bigint), public.notices_auto_get(), public.notices_auto_set(text, boolean) to authenticated;

-- ── automatic kind 1: a person is tagged on a complaint (complaint_people kind 'cc') ──────────────────────
-- A failure here must never stop a complaint being saved, so it swallows its own errors.
create or replace function public._notice_on_cc() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if new.kind = 'cc' and new.email is not null then
    select cc.code, cc.branch_code, cc.complaint_type into c from public.client_complaints cc where cc.id = new.complaint_id;
    if c.code is not null then
      perform public._notice_push('complaint_tagged', new.id::text, new.email,
        'You were tagged on a complaint',
        c.code || ' | ' || coalesce(c.branch_code, '') || ' | ' || replace(coalesce(c.complaint_type, 'complaint'), '_', ' '),
        'complaint', '/hub/complaint?c=' || c.code, 'Open the complaint', false);
    end if;
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public._notice_on_cc() from public, anon, authenticated;
drop trigger if exists site_notice_cc on public.complaint_people;
create trigger site_notice_cc after insert on public.complaint_people for each row execute function public._notice_on_cc();
