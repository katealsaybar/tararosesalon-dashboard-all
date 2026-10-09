-- Lost Clients: "To message" list and message templates (Kate, 9 Oct 2026).
-- One running list of who to WhatsApp and who to text, one message each, plus the wording of those messages,
-- editable on the page. Additive: nothing existing is touched.
--
--   lost_templates               the eight message templates (five WhatsApp, three text), edited from the Templates tab
--   lost_templates_get()         Level 3+: the templates
--   lost_template_save(key,body) Level 3+: save one
--   lost_queue()                 Level 3+: every client who should get a message, one row each, with the message type
--   lost_queue_mark(keys)        Level 3+: "I sent this one" for a message sent outside respond.io (a text, or WhatsApp
--                                opened from a link). respond.io sends are still picked up on their own.
--   lost_queue_unmark(keys)      Level 3+: undo a mark
--
-- The message a client gets (first match wins, so someone in several groups is messaged once):
--   groups 1 or 2 -> smoothing (lost, or still visiting), group 3 -> colour, group 5 -> other services, group 4 only -> catch-all.
-- Marks go into the existing lost_messaged table with list_id 'q'.
-- Tables have RLS on and no policy; everything reads through these functions (security definer, level checked inside).

create table if not exists public.lost_templates (
  key text primary key,
  channel text not null check (channel in ('whatsapp', 'sms')),
  name text not null,
  who text not null,
  body text not null,
  sort int not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.lost_templates enable row level security;

-- Wording that went through /brand-review on 9 Oct 2026 (plural "we" throughout, no offer, no price).
-- [ with {stylist}] is dropped when the client has no usual stylist (or she has left); {stylist|our team} falls back to the words after the bar.
insert into public.lost_templates (key, channel, name, who, body, sort) values
 ('wa_smoothing_lost', 'whatsapp', 'Smoothing, lost', 'Groups 1 and 2, lost 6+ months',
  'Hi {first_name}, this is Tara Rose Salons {branch}. Your last smoothing[ with {stylist}] was back in {month}, and smoothing works best when it''s kept on rhythm. If you''d like, we''ll start with a proper look at your hair and tell you honestly what it needs. No pressure to book anything. Shall we find you a time that suits?', 1),
 ('wa_smoothing_still', 'whatsapp', 'Smoothing, still visiting', 'Group 2, still coming in for other services',
  'Hi {first_name}, this is Tara Rose Salons {branch}. Lovely to have you in with us recently. We noticed your last smoothing was back in {month}. If it''s on your mind, {stylist|our team} can look at your hair at your next visit and tell you honestly where it''s at. Shall we plan a little time for it at your next visit?', 2),
 ('wa_colour', 'whatsapp', 'Colour', 'Group 3, lost 6+ months with colour or toner',
  'Hi {first_name}, this is Tara Rose Salons {branch}. We were thinking of you. Your last colour[ with {stylist}] was in {month}, and colour looks its best when it''s kept on rhythm between visits. Whenever you''re ready, we''ll start with a proper look at your hair and an honest plan. Would you like us to find you a time[ with {stylist}]?', 3),
 ('wa_other', 'whatsapp', 'Other services', 'Group 5, no colour',
  'Hi {first_name}, this is Tara Rose Salons {branch}. It''s been a little while since we saw you and we''d love to have you back. We see you, and we''d like to pick up[ with {stylist}] where you left off. Tell us what''s been on your mind with your hair and we''ll find you the right time. Is there a day that suits?', 4),
 ('wa_catchall', 'whatsapp', 'Everyone else', 'Group 4 only',
  'Hi {first_name}, this is Tara Rose Salons {branch}. It''s been a little while since we saw you and we''d love to have you back. Tell us what''s been on your mind with your hair and we''ll find you the right time. Is there a day that suits?', 5),
 ('sms_smoothing', 'sms', 'Text: smoothing', 'Text only, groups 1 and 2',
  'Hi {first_name}, Tara Rose {branch} here. It''s been a while since your last smoothing. Want us to find you a time? Reply STOP to opt out.', 6),
 ('sms_colour', 'sms', 'Text: colour', 'Text only, group 3',
  'Hi {first_name}, Tara Rose {branch} here. We''d love to see you again for your colour. Want us to find you a time? Reply STOP to opt out.', 7),
 ('sms_other', 'sms', 'Text: everyone else', 'Text only, groups 5 and 4',
  'Hi {first_name}, Tara Rose {branch} here. It''s been a while and we''d love to have you back. Want us to find you a time? Reply STOP to opt out.', 8)
on conflict (key) do nothing;

create or replace function public.lost_templates_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'channel', t.channel, 'name', t.name, 'who', t.who, 'body', t.body,
            'updated_at', t.updated_at, 'updated_by', t.updated_by) order by t.sort), '[]'::jsonb) from lost_templates t);
end $$;

create or replace function public.lost_template_save(p_key text, p_body text) returns int
language plpgsql security definer set search_path = public as $$
declare editor text; n int;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  if length(btrim(coalesce(p_body, ''))) < 10 or length(p_body) > 900 then raise exception 'A message is 10 to 900 characters'; end if;
  select m.name into editor from public.dashboard_me() m limit 1;
  update lost_templates set body = btrim(p_body), updated_at = now(), updated_by = editor where key = p_key;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'unknown template'; end if;
  return n;
end $$;

-- The queue. Everyone on a list who can be messaged (WhatsApp active, replied 12-18 months ago, no reply seen, or text only),
-- one row each with the message type. No number, blocked and not yet checked are counted, not listed.
create or replace function public.lost_queue() returns jsonb
language plpgsql stable security definer set search_path = public set statement_timeout = '30s' as $$
declare lvl int; since date; lostd int; out jsonb;
begin
  lvl := coalesce((select m.level from public.dashboard_me() m limit 1), 0);
  if lvl < 3 then raise exception 'To message is for Level 3 and above'; end if;
  select campaign_from, lost_days into since, lostd from lost_lists_config where id = 1;
  with c as (select * from public.lost_lists_core()),
  mk as (
    select distinct on (x.client_key) x.client_key, x.sent_on, x.sent_by
    from lost_messaged x where x.list_id = 'q' order by x.client_key, x.id desc
  ),
  q as (
    select c.*, m.sent_on as mk_on, m.sent_by as mk_by,
      case when c.f1 or c.f2 then (case when c.f1 or c.last_visit < current_date - lostd then 'smoothing_lost' else 'smoothing_still' end)
           when c.f3 then 'colour' when c.f5 then 'other' else 'catchall' end as qtype,
      greatest(case when c.last_out >= since then c.last_out end, m.sent_on) as sent_date
    from c left join mk m on m.client_key = c.client_key
    where c.f1 or c.f2 or c.f3 or c.f4 or c.f5
  )
  select jsonb_build_object(
    'campaign_from', since,
    'held', (select count(*) from c where c.held),
    'skipped', jsonb_build_object('nonum', count(*) filter (where q.wa = 'nonum'), 'blocked', count(*) filter (where q.wa = 'blocked'),
                                  'unchecked', count(*) filter (where q.wa = 'unchecked')),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'client_key', q.client_key, 'client_name', q.client_name, 'area', q.area, 'branch', q.branch,
      'last_visit', q.last_visit, 'days_since', q.days_since, 'last_keratin', q.last_keratin, 'last_colour', q.last_colour,
      'last_toner', q.last_toner, 'stylist', q.stylist, 'also_saw', q.also_saw, 'mobile', q.mobile, 'n_numbers', q.n_numbers,
      'wa', q.wa, 'last_in', q.last_in, 'last_out', q.last_out, 'qtype', q.qtype,
      'also_on', (select jsonb_agg(v) from (values (case when q.f1 then '1' end), (case when q.f2 then '2' end), (case when q.f3 then '3' end),
                   (case when q.f4 then '4' end), (case when q.f5 then '5' end)) t(v) where v is not null),
      'messaged', q.sent_date is not null,
      'sent_on', q.sent_date,
      'sent_by', case when q.sent_date is null then null when q.mk_on = q.sent_date then coalesce(q.mk_by, 'marked') else 'respond.io' end,
      'by_mark', (q.mk_on is not null and q.mk_on = q.sent_date),
      'replied', (q.sent_date is not null and q.last_in is not null and q.last_in >= q.sent_date)
    ) order by q.last_visit desc) filter (where q.wa in ('act', 'r18', 'noreply', 'text')), '[]'::jsonb))
  into out from q;
  return out;
end $$;

create or replace function public.lost_queue_mark(p_keys text[]) returns int
language plpgsql security definer set search_path = public as $$
declare who text; n int;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  select m.name into who from public.dashboard_me() m limit 1;
  insert into lost_messaged (client_key, list_id, sent_by) select distinct unnest(p_keys), 'q', who;
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.lost_queue_unmark(p_keys text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce((select m.level from public.dashboard_me() m limit 1), 0) < 3 then raise exception 'Level 3 and above'; end if;
  delete from lost_messaged where list_id = 'q' and client_key = any(p_keys);
  get diagnostics n = row_count; return n;
end $$;

-- Supabase grants new functions to anon and authenticated by default; take that away, then give back only what the page needs.
revoke all on function public.lost_templates_get(), public.lost_template_save(text, text), public.lost_queue(),
  public.lost_queue_mark(text[]), public.lost_queue_unmark(text[]) from public, anon, authenticated;
grant execute on function public.lost_templates_get(), public.lost_template_save(text, text), public.lost_queue(),
  public.lost_queue_mark(text[]), public.lost_queue_unmark(text[]) to authenticated;
