-- November blasts: nobody who is in a Campaign Blasts audience is in a November blast (applied live 3 Nov 2026, Kate: "make sure the client lists do not overlap").
-- nov_blast_members now leaves out every client in blast_plan_members (Blonde Standard waves 1 and 2, Junior waves 1, 1b, 2a, 2b, Mette B; Extensions is
-- internal only so it does not count), by name and by a shared phone number. On 3 Nov that took the November blasts from 2,347 clients to 715:
-- A hair to beauty 649 to 380, B beauty to hair 120 to 38, C Junior 362 to 21, D smoothing 998 to 69, E newly due 218 to 207 (205 once the phone check ran).
-- blast_plan_members checks the level (Levels 3 and 5), so only an editor rebuilds the snapshot now; anyone else keeps reading the last one.
-- The rebuild takes longer (about 40 s on 3 Nov), so the timeout is 90 s. This is the live function patched in place: it adds the cbk step and two unions to the
-- done list, and nothing else. To undo, delete the cbk step and the two unions marked "anyone in a Campaign Blasts audience", and Count again.

do $$
declare d text; p text; n int;
begin
  d := pg_get_functiondef('public.nov_blast_members(date)'::regprocedure);
  select count(*) into n from regexp_matches(d, '\), done as \(', 'g'); if n <> 1 then raise exception 'done cte count %', n; end if;
  p := replace(d, '), done as (', E'), cbk as materialized (\n    -- the Campaign Blasts audiences (blast_plan_members: Blonde Standard, Junior, Mette B; Extensions is internal only): a client hears from one campaign, not two (Kate, 3 Nov 2026)\n    select distinct m.k from public.blast_plan_members(p_asof) m where m.blast_id <> ''extensions''\n  ), done as (');
  p := replace(p, E'  ), bk as (select distinct', E'    -- anyone in a Campaign Blasts audience, by name and by a shared phone number\n    union select cb.k from cbk cb\n    union select a.k from phall a join phall b on b.phone = a.phone join cbk cb on cb.k = b.k\n  ), bk as (select distinct');
  p := replace(p, '''60s''', '''90s''');
  if p = d or position('cbk cb' in p) = 0 or position('''90s''' in p) = 0 then raise exception 'patch did not apply'; end if;
  execute p;
end $$;

create or replace function public.nov_blast_snap_refresh(p_force boolean default false) returns timestamptz
language plpgsql security definer set search_path = public set statement_timeout = '90s' as $$
declare t timestamptz;
begin
  select m.at into t from public.nov_blast_snap_meta m where m.id = 1;
  if not p_force and t is not null and t > now() - interval '60 minutes' then return t; end if;
  -- only an editor rebuilds: the Campaign Blasts audiences are read through blast_plan_members, which checks the level
  if t is not null and not coalesce((select m.level in (3, 5) from public.dashboard_me() m limit 1), false) then return t; end if;
  if not pg_try_advisory_xact_lock(727001) then return t; end if;
  delete from public.nov_blast_snap where true;
  insert into public.nov_blast_snap (blast_id, k, client, branch, last_visit, spend, grp, ext, blonde, colour, wa)
    select m.blast_id, m.k, m.client, m.branch, m.last_visit, m.spend, m.grp, m.ext, m.blonde, m.colour, m.wa from public.nov_blast_members() m;
  insert into public.nov_blast_snap_meta (id, at) values (1, now()) on conflict (id) do update set at = excluded.at;
  return now();
end $$;
