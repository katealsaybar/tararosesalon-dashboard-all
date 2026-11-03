-- Kate, 3 Nov 2026: Keratin & Smoothing is its own Client Mix family (APPLIED LIVE 3 Nov 2026 on Kate's OK, after the JS was pushed).
--
-- Phorest's category KERATIN (Supreme Straighten, Frizz-Free Protein Treatment, the retired Smooth & Defrizz
-- and the old "Keratin Treatment" lines) moves from the family 'treat' (Hair treatments) to a new family
-- 'keratin', so Client Mix, By item, The clients, the Service roster tab and Service Rankings count it on its
-- own and nothing is counted twice. item_classes() needs no change: it reads the family from service_families.
--
-- Two other functions read the family 'treat' and would otherwise lose keratin clients, so they are patched in
-- the same step to treat 'keratin' exactly as they treated 'treat' before:
--   nov_blast_members     hair_ever: keratin counts as a hair client (the Hair to Beauty "never had beauty" list)
--   lost_campaign_money   the Hair treatments line of the money split
-- service_set_family (the roster tab's save) is told the new family name. Each patch rewrites the live function
-- text and stops with an error if the text it expects is not there, so nothing is changed by guesswork.
--
-- Check afterwards (Oct 2026, UAE): Hair treatments 658 clients, 694 visits, 740 units, AED 159,722 and
-- Keratin & Smoothing 35, 35, 35, AED 35,901 add back to the old 687, 729, 775, AED 195,623; total clients 2,245.
-- Undo: update service_families set family='treat' where category='KERATIN'; the patches are harmless to leave.

begin;

alter table public.service_families drop constraint if exists service_families_family_check;
alter table public.service_families add constraint service_families_family_check
  check (family in ('colour','treat','keratin','cut','nails','beauty','retail','extensions','consult','other','skip'));

update public.service_families
   set family = 'keratin', updated_at = now(), updated_by = 'keratin family 3 Nov 2026'
 where category = 'KERATIN';

do $patch$
declare d text; n text;
begin
  -- the roster tab's save accepts the new family
  d := pg_get_functiondef('public.service_set_family(text,text)'::regprocedure);
  n := replace(d, $$('colour','treat','cut',$$, $$('colour','treat','keratin','cut',$$);
  if n = d then raise exception 'service_set_family: expected text not found'; end if;
  execute n;

  -- the November blast lists: a keratin client is a hair client
  d := pg_get_functiondef('public.nov_blast_members(date)'::regprocedure);
  n := replace(d, $$ln.family in ('colour', 'cut', 'extensions', 'treat')$$, $$ln.family in ('colour', 'cut', 'extensions', 'treat', 'keratin')$$);
  if n = d then raise exception 'nov_blast_members: expected text not found'; end if;
  execute n;

  -- the Lost Client money split: keratin stays in Hair treatments
  d := pg_get_functiondef('public.lost_campaign_money(text,numeric)'::regprocedure);
  n := replace(d, $$when 'treat' then 'hair_treat'$$, $$when 'treat' then 'hair_treat' when 'keratin' then 'hair_treat'$$);
  if n = d then raise exception 'lost_campaign_money: expected text not found'; end if;
  execute n;
end
$patch$;

-- stop here and look before committing: this must print 'keratin' for the KERATIN category only
select category, family from public.service_families where family in ('treat','keratin') order by family, category;

commit;
