-- Fathom notes: what kind of meeting each one was (Kate, 21 Oct 2026). Coach Emma records everything on Fathom, so
-- a call with one stylist can be a 1-to-1, a goals conversation or neither. The webhook tags each call from its title
-- and summary ('goals' when the title says goal, or the summary mentions goals twice or more; otherwise 'one');
-- the editor (Emma, Kate) changes the tag with one click. 'no' hides the call behind a Show link on the Fathom tab.
-- Nothing here touches the signed 1-to-1 record or its PDF.

alter table perf_o2o_fathom add column if not exists kind    text not null default 'one' check (kind in ('one', 'goals', 'no'));
alter table perf_o2o_fathom add column if not exists kind_by text;     -- null = tagged by the webhook, otherwise the editor who changed it

-- The list now carries kind and kind_by, and keeps calls tagged 'no' so the page can offer them behind Show.
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
        'url', f.url, 'used_by', f.used_by, 'used_at', f.used_at, 'match_how', f.match_how,
        'kind', f.kind, 'kind_by', f.kind_by)
        order by f.started_at desc nulls last), '[]'::jsonb)
      from perf_o2o_fathom f where f.staff_id = sid and f.status <> 'dismissed'),
    'unmatched', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', f.id, 'title', coalesce(f.meeting_title, f.title), 'started_at', f.started_at, 'invitees', f.invitees)
        order by f.started_at desc nulls last), '[]'::jsonb)
      from perf_o2o_fathom f where f.staff_id is null and f.status = 'new'));
end $$;

-- The editor says what kind of meeting this was: 'one', 'goals' or 'no'.
create or replace function perf_o2o_fathom_kind(p_admin uuid, p_token uuid, p_id bigint, p_kind text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare who text; sid uuid;
begin
  who := perf_o2o_editor(p_admin);
  select id into sid from perf_staff where token = p_token and active and one2one_on;
  if who is null or sid is null or p_kind not in ('one', 'goals', 'no') then return 'denied'; end if;
  update perf_o2o_fathom set kind = p_kind, kind_by = who where id = p_id and staff_id = sid;
  return case when found then 'ok' else 'gone' end;
end $$;

revoke all on function perf_o2o_fathom_kind(uuid, uuid, bigint, text) from public;
grant execute on function perf_o2o_fathom_kind(uuid, uuid, bigint, text) to anon, authenticated;
