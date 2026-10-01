-- Name links for the My Numbers page (Kate, 1 Oct 2026).
--
-- Each stylist gets a link with her name in it, trk-salon-os.com/me/kate-siryk-3f9a1c7e,
-- as well as the ?t=<token> link the monthly payslip email already uses (that one is
-- untouched). The name alone would be guessable, so every slug ends in eight random
-- characters. The slug opens the same page as her token, which also opens her
-- payslips, so treat it the same way: hers only, never posted in a group.
--
-- Turning someone off: set perf_staff.active = false and both links stop working.
-- A fresh link for one person: update perf_staff set slug = perf_slug_for(display_name)
-- where id = '...'.
--
-- RLS on perf_staff is unchanged; the page reaches it only through perf_slug_token.

alter table public.perf_staff add column if not exists slug text;
create unique index if not exists perf_staff_slug_key on public.perf_staff (slug);

-- kate-siryk-3f9a1c7e: the name in lower case with dashes, then 8 random hex characters.
create or replace function public.perf_slug_for(p_name text)
returns text language sql volatile set search_path = public as $$
  select trim(both '-' from regexp_replace(lower(coalesce(nullif(trim(p_name), ''), 'staff')), '[^a-z0-9]+', '-', 'g'))
      || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
$$;
revoke execute on function public.perf_slug_for(text) from public, anon, authenticated;

update public.perf_staff
   set slug = public.perf_slug_for(coalesce(display_name, phorest_name))
 where slug is null;

-- New staff get one on the way in.
create or replace function public.perf_staff_set_slug()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.slug is null then
    new.slug := public.perf_slug_for(coalesce(new.display_name, new.phorest_name));
  end if;
  return new;
end $$;
drop trigger if exists perf_staff_set_slug on public.perf_staff;
create trigger perf_staff_set_slug before insert on public.perf_staff
  for each row execute function public.perf_staff_set_slug();

-- Her link → her token, for active staff only. The page then loads exactly as it does
-- from the email link.
create or replace function public.perf_slug_token(p_slug text)
returns uuid language sql stable security definer set search_path = public as $$
  select token from perf_staff where slug = lower(trim(p_slug)) and active limit 1
$$;
grant execute on function public.perf_slug_token(text) to anon, authenticated;
