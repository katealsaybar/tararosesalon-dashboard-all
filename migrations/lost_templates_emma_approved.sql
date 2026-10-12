-- Lost Clients message templates: the wording Coach Emma pre-approved (Kate, 12 Oct 2026, pasted from the meeting follow-up).
-- Three messages, each as WhatsApp and SMS: Smoothing (30% off until 31 Oct), Colour (20% off until 31 Oct, new stylists), Due (no offer).
-- Mapping onto the eight template rows: smoothing -> wa_smoothing_lost / sms_smoothing; colour -> wa_colour / sms_colour;
-- Due -> wa_catchall, wa_other and sms_other (everyone who is not smoothing or colour). wa_smoothing_still (still visiting) is left as it was.
-- Apostrophes are straight (a curly one turns an SMS into Unicode, 70 characters a segment). The earlier wording is in
-- migrations/lost_queue.sql, lost_queue_group3_offer.sql and lost_queue_group3_rate.sql if it has to go back.
-- The page's Reset to the original now gives this wording (lost-queue.js LQ_DEFAULTS).

update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. You''ve been on our minds.

Your last smoothing[ with {stylist}] was back in {month}, and smoothing softens over time. We''d love to see how your hair is feeling now, and we''ll tell you honestly what it needs, even if the answer is "not yet".

Because we''ve missed you, your next smoothing is 30% off until 31 October.

Shall we find you a time? 🤍', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026' where key = 'wa_smoothing_lost';
update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. You''ve been on our minds.

Your last colour[ with {stylist}] was in {month}, and a lot can change in a few months. Hair grows, tones soften, and sometimes you just fancy something different.

We''d also like to introduce you to our new stylists. We''ll start by looking at your hair together and build a plan around you.

As a welcome back, your next colour is 20% off until 31 October.

Shall we find you a time[ with {stylist}]? 🤍', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026' where key = 'wa_colour';
update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. We''ve missed you.

It''s been a little while since we saw you[ with {stylist}]. Tell us what''s been on your mind, whether that''s a fresh cut, a colour refresh or a catch-up, and we''ll find a time that suits you.

We''d love to have you back in the chair. 🤍', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026' where key = 'wa_catchall';
update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. We''ve missed you.

It''s been a little while since we saw you[ with {stylist}]. Tell us what''s been on your mind, whether that''s a fresh cut, a colour refresh or a catch-up, and we''ll find a time that suits you.

We''d love to have you back in the chair. 🤍', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026' where key = 'wa_other';
update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. We''ve missed you. Your last smoothing[ with {stylist}] was back in {month}, and until 31 October you can have 30% off your next one. We''ll look at your hair first and tell you honestly what it needs. Shall we find you a time?', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026' where key = 'sms_smoothing';
update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. We''ve been thinking of you. Your last colour[ with {stylist}] was in {month}, and until 31 October you can have 20% off your next one, plus a chance to meet our new stylists. Shall we find you a time[ with {stylist}]?', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026' where key = 'sms_colour';
update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. We''ve missed you. It''s been a little while and we think you''re due a visit[ with {stylist}]. Tell us what you''d like to do with your hair and we''ll find the right time.', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026' where key = 'sms_other';
