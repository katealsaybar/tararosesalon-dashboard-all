-- Campaign Blasts (Kate, 30 Oct 2026): one page per WhatsApp blast showing what the client sees, the day and time it goes out,
-- and Coach Emma's review and comments. Team Home card 'campaign-blasts' (hub/campaign-blasts.html).
--
-- Who: old Levels 3 (Executives & Marketing, shown as Level 4) and 5 (Kate, shown as Level 6). Accounts (old 4) is left out on purpose.
-- Every table is closed to the browser (RLS on, no policies); the page reads and writes only through the functions below, which check
-- the level again. Nothing here sends a message: it records the plan, the schedule and the review. Kate still launches from respond.io.
--
-- The blast content (messages, counts, who gets them) is NOT in this file. The repo is public, so the drafts were loaded straight into
-- blast_plan_items on 30 Oct 2026 and stay out of the repo. Shape of blast_plan_items.data:
--   { title, n, who, gets, img, page_url, page_name, planned_date, planned_time, warm: {name, c, t}, std: {name, c, t} }
--   (page_url = the campaign's landing page, a path on this site, page_name = what the link says)
--   (name = the respond.io template name, c = clients in that group, t = the message with {{1}} for the first name)

create table if not exists public.blast_plan_items (
  id   text primary key,
  sort int  not null default 0,
  data jsonb not null
);

create table if not exists public.blast_plan_state (
  blast_id   text primary key references public.blast_plan_items (id) on delete cascade,
  send_date  date,
  send_time  time,
  locked     boolean not null default false,
  review     text not null default 'none' check (review in ('none', 'ok', 'changes')),
  review_by  text,
  review_at  timestamptz,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists public.blast_plan_comments (
  id           bigserial primary key,
  blast_id     text not null references public.blast_plan_items (id) on delete cascade,
  author       text not null,
  author_email text,
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index if not exists blast_plan_comments_blast on public.blast_plan_comments (blast_id, created_at);

alter table public.blast_plan_items    enable row level security;
alter table public.blast_plan_state    enable row level security;
alter table public.blast_plan_comments enable row level security;
revoke all on public.blast_plan_items, public.blast_plan_state, public.blast_plan_comments from anon, authenticated;
revoke all on sequence public.blast_plan_comments_id_seq from anon, authenticated;

-- ── guard: returns the signed-in person's name, or refuses ─────────────────────────────────────────────────────────────
create or replace function public.blast_plan_guard() returns text
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.level is null or m.level not in (3, 5) then raise exception 'Not open to your account'; end if;
  return m.name;
end $$;

-- ── read: every blast with its schedule, review and comments ───────────────────────────────────────────────────────────
create or replace function public.blast_plan_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := blast_plan_guard();
begin
  return jsonb_build_object(
    'me', who,
    'level', (select m.level from public.dashboard_me() m limit 1),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'data', i.data,
        'send_date', coalesce(s.send_date, nullif(i.data->>'planned_date', '')::date),
        'send_time', to_char(coalesce(s.send_time, nullif(i.data->>'planned_time', '')::time), 'HH24:MI'),
        'locked', coalesce(s.locked, false),
        'review', coalesce(s.review, 'none'),
        'review_by', s.review_by,
        'review_at', s.review_at,
        'comments', coalesce((
          select jsonb_agg(jsonb_build_object('id', c.id, 'by', c.author, 'body', c.body, 'at', c.created_at,
                                              'mine', c.author_email is not null and c.author_email = lower(coalesce(auth.jwt() ->> 'email', '')))
                           order by c.created_at, c.id)
          from public.blast_plan_comments c where c.blast_id = i.id), '[]'::jsonb)
      ) order by i.sort, i.id)
      from public.blast_plan_items i
      left join public.blast_plan_state s on s.blast_id = i.id), '[]'::jsonb));
end $$;

-- ── schedule: the day and time, and whether it is locked ───────────────────────────────────────────────────────────────
create or replace function public.blast_plan_schedule(p_id text, p_date date, p_time text, p_lock boolean) returns void
language plpgsql security definer set search_path = public as $$
declare who text := blast_plan_guard();
begin
  if not exists (select 1 from public.blast_plan_items where id = p_id) then raise exception 'No such blast'; end if;
  if p_date is null or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Pick a date and a time'; end if;
  insert into public.blast_plan_state (blast_id, send_date, send_time, locked, updated_by, updated_at)
  values (p_id, p_date, p_time::time, coalesce(p_lock, false), who, now())
  on conflict (blast_id) do update set send_date = excluded.send_date, send_time = excluded.send_time, locked = excluded.locked,
                                       updated_by = excluded.updated_by, updated_at = now();
end $$;

-- ── review: approve, needs changes, or back to waiting ─────────────────────────────────────────────────────────────────
create or replace function public.blast_plan_review(p_id text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare who text := blast_plan_guard();
begin
  if not exists (select 1 from public.blast_plan_items where id = p_id) then raise exception 'No such blast'; end if;
  if p_status not in ('none', 'ok', 'changes') then raise exception 'Unknown status'; end if;
  insert into public.blast_plan_state (blast_id, review, review_by, review_at, updated_by, updated_at)
  values (p_id, p_status, case when p_status = 'none' then null else who end, case when p_status = 'none' then null else now() end, who, now())
  on conflict (blast_id) do update set review = excluded.review, review_by = excluded.review_by, review_at = excluded.review_at,
                                       updated_by = excluded.updated_by, updated_at = now();
end $$;

-- ── comments ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.blast_plan_comment(p_id text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := blast_plan_guard(); r public.blast_plan_comments;
begin
  if not exists (select 1 from public.blast_plan_items where id = p_id) then raise exception 'No such blast'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Write a comment first'; end if;
  insert into public.blast_plan_comments (blast_id, author, author_email, body)
  values (p_id, who, lower(auth.jwt() ->> 'email'), left(btrim(p_body), 2000)) returning * into r;
  return jsonb_build_object('id', r.id, 'by', r.author, 'body', r.body, 'at', r.created_at, 'mine', true);
end $$;

create or replace function public.blast_plan_comment_delete(p_comment_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare who text := blast_plan_guard(); lv int; c public.blast_plan_comments;
begin
  select m.level into lv from public.dashboard_me() m limit 1;
  select * into c from public.blast_plan_comments where id = p_comment_id;
  if not found then return; end if;
  if lv <> 5 and (c.author_email is null or c.author_email <> lower(coalesce(auth.jwt() ->> 'email', ''))) then raise exception 'Only the author can delete a comment'; end if;
  delete from public.blast_plan_comments where id = p_comment_id;
end $$;

revoke execute on function public.blast_plan_guard(), public.blast_plan_get(), public.blast_plan_schedule(text, date, text, boolean),
  public.blast_plan_review(text, text), public.blast_plan_comment(text, text), public.blast_plan_comment_delete(bigint) from public, anon, authenticated;
grant execute on function public.blast_plan_get(), public.blast_plan_schedule(text, date, text, boolean), public.blast_plan_review(text, text),
  public.blast_plan_comment(text, text), public.blast_plan_comment_delete(bigint) to authenticated;

-- Team Home card: Executives & Marketing and Kate; Accounts (old Level 4) skipped.
insert into public.kb_sections (key, dept, min_level, staff_dept, sort, skip_levels) values ('campaign-blasts', 'Management', 3, null, 89, '{4}')
on conflict (key) do nothing;
