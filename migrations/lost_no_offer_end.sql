-- Lost Clients: no offer end date (Kate, 13 Oct 2026).
-- The "until 31 October" in the colour and smoothing messages came from the 9 Oct Group 3 offer and Emma's approved set.
-- Kate: it is not a real end date (only the Wellness Voucher closes on 31 October). Removed from:
--   lost_templates (the four colour and smoothing rows, WhatsApp and text): "20% off until 31 October" -> "20% off".
--   lost_send_config.offer_until: set to '' (was '31 October').
-- NOT changed: the six Meta-approved WhatsApp templates in lost_send_templates still read "{{n}} off until {{n+1}}".
-- With offer_until empty the page treats them as not sendable (a variable is missing), so no offer message can go out with
-- a date. Colour and smoothing need new versions without the date, submitted to Meta (see
-- Downloads/TRS-lost-clients-meta-templates-v2-no-end-date.md). Due templates are unaffected. Sending is off, nothing was queued.
-- Applied live 13 Oct 2026.
update public.lost_templates set body =
  replace(replace(replace(replace(body, 'and until 31 October you can', 'and you can'), ' off until 31 October.', ' off.'), ' until 31 October', ''), 'until 31 October', '')
where key in ('wa_smoothing','sms_smoothing','wa_colour','sms_colour') and body ilike '%31 October%';
update public.lost_send_config set offer_until = '', updated_at = now(), updated_by = 'Claude (Kate: the 31 Oct offer end is not real)' where id = 1;
