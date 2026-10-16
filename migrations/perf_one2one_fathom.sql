-- Fathom meeting notes beside the 1-to-1 (Kate, 16 Oct 2026). Coach Emma records her 1-to-1s with the staff
-- on Fathom; a webhook (supabase/functions/fathom-webhook) drops each finished meeting here, matched to the
-- stylist by the invitee's email on perf_staff. The 1-to-1 tab then shows the summary and action items next to
-- the form, and the editor can add the action items to Agreed actions.
--
-- What is and is not kept:
--   * summary, action items, the Fathom links, the invitee list and the meeting times are kept.
--   * the TRANSCRIPT is never kept (the function drops it before the row is written): it can hold personal and
--     financial things staff said, and nothing here needs it.
--   * a meeting that does not match exactly one active stylist is dropped, unless it looks like a 1-to-1
--     (title says 1-to-1, two or three people on the call): that one is kept as 'unmatched' so the editor can
--     say whose it is. Emma's supplier calls and team meetings never land here.
--   * these notes live only here and in the leader view; they are NOT part of the signed 1-to-1 record, so the
--     stylist's own link and the PDF never carry them. Only what the editor adds to Agreed actions does.
-- Who: all three leader keys (Kate, Tara, Emma) can read; only the editor (perf_admins.one2one_editor: Emma,
-- Kate) can assign, add to the 1-to-1 and dismiss. Viewer and payroll keys get nothing.
-- RLS is on with no policies: the page goes through the functions; the webhook writes with the service role.

create table if not exists perf_o2o_fathom (
  id            bigint generated always as identity primary key,
  recording_id  bigint not null unique,                 -- Fathom's own id, so a resend never doubles a note
  staff_id      uuid references perf_staff(id) on delete cascade,   -- null = unmatched, waiting for the editor
  match_how     text check (match_how in ('email', 'manual')),
  status        text not null default 'new' check (status in ('new', 'used', 'dismissed')),
  title         text,
  meeting_title text,
  started_at    timestamptz,
  ended_at      timestamptz,
  recorded_by   text,                                   -- email of the Fathom user who recorded it
  invitees      jsonb not null default '[]'::jsonb,     -- [{name, email}]
  summary       text,
  action_items  jsonb not null default '[]'::jsonb,     -- [{text, assignee, done}]
  share_url     text,
  url           text,
  raw           jsonb,                                  -- the payload without transcript, to fix field names if Fathom's differ
  used_by       text,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists perf_o2o_fathom_staff_idx on perf_o2o_fathom (staff_id, started_at desc);
alter table perf_o2o_fathom enable row level security;

-- The notes for one stylist (newest first) plus the meetings nobody has claimed yet.
create or replace function perf_o2o_fathom_list(p_admin uuid, p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare who text; sid uuid;
begin
  select name into who from perf_admins where token = p_admin and role = 'leader';
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null then return null; end if;
  return jsonb_build_object(
    'notes', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'status', f.status, 'title', coalesce(f.meeting_title, f.title), 'started_at', f.started_at,
        'ended_at', f.ended_at, 'summary', f.summary, 'action_items', f.action_items, 'share_url', f.share_url,
        'url', f.url, 'used_by', f.used_by, 'used_at', f.used_at, 'match_how', f.match_how)
        order by f.started_at desc nulls last), '[]'::jsonb)
      from perf_o2o_fathom f where f.staff_id = sid and f.status <> 'dismissed'),
    'unmatched', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'title', coalesce(f.meeting_title, f.title), 'started_at', f.started_at, 'invitees', f.invitees)
        order by f.started_at desc nulls last), '[]'::jsonb)
      from perf_o2o_fathom f where f.staff_id is null and f.status = 'new'));
end $$;

-- The editor says an unmatched meeting is this stylist's.
create or replace function perf_o2o_fathom_assign(p_admin uuid, p_token uuid, p_id bigint) returns text
language plpgsql volatile security definer set search_path = public as $$
declare who text; sid uuid;
begin
  who := perf_o2o_editor(p_admin);
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null then return 'denied'; end if;
  update perf_o2o_fathom set staff_id = sid, match_how = 'manual' where id = p_id and staff_id is null;
  return case when found then 'ok' else 'gone' end;
end $$;

-- 'used' (action items added to the 1-to-1), 'dismissed' (not wanted) or 'new' (undo).
create or replace function perf_o2o_fathom_mark(p_admin uuid, p_token uuid, p_id bigint, p_status text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare who text; sid uuid;
begin
  who := perf_o2o_editor(p_admin);
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null or p_status not in ('new', 'used', 'dismissed') then return 'denied'; end if;
  update perf_o2o_fathom
     set status = p_status,
         used_by = case when p_status = 'used' then who end,
         used_at = case when p_status = 'used' then now() end
   where id = p_id and staff_id = sid;
  return case when found then 'ok' else 'gone' end;
end $$;

revoke all on function perf_o2o_fathom_list(uuid, uuid)               from public;
revoke all on function perf_o2o_fathom_assign(uuid, uuid, bigint)     from public;
revoke all on function perf_o2o_fathom_mark(uuid, uuid, bigint, text) from public;
grant execute on function perf_o2o_fathom_list(uuid, uuid)               to anon, authenticated;
grant execute on function perf_o2o_fathom_assign(uuid, uuid, bigint)     to anon, authenticated;
grant execute on function perf_o2o_fathom_mark(uuid, uuid, bigint, text) to anon, authenticated;
