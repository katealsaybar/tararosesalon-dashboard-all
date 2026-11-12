-- Page access for one person (Kate, 12 Nov 2026): "give specific page access to someone regardless of his/her level", from the account menu in the dashboard header
-- (js/account-menu.js, Level 5 only).
-- dashboard_users.extra_pages (dashboard_extra_pages.sql) already holds the page ids opened for one person alone. Until now it was filled by hand in the table editor.
-- These two functions are the screen for it. Level 5 only, like page_access_set and page_status_set.
--   page_access_people()                       who is on the dashboard list, their level and the pages opened for them alone
--   page_access_person_set(email, page, on)    add or remove one page id for one person
-- pages.js trsPageOpen() now honours extra_pages at every level below 5 (it was Levels 2 and 4 and pages marked extras). This decides what is DRAWN (menu, Team Home,
-- search, direct link). A page whose data functions ask for a higher level than the person holds will open and then say so, until that function allows the page too
-- (the way recruitment.sql and stripe_vs_phorest.sql do).
-- Undo one: page_access_person_set(email, page, false). Undo all: update public.dashboard_users set extra_pages = null; drop function public.page_access_people(); drop function public.page_access_person_set(text, text, boolean);

create or replace function public.page_access_people() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then raise exception 'Level 5 only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'email', d.email, 'name', d.name, 'level', d.level, 'scope', d.scope,
             'pages', coalesce(to_jsonb(d.extra_pages), '[]'::jsonb))
           order by d.level desc, d.name)
      from public.dashboard_users d
     where d.level < 5
       and not public.kb_is_blocked(d.email)
  ), '[]'::jsonb);
end $$;

create or replace function public.page_access_person_set(p_email text, p_page text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 5 then raise exception 'Level 5 only'; end if;
  if p_page is null or length(p_page) = 0 or length(p_page) > 60 then raise exception 'No page'; end if;
  if not exists (select 1 from public.dashboard_users d where d.email = v_email and d.level < 5) then raise exception 'Not on the dashboard list'; end if;
  if p_on then
    update public.dashboard_users d
       set extra_pages = array_append(coalesce(array_remove(d.extra_pages, p_page), '{}'::text[]), p_page)
     where d.email = v_email;
  else
    update public.dashboard_users d
       set extra_pages = nullif(array_remove(d.extra_pages, p_page), '{}'::text[])
     where d.email = v_email;
  end if;
end $$;

revoke all on function public.page_access_people(), public.page_access_person_set(text, text, boolean) from public, anon;
grant execute on function public.page_access_people(), public.page_access_person_set(text, text, boolean) to authenticated;
