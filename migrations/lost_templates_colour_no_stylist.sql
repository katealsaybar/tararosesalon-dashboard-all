-- Lost Clients Colour templates without the stylist's name (Kate, 12 Oct 2026, the coordinators' chat).
-- Shiela: with the stylist named, a client may think the 20% is only with that stylist; ask the previous stylist first if she is
-- willing to give the discount before offering a new one. Emma: "Good point". So Colour (WhatsApp and text) says the last colour and
-- when, and no longer "with {stylist}". Smoothing (30%) is the same question and was left as it was until Kate says.
update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. You''ve been on our minds.

Your last colour was in {month}, and a lot can change in a few months. Hair grows, tones soften, and sometimes you just fancy something different.

We''d also like to introduce you to our new stylists. We''ll start by looking at your hair together and build a plan around you.

As a welcome back, your next colour is 20% off until 31 October.

Shall we find you a time? 🤍', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026 (stylist name removed)' where key = 'wa_colour';
update public.lost_templates set body = 'Hi {first_name}, it''s Tara Rose {branch}. We''ve been thinking of you. Your last colour was in {month}, and until 31 October you can have 20% off your next one, plus a chance to meet our new stylists. Shall we find you a time?', updated_at = now(), updated_by = 'Emma-approved, 12 Oct 2026 (stylist name removed)' where key = 'sms_colour';
