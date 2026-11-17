-- Kate, 17 Nov 2026: sync_request, what the Daily reports page's button calls. The owner only. DRAFT, tested rolled back, then applied.
-- It checks the person is the dashboard owner (Kate), checks the request is sane (dates in the last 60 days, known salons and reports,
-- at most one button press every 20 seconds), and writes a 'queued' row in sync_runs. The sync-now edge function then asks GitHub to run
-- the sync for that row; the runner marks it running and fills in the squares (migrations/cloud_sync.sql).
--
-- scope: {"dates":["2026-11-16"], "branches":["SAA","KCA"], "reports":["fin","daily"], "ledger":"2026-11-16", "practice":false}
-- branches and reports may be left out (all five of each). practice true checks everything and saves nothing to the data tables.
--
-- To undo: drop function if exists public.sync_request(jsonb);

create or replace function public.sync_request(p_scope jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint; x text; n int;
begin
  -- is_dashboard_owner() is NULL, not false, when nobody is signed in, and "if not null" does not raise: so test it as a plain true.
  if coalesce(public.is_dashboard_owner(), false) is not true then raise exception 'only the owner may start a sync'; end if;
  if exists (select 1 from sync_runs where trigger = 'button' and created_at > now() - interval '20 seconds') then
    raise exception 'a sync was just started, wait a few seconds';
  end if;
  if jsonb_typeof(p_scope) <> 'object' then raise exception 'scope must be an object'; end if;
  if (jsonb_typeof(p_scope->'dates') is distinct from 'array' or jsonb_array_length(p_scope->'dates') = 0)
     and coalesce(p_scope->>'ledger', '') = '' then
    raise exception 'pick at least one date';
  end if;
  if jsonb_typeof(p_scope->'dates') = 'array' then
    if jsonb_array_length(p_scope->'dates') > 14 then raise exception 'at most 14 days at once'; end if;
    for x in select jsonb_array_elements_text(p_scope->'dates') loop
      if x !~ '^\d{4}-\d{2}-\d{2}$' or x::date < current_date - 60 or x::date > current_date + 1 then
        raise exception 'date % is outside the last 60 days', x;
      end if;
    end loop;
  end if;
  if coalesce(p_scope->>'ledger', '') <> '' and ((p_scope->>'ledger') !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'bad ledger date'; end if;
  if jsonb_typeof(p_scope->'branches') = 'array' then
    for x in select jsonb_array_elements_text(p_scope->'branches') loop
      if x <> all (array['SAA', 'KCA', 'MC', 'AQ', 'BAH']) then raise exception 'unknown salon %', x; end if;
    end loop;
  end if;
  if jsonb_typeof(p_scope->'reports') = 'array' then
    for x in select jsonb_array_elements_text(p_scope->'reports') loop
      if x <> all (array['fin', 'daily', 'sales', 'util', 'track']) then raise exception 'unknown report %', x; end if;
    end loop;
  end if;
  insert into sync_runs (trigger, requested_by, scope, status)
  values ('button', coalesce(auth.jwt() ->> 'email', 'owner'), p_scope, 'queued')
  returning id into rid;
  return rid;
end $$;

revoke all on function public.sync_request(jsonb) from public, anon;
grant execute on function public.sync_request(jsonb) to authenticated;
