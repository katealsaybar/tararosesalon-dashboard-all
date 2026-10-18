-- What's new entries (Kate, 18 Oct 2026). Run after migrations/site_updates.sql.
-- The first twelve were inserted live on 18 Oct 2026. Later entries are appended here by the
-- deploy skill (Step 5) when the Supabase MCP cannot write: run the new insert only.
insert into public.site_updates (published_at, title, body, area, link, audience) values
('2026-10-18 11:00+04', $$Recently updated and What's new$$, $$The search page now shows the Team Home pages edited most recently, and this list of what has changed.$$, 'Search', '/search/', 'staff'),
('2026-10-18 10:30+04', $$Your shortcuts, in two rows$$, $$Favourites are the pages you starred. Frequently visited are the ones you open most. Star a page to keep it in Favourites.$$, 'Search', '/search/', 'staff'),
('2026-10-18 10:00+04', $$Say it instead of typing$$, $$The search bar has a mic now, on every search bar. Tap it, say what you are looking for, and it types it for you. It keeps listening until you pause, and it knows our names, branches and pages.$$, 'Search', '/search/', 'staff'),
('2026-10-18 09:30+04', $$Daily Performance leads with the whole period$$, $$The tiles show the whole period first, with a meter that moves to any day you pick. Use Show to switch between Whole period and One day.$$, 'Daily Performance', '/?view=dailyperf', 'manager'),
('2026-10-18 09:00+04', $$Fairer daily targets$$, $$Each day is now judged against its own weekday's share of the month. A Friday is no longer measured against a quiet Monday.$$, 'Daily Performance', '/?view=dailyperf', 'manager'),
('2026-10-18 08:30+04', $$Rebooking from Phorest and the ledger, side by side$$, $$Podium Race, Staff Quadrant, Staff Dashboards, Staff's 13 Week and Stylist's Benchmarks show Phorest's rebooking figure beside the ledger's.$$, 'Staff', null, 'manager'),
('2026-10-18 08:00+04', $$Pages open faster$$, $$Many pages now open without waiting for the rest of the dashboard. All time loads in a few requests instead of hundreds.$$, 'Dashboard', null, 'manager'),
('2026-10-18 07:30+04', $$All time on every page$$, $$Every page's Period has an All time chip. The site no longer opens on it by itself, so it opens faster.$$, 'Dashboard', null, 'manager'),
('2026-10-18 07:00+04', $$Fun facts while pages load$$, $$The loading screen now has 77 hair tips, skin tips and did-you-know lines, and some shout-outs to the team.$$, 'Dashboard', null, 'manager'),
('2026-10-16 15:00+04', $$Read ROSES Magazine your way$$, $$Show the issues by year or all in one list, newest first or oldest first. It remembers your choice on that device.$$, 'ROSES Magazine', null, 'staff'),
('2026-10-16 14:00+04', $$Daily Performance is the one page now$$, $$Branch Performance has moved into it. Old links and stars open Daily Performance. It also reaches back to 2021, with Marasy and Fratelli.$$, 'Daily Performance', '/?view=dailyperf', 'manager'),
('2026-10-16 13:00+04', $$Schedule Lost Clients and Wellness Voucher sends$$, $$Pick Now or a set Dubai time, how many, and the pace. Lost Clients can also be scheduled for each branch on its own time.$$, 'Lost Clients', null, 'manager');
