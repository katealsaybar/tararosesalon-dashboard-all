-- Google reviews as a complaint source (Kate, 23 Nov 2026).
-- Trigger: Arwa Al Alawi's review (SAA, 23 Nov) was not on Detailed complaints. The page only read Phorest notes, the ones staff
-- logged and confirmed chats; Google reviews were only a lookup ("did this client also review?").
--
-- Rule: every Google review of 1 to 3 stars with written text, posted on or after 1 Jan 2026, becomes a row in client_complaints.
--   * It is an ordinary src = 'visit' row (so every page, count and filter already counts it), told apart by phorest_id = 'google:<reviewer>'
--     and ref = 'gr-<review_id>'. The page shows it as "Found in: Google review".
--   * event_date is the date the review was POSTED (the visit date is not on Google). client_name is the reviewer's Google name.
--   * 4 and 5 star reviews are pulled ONLY when the text has a complaint word (disappoint, unfortunately, frustrat, wrong, rude, mistake, redo,
--     refund and so on), as candidates: is_complaint = false and reviewed = false, so they do NOT show on the page until the scan reads them
--     and sets is_complaint = true. Added the same day after Arwa Al Alawi's 5 star review that was really a complaint. The 17 found on
--     23 Nov 2026 were all praise and are reviewed = true, is_complaint = false.
--   * 1 to 3 star reviews with NO text are not pulled (nothing to classify). 5 on 23 Nov 2026.
--   * submitted_at stays null, so no WhatsApp/notification fires (client_complaints_notify only fires for staff-logged rows).
--   * cq_google_pull() types a new row from keywords (confidence 'low', reviewed false). The complaint-notes-scan routine then reads
--     the reviewed = false 'gr-' rows and fixes type, detail, stylist, resolution (see COMPLAINT-SCAN.md, Step 6b).
-- Safe to run twice.

create or replace function public.cq_google_pull()
returns integer
language plpgsql security definer
set search_path to ''
as $function$
declare n integer;
begin
  with src as (
    select r.*,
      case
        when r.branch ilike 'saadiyat%' then 'SAA' when r.branch ilike 'khalifa%' then 'KCA'
        when r.branch ilike 'motor%' then 'MC' when r.branch ilike 'al quoz%' then 'AQ'
        when r.branch ilike '%bahrain%' then 'BAH' end as bc,
      regexp_replace(trim(r.comment), '\s+', ' ', 'g') as txt
    from public.google_reviews r
    where r.review_date >= date '2026-01-01' and length(trim(coalesce(r.comment, ''))) > 0
      and (r.stars <= 3
        or r.comment ~* '(disappoint|unfortunately|frustrat|not happy|unhappy|not satisf|redo|re-do|refund|complain|wrong|worst|rude|mistake|waited|too long|overpriced|expensive|uneven|patchy|never again|not recommend)')
  ), ins as (
    insert into public.client_complaints (src, ref, phorest_id, client_name, branch_code, event_date, note, regex_tier, reviewed, is_complaint,
        complaint_type, detail, resolution, resolution_detail, confidence, google_url)
    select 'visit', 'gr-' || s.review_id, 'google:' || lower(trim(s.reviewer)), trim(s.reviewer), s.bc, s.review_date,
      left(s.stars || ' stars on Google. ' || s.txt, 4000), 'G', false, (s.stars <= 3),
      case
        when s.txt ~* '(allerg|burn|rash|reaction|injur|bleed)' then 'skin_reaction_or_injury'
        when s.txt ~* '(price|pricing|expensive|overpriced|charge|aed|dhs|dirham|paid|cost)' then 'price_or_billing'
        when s.txt ~* '(rude|attitude|unprofessional|ignored|unwelcom|disrespect)' then 'staff_attitude'
        when s.txt ~* '(slow|waited|waiting|late|took (a )?(full |over )?\d* ?(hour|hr))' then 'wait_or_time'
        when s.txt ~* '(resched|cancel|booking|booked|appointment|front desk|reception)' then 'booking_or_admin'
        when s.txt ~* '(nail|manicure|pedicure|gel|polish)' then 'nail_service'
        when s.txt ~* '(colou?r|toner|highlight|balayage|blonde|root|dye|bleach)' then 'colour_result'
        when s.txt ~* '(haircut|trim|bangs|fringe|layers|cut)' then 'cut_result'
        when s.txt ~* '(noise|loud|parking|dirty|clean|smell)' then 'facility_or_parking'
        else 'other' end,
      left(s.txt, 300),
      case when s.replied then 'apology_or_explanation' else 'no_action_noted' end,
      case when s.replied then 'Replied on Google' end,
      'low', s.url
    from src s
    on conflict (src, ref) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end
$function$;
revoke all on function public.cq_google_pull() from public, anon, authenticated;

-- Every hour at :45, after the Google review syncs (Apps Script 07:00 and 19:00 Dubai, metricool-sync 23:20 UTC). Idempotent.
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'complaint-google-pull') then
    perform cron.schedule('complaint-google-pull', '45 * * * *', 'select public.cq_google_pull();');
  end if;
end $$;

-- 23 Nov 2026 (Kate: "sync as soon as Phorest intervals sync"): the Google reviews themselves are refreshed from Metricool (reviews only)
-- at the same times as the Phorest sync (05, 07, 09, 13, 17, 21 UTC = 9am, 11am, 1pm, 5pm, 9pm, 1am Dubai), 2 minutes after, and the complaint
-- pull runs 6 minutes after that. Metricool can still be hours behind Google (Arwa Al Alawi's 1 star KCA review was 7 hours old and not in it),
-- so a review that matters can be added by hand as a 'seed:manual-...' google_reviews row; cq_google_pull() then picks it up.
do $$
declare cmd text;
begin
  select replace(command, '{"days":10}', '{"source":"reviews","days":10}') into cmd from cron.job where jobname = 'metricool-sync-nightly';
  if cmd is not null and not exists (select 1 from cron.job where jobname = 'google-reviews-sync-with-phorest') then
    perform cron.schedule('google-reviews-sync-with-phorest', '2 5,7,9,13,17,21 * * *', cmd);
  end if;
  if not exists (select 1 from cron.job where jobname = 'complaint-google-pull-with-phorest') then
    perform cron.schedule('complaint-google-pull-with-phorest', '8 5,7,9,13,17,21 * * *', 'select public.cq_google_pull();');
  end if;
end $$;
