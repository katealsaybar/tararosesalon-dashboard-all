-- Kate, 16 Oct 2026: Lost Clients sender templates cleaned up to the six in use, and the Wave 3 and 4 templates added.
-- Applied live on 16 Oct 2026 (record only).
--
-- 1. The nine pre-v2 rows (colour, smoothing, due and their _gap / _stop versions) are gone: the page no longer calls them, and the offer ones
--    carried "off until {{n}}", which cannot be sent now that there is no end date. 'due' stays because two Wave 1 jobs sent on 15 Oct point at it
--    (lost_send_jobs.tkey is a foreign key). Nothing calls it.
-- 2. The six in use: colour_v2, smoothing_v2, due_v2 (standard, Waves 1a and 2) and colour_story, smoothing_story, due_story (Wave 1b).
-- 3. lost-queue.js lqTkeyBase sends Wave 3 (r18) to <qtype>_v2_stop and Wave 4 (noreply) to due_v2_stop, but those rows did not exist, so both waves
--    could not send. Added here: the v2 wording plus the STOP footer. approved = false until Meta approves them on both WABAs (Saadiyat 340071, and the
--    one MC / KCA / AQ share, submitted via KCA 354400); then: update lost_send_templates set approved = true where key like '%\_v2\_stop';
-- 4. lost_templates (the Templates tab) labels no longer say "until 31 October".

delete from public.lost_send_templates
 where key in ('colour', 'colour_gap', 'colour_stop', 'smoothing', 'smoothing_gap', 'smoothing_stop', 'due_gap', 'due_stop');

insert into public.lost_send_templates (key, qtype, variant, respond_name, language, body, footer, vars, approved, sort)
select key || '_stop', qtype, 'stop', 'tr_lost_' || qtype || '_v2_stop', language, body, 'If you''d rather not hear from us, reply STOP', vars, false, sort + 3
  from public.lost_send_templates where key in ('colour_v2', 'smoothing_v2', 'due_v2')
on conflict (key) do nothing;

update public.lost_templates set who = replace(who, ' until 31 October', '') where who like '%until 31 October%';
