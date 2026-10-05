-- Suggestions box replies (Kate, 5 Oct 2026), on top of kb_suggestions.sql.
--
-- Level 3 and up can reply to a suggestion. The sender reads the reply on the
-- Suggestions page: a named sender under "Your suggestions" (matched on the email
-- saved with it), an anonymous one with the private code shown once when they sent
-- it. Only a hash of the code is kept, so the code itself is nowhere but with the
-- sender, and it says nothing about who they are. No emails go out.

alter table public.kb_suggestions
  add column if not exists reply text check (reply is null or length(trim(reply)) between 1 and 2000),
  add column if not exists reply_by text,
  add column if not exists reply_at timestamptz,
  add column if not exists code_hash text unique;

create or replace function public.kb_suggestion_code_hash(p_code text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
$$;
revoke all on function public.kb_suggestion_code_hash(text) from public, anon, authenticated;

-- Sending now returns the id and, when sent without a name, the code (once).
drop function if exists public.kb_suggest(text, text, boolean);
create function public.kb_suggest(p_topic text, p_body text, p_anon boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare em text := public.kb_me_email(); bah boolean; new_id bigint; code text; abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea;
begin
  if em is null or public.kb_level_for(em) is null then raise exception 'not signed in'; end if;
  bah := coalesce((select d.scope = 'BAH' from public.dashboard_users d where d.email = em), false)
      or exists (select 1 from public.kb_staff k where k.active and k.email = em and k.note ilike '%bahrain%');
  if p_anon then
    b := extensions.gen_random_bytes(10);
    code := '';
    for i in 0..9 loop code := code || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
    code := substr(code, 1, 5) || '-' || substr(code, 6, 5);
  end if;
  insert into public.kb_suggestions (topic, body, sender_name, sender_email, region, code_hash)
  values (coalesce(nullif(p_topic, ''), 'Other'), trim(p_body),
          case when p_anon then null else public.kb_me() end,
          case when p_anon then null else em end,
          case when bah then 'BAH' end,
          case when p_anon then public.kb_suggestion_code_hash(code) end)
  returning id into new_id;
  return jsonb_build_object('id', new_id, 'code', code);
end $$;

-- The inbox now carries the reply too.
create or replace function public.kb_suggestions()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (
    select public.kb_level() lv,
           (select d.scope from public.dashboard_users d where d.email = public.kb_me_email()) sc
  )
  select case when (select lv from me) is null or (select lv from me) < 3 then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'created_at', s.created_at, 'topic', s.topic, 'body', s.body,
             'sender_name', s.sender_name, 'region', s.region, 'has_code', s.code_hash is not null,
             'status', s.status, 'status_by', s.status_by, 'status_at', s.status_at,
             'reply', s.reply, 'reply_by', s.reply_by, 'reply_at', s.reply_at)
           order by s.created_at desc)
    from public.kb_suggestions s
    where (select sc from me) is distinct from 'BAH' or s.region = 'BAH'
  ), '[]'::jsonb) end
$$;

-- Level 3+ writes or changes the reply; an empty reply removes it. A New suggestion
-- turns Seen when it is answered.
create or replace function public.kb_suggestion_reply(p_id bigint, p_reply text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare sc text := (select d.scope from public.dashboard_users d where d.email = public.kb_me_email()); r text := nullif(trim(coalesce(p_reply, '')), '');
begin
  if coalesce(public.kb_level(), 0) < 3 then return false; end if;
  update public.kb_suggestions s
     set reply = r, reply_by = case when r is null then null else public.kb_me() end,
         reply_at = case when r is null then null else now() end,
         status = case when r is not null and s.status = 'new' then 'seen' else s.status end,
         status_by = case when r is not null and s.status = 'new' then public.kb_me() else s.status_by end,
         status_at = case when r is not null and s.status = 'new' then now() else s.status_at end
   where s.id = p_id and (sc is distinct from 'BAH' or s.region = 'BAH');
  return found;
end $$;

-- What the sender sees: their own named suggestions, or one anonymous one by its code.
create or replace function public.kb_my_suggestions(p_code text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.kb_level() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'created_at', s.created_at, 'topic', s.topic, 'body', s.body,
             'status', s.status, 'reply', s.reply, 'reply_by', s.reply_by, 'reply_at', s.reply_at,
             'anon', s.code_hash is not null)
           order by s.created_at desc)
    from public.kb_suggestions s
    where case when nullif(trim(coalesce(p_code, '')), '') is null
               then s.sender_email = public.kb_me_email()
               else s.code_hash = public.kb_suggestion_code_hash(p_code) end
  ), '[]'::jsonb) end
$$;

revoke all on function public.kb_suggest(text, text, boolean) from public, anon;
revoke all on function public.kb_suggestion_reply(bigint, text) from public, anon;
revoke all on function public.kb_my_suggestions(text) from public, anon;
grant execute on function public.kb_suggest(text, text, boolean) to authenticated;
grant execute on function public.kb_suggestion_reply(bigint, text) to authenticated;
grant execute on function public.kb_my_suggestions(text) to authenticated;
