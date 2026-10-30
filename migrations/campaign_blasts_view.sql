-- Campaign Blasts moved from a Team Home page to a dashboard page (?view=campaignblasts, 30 Oct 2026), so the main sidebar stays.
-- Access now follows pages.js (lv [] and min 3: Executives & Marketing and Kate); blast_plan_* still check the level. The kb_sections row that
-- gated the old hub page is no longer used. Applied live 30 Oct 2026, together with moving the What's new link to /?view=campaignblasts.
delete from public.kb_sections where key = 'campaign-blasts';
update public.site_updates set link = '/?view=campaignblasts' where link = '/hub/campaign-blasts';
