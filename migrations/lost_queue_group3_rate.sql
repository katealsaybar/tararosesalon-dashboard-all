-- Lost Clients: the group 3 offer, worded without the percentage (Kate, 9 Oct 2026). Brand review said "25% off" cannot be printed
-- ("% off" is a banned phrase, and the 31 Aug Q4 rules say no percentage in client copy), so the two colour templates now say
-- "a welcome-back rate on your next colour until 31 October". Same offer, same end date, same recipients (all of group 3).
-- Rows someone has edited on the Templates tab (updated_by set) are left alone.
update public.lost_templates set body = 'Hi {first_name}, this is Tara Rose Salons {branch}. We were thinking of you. Your last colour[ with {stylist}] was in {month}, and we''d love to welcome you back. We''ll honour a welcome-back rate on your next colour until 31 October, and introduce you to our new stylists. Would you like us to find you a time?'
  where key = 'wa_colour' and updated_by is null;
update public.lost_templates set body = 'Hi {first_name}, Tara Rose {branch} here. A welcome-back rate on your next colour until 31 October, plus our new stylists. Reply to book. Reply STOP to opt out.'
  where key = 'sms_colour' and updated_by is null;
