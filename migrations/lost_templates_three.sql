-- Lost Clients Templates tab: three messages, each as WhatsApp and as a text (Kate, 12 Oct 2026): Smoothing, Colour and Due,
-- Coach Emma's pre-approved set (the wording itself is lost_templates_emma_approved.sql).
-- Was eight rows. Now six: wa_smoothing (was wa_smoothing_lost), wa_colour, wa_due (was wa_catchall), sms_smoothing, sms_colour,
-- sms_due (was sms_other). wa_smoothing_still (still visiting) and wa_other (other services) are removed: a client who still visits
-- for other services and has had a smoothing gets the Smoothing message, and other services / everyone else get Due.
-- The page (lost-queue.js lqPrep) folds lost_queue()'s five kinds into these three; lost_queue() itself is unchanged.
-- The removed rows' old wording is in lost_queue.sql / lost_queue_group3_offer.sql / lost_queue_group3_rate.sql.

delete from public.lost_templates where key in ('wa_smoothing_still', 'wa_other');
update public.lost_templates set key = 'wa_smoothing', name = 'Smoothing', who = 'Groups 1 and 2, smoothing (30% off until 31 October)', sort = 1 where key = 'wa_smoothing_lost';
update public.lost_templates set name = 'Colour', who = 'Group 3, colour or toner (20% off until 31 October)', sort = 2 where key = 'wa_colour';
update public.lost_templates set key = 'wa_due', name = 'Due', who = 'Everyone else, groups 4 and 5 (no offer)', sort = 3 where key = 'wa_catchall';
update public.lost_templates set name = 'Text: smoothing', who = 'Text only, groups 1 and 2', sort = 4 where key = 'sms_smoothing';
update public.lost_templates set name = 'Text: colour', who = 'Text only, group 3', sort = 5 where key = 'sms_colour';
update public.lost_templates set key = 'sms_due', name = 'Text: due', who = 'Text only, everyone else', sort = 6 where key = 'sms_other';
