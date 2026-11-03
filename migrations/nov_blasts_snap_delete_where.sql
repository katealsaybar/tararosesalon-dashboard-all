-- November blasts: the snapshot rebuild failed with "DELETE requires a WHERE clause" (applied live 3 Nov 2026).
-- The API role (authenticator) loads safeupdate, which refuses a DELETE with no WHERE. A snapshot older than
-- 60 minutes is rebuilt on the next page open, so the page showed ? for every count. Same function as in
-- nov_blasts.sql, one line changed: delete from public.nov_blast_snap where true.
-- Other refresh functions with a bare DELETE (cq_notes_refresh, cq_review_cache_refresh, lost_facts_refresh,
-- lost_lists_refresh) are not touched here; check them if a page that calls them over the API stops loading.

create or replace function public.nov_blast_snap_refresh(p_force boolean default false) returns timestamptz
language plpgsql security definer set search_path = public set statement_timeout = '60s' as $$
declare t timestamptz;
begin
  select m.at into t from public.nov_blast_snap_meta m where m.id = 1;
  if not p_force and t is not null and t > now() - interval '60 minutes' then return t; end if;
  if not pg_try_advisory_xact_lock(727001) then return t; end if;
  delete from public.nov_blast_snap where true;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast_members() m;
  insert into public.nov_blast_snap_meta (id, at) values (1, now()) on conflict (id) do update set at = excluded.at;
  return now();
end $$;
