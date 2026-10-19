-- Podium Race / Staff Quadrant: Google review counts for everyone on the board, by the Google Reviews page's own rule (Kate, 18 Oct 2026:
-- "mag base ka kasi doon sa google reviews section", after Zara, Daisy and Danika showed 0 reviews).
-- league_counts() counts only people on perf_staff WHERE active, so anyone who left (Zandri 90 tagged reviews, Zara 46, Blossom 42, Samantha 41,
-- Molly 37, Roja 32...), the Bahrain MD (Daisy 35) and anyone with no perf_staff row (Danika 37) read 0 on the Podium, and the ones it did count
-- were short (Robyn 48 vs 58, Grace 15 vs 21, Hazel Mae 6 vs 11, Lucy 7 vs 11) because it also required a review's branch to be one she worked at.
-- The Google Reviews page decides who a review names with staff_name_variants (perf_review_names) plus a hand tag (staff_manual). This does the
-- same for any staff key the page asks about:
--   p_staff  [{"k": "ZARA", "h": ["SAA","KCA"]}, ...]   k = the staff key (the ledger name), h = her home branch codes (a strict spelling such as
--            May or Grace only counts at her own branch, a loose one anywhere), taken from staff-profiles.js on the page
--   returns  [{"k": "ZARA", "n": 46}, ...]   reviews dated inside the window that name her, or are hand-tagged to her
-- staff_not (google_reviews.staff_not, 18 Oct 2026) removes a key from the text matches of that review; a hand tag in staff_manual still counts.
-- Same sign-in key check as league_counts (perf_admins leader or viewer). Client credit (reviews that name nobody) is not counted, as before.

create or replace function public.league_review_counts(p_admin uuid, p_from date, p_to date, p_staff jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from perf_admins where token = p_admin and role in ('leader', 'viewer')) then return null; end if;
  -- One join instead of perf_review_names() once per person per review (that timed out on 145 people): the same test, written out, behind a cheap
  -- ILIKE so the regexes only run on reviews that contain the spelling. The rules are the Google Reviews page's (add ons/google-reviews/app.js):
  --   only the page's own branches count (the four UAE salons, Bahrain and Fratelli; the Marasy reviews are not loaded); a Bahrain review counts only for someone whose home is Bahrain;
--   a Fratelli review (Kate, 19 Oct 2026: Josh Thomas showed 0 on the Podium) counts only for someone whose home list has FRT, which the page sends for the five people its FRT_STAFF
--   tags there (GONCALO, HAFEZ, BILLY, MIHAELA, JOSH: TP_ALSO_BRANCH in team-performance.js); Fratelli's other barbers are not ours;
  --   p = 1 means she has a staff profile: her home branches are the ones the page sends (her profile branch, plus the page's own ALSO_BRANCH list),
  --   and a key with no name rows is matched on her first name, loosely ("Melliza"). Someone with no profile (Daisy, Kerryn...) is only there through
  --   her name rows, so her home is the home_branch on them and there is no first-name fallback.
  return (
    with rv as (
      select row_number() over () as rid, g.comment, g.reviewer, g.staff_manual as man, g.staff_not as nt,
             case when g.branch like 'Al Quoz%' then 'AQ' when g.branch like 'Khalifa%' then 'KCA' when g.branch like 'Motor%' then 'MC'
                  when g.branch like 'Saadiyat%' then 'SAA' when g.branch like 'District 2%' then 'BAH' when g.branch like 'Fratelli%' then 'FRT' end as gb
      from google_reviews g where g.review_date between p_from and p_to
        and (g.branch like 'Al Quoz%' or g.branch like 'Khalifa%' or g.branch like 'Motor%' or g.branch like 'Saadiyat%' or g.branch like 'District 2%' or g.branch like 'Fratelli%')),
    st0 as (
      select distinct on (s->>'k') s->>'k' as k, coalesce(array(select jsonb_array_elements_text(s->'h')), '{}') as h, coalesce(s->>'p', '0') = '1' as p
      from jsonb_array_elements(p_staff) s order by s->>'k'),
    vv as (
      select v.staff_key as k, v.variant, v.strict, v.ci, v.not_after, v.home_branch from staff_name_variants v where v.staff_key in (select k from st0)
      union all
      select st0.k, initcap(lower(st0.k)), false, false, null, null from st0 where st0.p and not exists (select 1 from staff_name_variants v where v.staff_key = st0.k)),
    st as (
      select st0.k, case when st0.p then st0.h else coalesce((select array_agg(distinct vv.home_branch) from vv where vv.k = st0.k and vv.home_branch is not null), '{}') end as h from st0),
    named as (
      select st.k, rv.rid from st
      join vv v on v.k = st.k
      join rv on (rv.gb is distinct from 'BAH' or 'BAH' = any(st.h))
       and (rv.gb is distinct from 'FRT' or 'FRT' = any(st.h))
       and not coalesce(rv.nt && array[st.k], false)   -- staff_not (18 Oct 2026): a review that must not credit her although the text names her (Rachel Dawson's "Rachel" is not Rachel White)
       and rv.comment ilike '%' || v.variant || '%'
       and case when v.strict then (rv.gb = any(st.h)) and (case when v.ci then rv.comment ~* ('\m' || v.variant || '\M') else rv.comment ~ ('\m' || v.variant || '\M') end)
                else rv.comment ~* ('\m' || v.variant || '\M') end
       and (v.not_after is null or rv.comment !~* ('\m' || v.not_after || '\s+' || v.variant || '\M'))
       and coalesce(rv.reviewer, '') !~* ('\m' || v.variant || '\M')
       and not (v.variant in ('April', 'May') and rv.comment ~ ('((in|on|of|since|last|this|next|early|late|mid|from|until|till|during|by) ' || v.variant || '\M|\m' || v.variant || '\s*[0-9])'))),
    man as (select st.k, rv.rid from st join rv on rv.man && array[st.k]),
    u as (select k, rid from named union select k, rid from man)
    select coalesce(jsonb_agg(jsonb_build_object('k', c.k, 'n', c.n)), '[]'::jsonb)
    from (select st.k, count(u.rid) as n from st left join u on u.k = st.k group by st.k) c);
end $$;

revoke all on function public.league_review_counts(uuid, date, date, jsonb) from public, anon;
grant execute on function public.league_review_counts(uuid, date, date, jsonb) to authenticated;
