-- Suggestions box (Kate, 5 Oct 2026).
--
-- Everyone who can sign in to Team Home (Level 1 to 5) can send a suggestion; Level 3
-- and up read them. The sender picks: their name goes on by default, or they tick
-- "Send without my name", and then no name, email or user id is saved at all, so an
-- anonymous suggestion can't be traced back, not even in Supabase.
--
-- Nobody touches the table directly: kb_suggest() saves (it fills the name in itself,
-- so nobody can sign as someone else), kb_suggestions() lists for Level 3+, and
-- kb_suggestion_mark() moves one between New, Seen and Done. A Bahrain-scoped reader
-- sees Bahrain suggestions only, as on the roster.

create table if not exists public.kb_suggestions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  topic text not null default 'Other'
    check (topic in ('Clients', 'Team', 'Salon & tools', 'Systems & admin', 'Other')),
  body text not null check (length(trim(body)) between 3 and 2000),
  sender_name text,            -- null when sent without a name
  sender_email text,           -- null when sent without a name
  region text check (region = 'BAH'),
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  status_by text,
  status_at timestamptz
);
alter table public.kb_suggestions enable row level security;
revoke all on public.kb_suggestions from anon, authenticated;

create or replace function public.kb_suggest(p_topic text, p_body text, p_anon boolean)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare em text := public.kb_me_email(); bah boolean; new_id bigint;
begin
  if em is null or public.kb_level_for(em) is null then raise exception 'not signed in'; end if;
  bah := coalesce((select d.scope = 'BAH' from public.dashboard_users d where d.email = em), false)
      or exists (select 1 from public.kb_staff k where k.active and k.email = em and k.note ilike '%bahrain%');
  insert into public.kb_suggestions (topic, body, sender_name, sender_email, region)
  values (coalesce(nullif(p_topic, ''), 'Other'), trim(p_body),
          case when p_anon then null else public.kb_me() end,
          case when p_anon then null else em end,
          case when bah then 'BAH' end)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.kb_suggestions()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (
    select public.kb_level() lv,
           (select d.scope from public.dashboard_users d where d.email = public.kb_me_email()) sc
  )
  select case when (select lv from me) is null or (select lv from me) < 3 then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'created_at', s.created_at, 'topic', s.topic, 'body', s.body,
             'sender_name', s.sender_name, 'region', s.region,
             'status', s.status, 'status_by', s.status_by, 'status_at', s.status_at)
           order by s.created_at desc)
    from public.kb_suggestions s
    where (select sc from me) is distinct from 'BAH' or s.region = 'BAH'
  ), '[]'::jsonb) end
$$;

create or replace function public.kb_suggestion_mark(p_id bigint, p_status text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare sc text := (select d.scope from public.dashboard_users d where d.email = public.kb_me_email());
begin
  if coalesce(public.kb_level(), 0) < 3 or p_status not in ('new', 'seen', 'done') then return false; end if;
  update public.kb_suggestions s
     set status = p_status, status_by = public.kb_me(), status_at = now()
   where s.id = p_id and (sc is distinct from 'BAH' or s.region = 'BAH');
  return found;
end $$;

revoke all on function public.kb_suggest(text, text, boolean) from public, anon;
revoke all on function public.kb_suggestions() from public, anon;
revoke all on function public.kb_suggestion_mark(bigint, text) from public, anon;
grant execute on function public.kb_suggest(text, text, boolean) to authenticated;
grant execute on function public.kb_suggestions() to authenticated;
grant execute on function public.kb_suggestion_mark(bigint, text) to authenticated;
