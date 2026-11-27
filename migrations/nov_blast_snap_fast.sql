-- November database blasts, page counts showed "?" (Kate, 27 Nov 2026). APPLIED LIVE 27 Nov 2026.
-- Cause: nov_blast_snap_refresh rebuilt EVERY blast whenever the snapshot was over 60 minutes old and an editor opened the page. nov_blast_members() (Blast 1) now takes about
-- 98 s and returns only 24 rows (the rest are sent), longer than nov_blast_audience's 60 s limit, so the call failed on every open and every pill showed "?".
-- The snapshot had not been rebuilt since 16 Nov. Fix: Blast 1 rows (ids A to F2) are built once and kept; only Blast 2 (R_) and Blast 3 (T_) are rebuilt (about 5 s).
-- Rollback: nov_blast_snap_refresh_pre_fast_27nov holds the previous text (rename it back with pg_get_functiondef).
do $do$
declare d text;
begin
  if not exists (select 1 from pg_proc q where q.pronamespace = 'public'::regnamespace and q.proname = 'nov_blast_snap_refresh_pre_fast_27nov') then
    d := replace(pg_get_functiondef('public.nov_blast_snap_refresh(boolean)'::regprocedure), 'FUNCTION public.nov_blast_snap_refresh(', 'FUNCTION public.nov_blast_snap_refresh_pre_fast_27nov(');
    execute d;
    revoke all on function public.nov_blast_snap_refresh_pre_fast_27nov(boolean) from public, anon, authenticated;
  end if;
end $do$;

create or replace function public.nov_blast_snap_refresh(p_force boolean default false) returns timestamptz
language plpgsql security definer set search_path to 'public' set statement_timeout to '150s' as $$
declare t timestamptz;
begin
  select m.at into t from public.nov_blast_snap_meta m where m.id = 1;
  if not p_force and t is not null and t > now() - interval '60 minutes' then return t; end if;
  if t is not null and not coalesce((select m.level in (3, 5) from public.dashboard_me() m limit 1), false) then return t; end if;
  if not pg_try_advisory_xact_lock(727001) then return t; end if;
  delete from public.nov_blast_snap where blast_id like 'R\_%' or blast_id like 'T\_%';
  if not exists (select 1 from public.nov_blast_snap) then
    insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
      select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast_members() m;
  end if;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast2_members() m;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast3_members() m;
  insert into public.nov_blast_snap_meta (id, at) values (1, now()) on conflict (id) do update set at = excluded.at;
  return now();
end $$;
