-- Clickable figures, batch B (Kate, 27 Oct 2026): the More measures tiles on the Pulse (Retention, Conversion, Colour, Social posts, Social workdays) open a
-- list of stylists with the two numbers each rate is made of. org_pulse_extra already returned one object per stylist with those numbers but no name,
-- so the list had nobody to name. This adds one key, "name" (the stylist's display name, or her Phorest name), to each object in "staff".
-- Nothing else in the function changes and every key it returned before is still there, so an old copy of the page reads it as before.
-- Written as a rewrite of the live definition, so whatever the function holds today is kept.
do $$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = 'org_pulse_extra' and p.pronamespace = 'public'::regnamespace;
  if def is null then raise exception 'org_pulse_extra not found'; end if;
  if def like '%''name'', coalesce(nullif(trim(s.display_name)%' then return; end if;   -- already done
  def := replace(def, '''branch'', s.branch, ''dept'', s.dept,', '''name'', coalesce(nullif(trim(s.display_name), ''''), s.phorest_name), ''branch'', s.branch, ''dept'', s.dept,');
  if def not like '%''name'', coalesce(nullif(trim(s.display_name)%' then raise exception 'could not add the name key'; end if;
  execute def;
end $$;
