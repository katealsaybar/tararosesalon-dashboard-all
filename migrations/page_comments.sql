-- Page comments (Kate, 30 Oct 2026): Coach Emma and Kate click a spot on a public campaign landing page (/campaigns/<page>/), leave a comment
-- there, see each other's, and mark them resolved. The tool (page-comments.js) only draws itself for a signed-in dashboard user, and every
-- function below checks the level again, the same as blast_plan_guard() in campaign_blasts.sql: old Levels 3 (Executives & Marketing, shown
-- as Level 4) and 5 (Kate, shown as Level 6). Accounts (old 4) is left out on purpose.
--
-- The repo is public, so the comments, the names and the text anchors live only in these tables, never in a file here.
-- A top-level comment is a pin: anchor = { sel, tx, x, y, pxf, pyf, vw, ph } where
--   sel  a path to the element that was clicked (id, or tag:nth-of-type steps from the body)
--   tx   the first words of that element (a second way to find it again if the page is edited)
--   x, y where in the element the click landed, 0 to 1
--   pxf, pyf   where in the whole page it landed, 0 to 1 (the last way to find it)
--   vw   the window width when it was placed, ph = true when that looked like a phone
-- A reply has parent_id set and no anchor. Resolved is kept on the top-level comment only.
-- Every table is closed to the browser (RLS on, no policies); the tool reads and writes only through the functions.

create table if not exists public.page_comments (
  id            bigserial primary key,
  page          text not null check (page ~ '^[a-z0-9-]{1,60}$'),
  parent_id     bigint references public.page_comments (id) on delete cascade,
  num           int,
  anchor        jsonb check (anchor is null or char_length(anchor::text) <= 3000),
  body          text not null check (char_length(body) between 1 and 2000),
  author        text not null,
  author_email  text,
  created_at    timestamptz not null default now(),
  resolved      boolean not null default false,
  resolved_by   text,
  resolved_at   timestamptz,
  check ((parent_id is null and anchor is not null and num is not null) or (parent_id is not null and anchor is null))
);
create index if not exists page_comments_page on public.page_comments (page, created_at);
create index if not exists page_comments_parent on public.page_comments (parent_id);

alter table public.page_comments enable row level security;
revoke all on public.page_comments from anon, authenticated;
revoke all on sequence public.page_comments_id_seq from anon, authenticated;

-- ── guard: returns the signed-in person's name, or refuses ─────────────────────────────────────────────────────────────
create or replace function public.page_comment_guard() returns text
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.level is null or m.level not in (3, 5) then raise exception 'Not open to your account'; end if;
  return m.name;
end $$;

-- ── read: one page's comments, or every page's when p_page is null; replies come as their own rows with parent_id ──────
create or replace function public.page_comments_get(p_page text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := page_comment_guard();
begin
  return jsonb_build_object(
    'me', who,
    'level', (select m.level from public.dashboard_me() m limit 1),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'page', c.page, 'parent', c.parent_id, 'num', c.num, 'anchor', c.anchor, 'body', c.body,
        'by', c.author, 'at', c.created_at, 'resolved', c.resolved, 'resolved_by', c.resolved_by, 'resolved_at', c.resolved_at,
        'mine', c.author_email is not null and c.author_email = lower(coalesce(auth.jwt() ->> 'email', '')))
        order by c.page, c.created_at, c.id)
      from public.page_comments c where p_page is null or c.page = p_page), '[]'::jsonb));
end $$;

-- ── add a pin (p_parent null) or a reply (p_parent set) ────────────────────────────────────────────────────────────────
create or replace function public.page_comment_add(p_page text, p_anchor jsonb, p_body text, p_parent bigint default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := page_comment_guard(); r public.page_comments; par public.page_comments; n int;
begin
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Write a comment first'; end if;
  if p_parent is not null then
    select * into par from public.page_comments where id = p_parent;
    if not found or par.parent_id is not null then raise exception 'No such comment'; end if;
    insert into public.page_comments (page, parent_id, body, author, author_email)
    values (par.page, par.id, left(btrim(p_body), 2000), who, lower(auth.jwt() ->> 'email')) returning * into r;
  else
    if p_page is null or p_page !~ '^[a-z0-9-]{1,60}$' then raise exception 'Unknown page'; end if;
    if p_anchor is null or jsonb_typeof(p_anchor) <> 'object' then raise exception 'Click a spot on the page first'; end if;
    perform pg_advisory_xact_lock(hashtext('page_comments:' || p_page));
    select coalesce(max(num), 0) + 1 into n from public.page_comments where page = p_page and parent_id is null;
    insert into public.page_comments (page, num, anchor, body, author, author_email)
    values (p_page, n, p_anchor, left(btrim(p_body), 2000), who, lower(auth.jwt() ->> 'email')) returning * into r;
  end if;
  return jsonb_build_object('id', r.id, 'page', r.page, 'parent', r.parent_id, 'num', r.num, 'anchor', r.anchor, 'body', r.body,
                            'by', r.author, 'at', r.created_at, 'resolved', false, 'mine', true);
end $$;

-- ── resolve or reopen a pin ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.page_comment_resolve(p_id bigint, p_resolved boolean) returns void
language plpgsql security definer set search_path = public as $$
declare who text := page_comment_guard();
begin
  update public.page_comments
     set resolved = coalesce(p_resolved, false),
         resolved_by = case when coalesce(p_resolved, false) then who else null end,
         resolved_at = case when coalesce(p_resolved, false) then now() else null end
   where id = p_id and parent_id is null;
  if not found then raise exception 'No such comment'; end if;
end $$;

-- ── delete: the author, or Kate (Level 5); deleting a pin takes its replies with it ────────────────────────────────────
create or replace function public.page_comment_delete(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare who text := page_comment_guard(); lv int; c public.page_comments;
begin
  select m.level into lv from public.dashboard_me() m limit 1;
  select * into c from public.page_comments where id = p_id;
  if not found then return; end if;
  if lv <> 5 and (c.author_email is null or c.author_email <> lower(coalesce(auth.jwt() ->> 'email', ''))) then raise exception 'Only the author can delete a comment'; end if;
  delete from public.page_comments where id = p_id;
end $$;

revoke execute on function public.page_comment_guard(), public.page_comments_get(text), public.page_comment_add(text, jsonb, text, bigint),
  public.page_comment_resolve(bigint, boolean), public.page_comment_delete(bigint) from public, anon, authenticated;
grant execute on function public.page_comments_get(text), public.page_comment_add(text, jsonb, text, bigint),
  public.page_comment_resolve(bigint, boolean), public.page_comment_delete(bigint) to authenticated;
