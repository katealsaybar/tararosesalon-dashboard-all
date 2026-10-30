-- Campaign Blasts, people who can read and comment but not approve or schedule (Kate, 30 Oct 2026: "allow ate Belle to also comment").
-- Old Levels 3 and 5 stay the editors (blast_plan_guard, unchanged, still guards schedule, review and the client lists). A person whose
-- dashboard_users.extra_pages holds 'campaignblasts' may also read the blasts, see the counts and write comments. They get no client names,
-- no Approve and no schedule. Opening the page for someone is one row: update dashboard_users set extra_pages = array_append(extra_pages, 'campaignblasts').

create or replace function public.blast_plan_guard_read() returns text
language plpgsql stable security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.dashboard_me() limit 1;
  if m.name is null or not (m.level in (3, 5) or 'campaignblasts' = any (coalesce(m.extra_pages, '{}'::text[]))) then
    raise exception 'Not open to your account';
  end if;
  return m.name;
end $$;

create or replace function public.blast_plan_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text := blast_plan_guard_read();
begin
  return jsonb_build_object(
    'me', who,
    'level', (select m.level from public.dashboard_me() m limit 1),
    'editor', coalesce((select m.level in (3, 5) from public.dashboard_me() m limit 1), false),
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

-- the counts only (no names), so the numbers on the page fill in for a commenter too
create or replace function public.blast_plan_audience(p_asof date default null) returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '45s' as $$
declare out jsonb;
begin
  perform public.blast_plan_guard_read();
  select jsonb_build_object(
    'asof', coalesce(p_asof, (now() at time zone 'Asia/Dubai')::date),
    'blasts', coalesce(jsonb_object_agg(t.blast_id, jsonb_build_object('n', t.n, 'warm', t.warm, 'std', t.std)), '{}'::jsonb))
  into out
  from (select m.blast_id, count(*) as n, count(*) filter (where m.grp = 'warm') as warm, count(*) filter (where m.grp = 'std') as std
        from public.blast_plan_members(p_asof) m group by m.blast_id) t;
  return out;
end $$;

create or replace function public.blast_plan_comment(p_id text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare who text := blast_plan_guard_read(); r public.blast_plan_comments;
begin
  if not exists (select 1 from public.blast_plan_items where id = p_id) then raise exception 'No such blast'; end if;
  if char_length(btrim(coalesce(p_body, ''))) < 1 then raise exception 'Write a comment first'; end if;
  insert into public.blast_plan_comments (blast_id, author, author_email, body)
  values (p_id, who, lower(auth.jwt() ->> 'email'), left(btrim(p_body), 2000)) returning * into r;
  return jsonb_build_object('id', r.id, 'by', r.author, 'body', r.body, 'at', r.created_at, 'mine', true);
end $$;

-- a commenter can delete their own comment, Level 5 any
create or replace function public.blast_plan_comment_delete(p_comment_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare who text := blast_plan_guard_read(); lv int; c public.blast_plan_comments;
begin
  select m.level into lv from public.dashboard_me() m limit 1;
  select * into c from public.blast_plan_comments where id = p_comment_id;
  if not found then return; end if;
  if lv is distinct from 5 and (c.author_email is null or c.author_email <> lower(coalesce(auth.jwt() ->> 'email', ''))) then raise exception 'Only the author can delete a comment'; end if;
  delete from public.blast_plan_comments where id = p_comment_id;
end $$;

revoke all on function public.blast_plan_guard_read() from public, anon, authenticated;
