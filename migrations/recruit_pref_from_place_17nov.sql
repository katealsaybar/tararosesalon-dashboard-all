-- Kate, 17 Nov 2026 ("paki automatch naman if dubai or abu dhabi na ang nakalagay sa loc eh imatch mo na sya sa preferred loc").
-- When Based in says Dubai or Abu Dhabi and the person has no preferred location yet, Preferred location takes that emirate (source "Based in").
--  * anything read from what they wrote or from their CV, or set by hand, is kept: this only fills a blank, and a "Based in" value follows the person if their Based in changes
--  * works for every new applicant too (trigger on insert and on a change of emirate or country), so nothing has to be run again
--  * Dubai or Abu Dhabi are read from the emirate, or from the country box when someone typed the city there (Dubai, Abu Dhabi, Abudhabi, Dubaï, دبي and so on); another emirate or country matches nothing
-- Undo: drop trigger recruit_pref_from_place_trg on public.recruit_applicants; drop function recruit_pref_from_place_fn, recruit_pref_from_place; update recruit_applicants set pref_loc = null, pref_src = null where pref_src = 'Based in'.

create or replace function public.recruit_pref_from_place(p_emirate text, p_country text) returns text
language plpgsql immutable as $f$
declare t text;
begin
  foreach t in array array[lower(coalesce(p_emirate, '')), lower(coalesce(p_country, ''))] loop
    if t ~ '(abu[ -]*dhabi|abudhabi|abu[ -]*dabi|ابوظبي|ابو ظبي)' then return 'Abu Dhabi'; end if;
    if t ~ '(dubai|dubaï|dubayy|دبي)' then return 'Dubai'; end if;
  end loop;
  return null;
end $f$;

create or replace function public.recruit_pref_from_place_fn() returns trigger
language plpgsql set search_path to 'public' as $f$
declare v text;
begin
  if new.pref_src is not distinct from 'By hand' then return new; end if;
  v := public.recruit_pref_from_place(new.emirate, new.country);
  if new.pref_loc is null and v is not null then
    new.pref_loc := v; new.pref_src := 'Based in';
  elsif new.pref_src = 'Based in' then
    new.pref_loc := v; new.pref_src := case when v is null then null else 'Based in' end;
  end if;
  return new;
end $f$;

drop trigger if exists recruit_pref_from_place_trg on public.recruit_applicants;
create trigger recruit_pref_from_place_trg before insert or update of emirate, country on public.recruit_applicants
  for each row execute function public.recruit_pref_from_place_fn();

-- first fill, only blanks
update public.recruit_applicants set pref_loc = public.recruit_pref_from_place(emirate, country), pref_src = 'Based in'
 where pref_loc is null and public.recruit_pref_from_place(emirate, country) is not null;
