-- What's new entry for the Blast 4 reminder panel (27 Oct 2026). Run it when the page goes live, not before: Level 5 only, so only Kate sees it.
insert into public.site_updates (published_at, title, body, area, link, min_level)
select timestamptz '2026-10-27 18:00+04', 'Deploy the Blast 4 reminder from the site',
       'The Blast 4 block has a reminder panel: a switch, Send or Schedule for the 302 clients, Stop, a test to your phone and a log. Publish the GHL workflow first.',
       'Wellness Voucher', '/?view=wvblast', 5
 where not exists (select 1 from public.site_updates where title = 'Deploy the Blast 4 reminder from the site');
