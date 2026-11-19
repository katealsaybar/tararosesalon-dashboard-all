-- Recruitment: a CV link for someone who has no dashboard access (Kate, 19 Nov 2026). Run after recruit_cv_files.sql. Additive.
--
-- The CV stays in the private bucket recruit-cvs. A share link is https://trk-salon-os.com/cv/?t=<token>: the token is a random uuid kept in recruit_cv_shares, valid for 7 days,
-- and only the edge function recruit-cv-share (service role) can turn it into the file. It names nobody and grants nothing else; each open is counted.
--   recruit_cv_shares            service role only (RLS on, no policy, no grants)
--   recruit_cv_share_make(id)    Kate / Coach Emma / Jho / Frans (recruit_guard): makes a token for a person who has a stored CV, returns it; also clears tokens expired for 30 days
--   recruit_cv_share_get(token)  service role only: returns the file path and name, counts the open
-- Undo: drop the two functions and the table, delete the edge function recruit-cv-share and the cv/ page.

create table if not exists public.recruit_cv_shares (
  token uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.recruit_applicants(id) on delete cascade,
  created_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  opened_count integer not null default 0,
  last_opened_at timestamptz
);
create index if not exists recruit_cv_shares_applicant_idx on public.recruit_cv_shares (applicant_id);
alter table public.recruit_cv_shares enable row level security;
revoke all on public.recruit_cv_shares from public, anon, authenticated;

create or replace function public.recruit_cv_share_make(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare who text := public.recruit_guard(); t uuid;
begin
  if not exists (select 1 from public.recruit_applicants where id = p_id and cv_file is not null) then raise exception 'this person has no stored CV'; end if;
  delete from public.recruit_cv_shares where expires_at < now() - interval '30 days';
  insert into public.recruit_cv_shares (applicant_id, created_by) values (p_id, who) returning token into t;
  return t::text;
end $$;

create or replace function public.recruit_cv_share_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s record; a record;
begin
  select * into s from public.recruit_cv_shares where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if s.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  select cv_file, cv_file_name, name into a from public.recruit_applicants where id = s.applicant_id;
  if a.cv_file is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  update public.recruit_cv_shares set opened_count = opened_count + 1, last_opened_at = now() where token = p_token;
  return jsonb_build_object('ok', true, 'cv_file', a.cv_file, 'cv_file_name', a.cv_file_name, 'name', a.name);
end $$;

revoke all on function public.recruit_cv_share_make(uuid) from public, anon;
revoke all on function public.recruit_cv_share_get(uuid) from public, anon, authenticated;
grant execute on function public.recruit_cv_share_make(uuid) to authenticated;
grant execute on function public.recruit_cv_share_get(uuid) to service_role;
