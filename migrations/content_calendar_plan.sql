-- Content Calendar, "Next month's plan" (Kate, 12 Nov 2026).
-- The calendar lives in the Post Approvals app (smm_board_approvals/content-approval-tool/calendar/) and signs in with the dashboard login,
-- so these tables sit in this project with the Metricool posts. One action, one owner, one date, a line on what was noticed, and the post it came from.
-- Nothing reads or writes the table directly: every call goes through a function that checks dashboard_me().level >= 3 (the same rule as social_report()).

create table if not exists public.content_plan_items (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  created_by   text not null,
  post_network text,
  post_date    date,
  post_url     text,
  post_caption text,
  notice       text,
  owner_name   text not null,
  due          date not null,
  done         boolean not null default false,
  done_at      timestamptz
);
alter table public.content_plan_items enable row level security;
revoke all on public.content_plan_items from anon, authenticated;

create or replace function public.content_plan_list()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'The content plan is for Level 3 and above';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.done, x.due, x.created_at)
    from (select id, created_by, post_network, post_date, post_url, post_caption, notice, owner_name, due, done from public.content_plan_items) x), '[]'::jsonb);
end $$;

create or replace function public.content_plan_add(
  p_owner text, p_due date, p_notice text default null, p_network text default null,
  p_post_date date default null, p_post_url text default null, p_caption text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare me text; new_id uuid;
begin
  select m.name into me from public.dashboard_me() m where m.level >= 3 limit 1;
  if me is null then raise exception 'The content plan is for Level 3 and above'; end if;
  if coalesce(btrim(p_owner), '') = '' then raise exception 'Add who posts it'; end if;
  if p_due is null then raise exception 'Add a date'; end if;
  insert into public.content_plan_items (created_by, post_network, post_date, post_url, post_caption, notice, owner_name, due)
  values (left(me, 80), left(p_network, 20), p_post_date, left(p_post_url, 500), left(p_caption, 300), left(nullif(btrim(p_notice), ''), 500), left(btrim(p_owner), 80), p_due)
  returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

create or replace function public.content_plan_done(p_id uuid, p_done boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'The content plan is for Level 3 and above';
  end if;
  update public.content_plan_items set done = coalesce(p_done, false), done_at = case when coalesce(p_done, false) then now() else null end where id = p_id;
end $$;

create or replace function public.content_plan_remove(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then
    raise exception 'The content plan is for Level 3 and above';
  end if;
  delete from public.content_plan_items where id = p_id;
end $$;

revoke all on function public.content_plan_list() from public, anon;
revoke all on function public.content_plan_add(text, date, text, text, date, text, text) from public, anon;
revoke all on function public.content_plan_done(uuid, boolean) from public, anon;
revoke all on function public.content_plan_remove(uuid) from public, anon;
grant execute on function public.content_plan_list() to authenticated;
grant execute on function public.content_plan_add(text, date, text, text, date, text, text) to authenticated;
grant execute on function public.content_plan_done(uuid, boolean) to authenticated;
grant execute on function public.content_plan_remove(uuid) to authenticated;
