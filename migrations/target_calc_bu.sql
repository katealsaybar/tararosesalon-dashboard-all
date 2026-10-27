-- Kate, 27 Oct 2026: the Target Calculator's Bottom-up % is saved. It lives in the rules row of target_calc_snapshot
-- as rules.bu = { "<month number>": { "<BRANCH>|<Name>": pct } }, and the page reads it back through target_calc_data().
-- target_calc_set_bu() writes one value; Level 3 and Level 5 only, same guard as target_calc_data(). Applied live 27 Oct.
-- The first values (November, +10 for all 51 people) were loaded from the snapshot, not from this file.
-- Undo: drop function public.target_calc_set_bu(int, text, numeric); update public.target_calc_snapshot set data = data - 'bu' where key = 'rules';
create or replace function public.target_calc_set_bu(p_month int, p_key text, p_pct numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare cur jsonb; allbu jsonb; mo jsonb;
begin
  if coalesce(public.kb_level(), 0) not in (3, 5) then raise exception 'not allowed'; end if;
  if p_month not between 1 and 12 or p_pct < -50 or p_pct > 100 then raise exception 'out of range'; end if;
  select data into cur from public.target_calc_snapshot where key = 'rules' for update;
  allbu := coalesce(cur->'bu', '{}'::jsonb);
  mo := coalesce(allbu->(p_month::text), '{}'::jsonb) || jsonb_build_object(p_key, p_pct);
  update public.target_calc_snapshot set data = jsonb_set(cur, '{bu}', allbu || jsonb_build_object(p_month::text, mo)) where key = 'rules';
end $$;
revoke all on function public.target_calc_set_bu(int, text, numeric) from public, anon;
grant execute on function public.target_calc_set_bu(int, text, numeric) to authenticated;

-- Kate, 27 Oct 2026: bulk change. target_calc_set_bu_many(p_month, p_vals) writes many people at once ({ "<BRANCH>|<Name>": pct, ... }),
-- same guard, each value -50 to 100. The page uses it for "Bottom-up % for the N shown: Apply". Applied live 27 Oct.
-- Undo: drop function public.target_calc_set_bu_many(int, jsonb);
create or replace function public.target_calc_set_bu_many(p_month int, p_vals jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare cur jsonb; allbu jsonb; mo jsonb; e record;
begin
  if coalesce(public.kb_level(), 0) not in (3, 5) then raise exception 'not allowed'; end if;
  if p_month not between 1 and 12 or jsonb_typeof(p_vals) <> 'object' then raise exception 'bad input'; end if;
  for e in select key, value from jsonb_each(p_vals) loop
    if jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric < -50 or (e.value #>> '{}')::numeric > 100 then raise exception 'out of range'; end if;
  end loop;
  select data into cur from public.target_calc_snapshot where key = 'rules' for update;
  allbu := coalesce(cur->'bu', '{}'::jsonb);
  mo := coalesce(allbu->(p_month::text), '{}'::jsonb) || p_vals;
  update public.target_calc_snapshot set data = jsonb_set(cur, '{bu}', allbu || jsonb_build_object(p_month::text, mo)) where key = 'rules';
end $$;
revoke all on function public.target_calc_set_bu_many(int, jsonb) from public, anon;
grant execute on function public.target_calc_set_bu_many(int, jsonb) to authenticated;
