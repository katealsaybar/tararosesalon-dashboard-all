-- Recruitment: the daily WhatsApp reminder is split by role (Kate, 17 Nov 2026: "do this pls for coach emma too ... para naman sa stylists", answered "Split reminder by role").
-- Builds on migrations/recruit_wa_claim_reminder_17nov.sql.
--   * ate Jho and ate Frans (setting reminder_support_ids [23, 26]) are counted on the SUPPORT roles only: the roles in the setting notify_roles (Front Desk / Reception, Hair Assistant, Other, ...).
--   * everyone else in reminder_staff_ids (Coach Emma, 28) is counted on all the OTHER roles: stylists, make up artists, managers, admin, not stated.
--   * each of the two groups gets its own number and its own longest wait, and is only messaged when its own count is above 0.
-- The role of a person is decided on the page (roleGroup in js/recruitment.js) from the words they wrote. recruit_role_group() is the same rule written for the database, so the cron can
-- count without the page open: a role set by hand wins; then Hair Assistant; then Make Up Artist and Manager (from the role and specialist text only); then whichever of the front desk,
-- hair or beauty words comes first; then the role the mailbox script read. If the page's rule changes, change this function with it.
-- Undo: re-run recruit_wa_claim_reminder_17nov.sql (it holds the one-total recruit_daily_reminder) and drop function recruit_role_group, _recruit_wait_label.

insert into public.recruit_settings (key, value) values ('reminder_support_ids', '[23, 26]'::jsonb) on conflict (key) do nothing;

create or replace function public.recruit_role_group(a public.recruit_applicants) returns text
language plpgsql stable set search_path = public as $$
declare
  t text; ra text; fname text; r int; h int; b int; first int := 0; g text := ''; m int; mg int;
  path_words constant text := 'Path (One|Two|Three):\s*(The (Employed|Flexible) Stylist|Rent-a-Chair)|Not sure yet\s*I would like to explore the options';
  hair_assist constant text := '(hair\s*dresser|hairdresser|hair|salon)\s*(and\s*)?assistant|assistant\s*(hair\s*dresser|hairdresser|hair\y|stylist)|\yhair\s*assist';
  hair_word constant text := 'hair|stylist|barber|braid|colou?rist|colou?r\s*specialist|balayage|keratin|wig|coiffeu|parrucchier|peluquer|barbier|مصفف|حلاق|تصفيف|парикмахер|стилист|барбер';
  beauty_word constant text := 'beaut|nail|manicur|pedicur|lash|make-?up|henna|facial|skin|massage|\ywax|threading|therapist|esthetic|aesthetic|maquill|esthéti|manucure|ongle|estetist|unghie|مكياج|تجميل|اظافر|أظافر|بشرة|маникюр|косметолог';
  rec_word constant text := 'receptionist|front\s*(desk|off+ice)|call\s*cent';
  mua_word constant text := 'make-?\s*up\s*artist|\ymua\y|مكياج';
  mgr_word constant text := '\ymanager\y|\ymanageress\y';
begin
  if a.role_override is not null then return a.role_override; end if;
  fname := coalesce(a.cv_file_name, '');
  if fname = '' then
    fname := coalesce((regexp_match(coalesce(a.cv_link, ''), '([^/?#]+\.(?:pdf|docx?|jpe?g|png|webp))(?:[?#].*)?$', 'i'))[1], '');
    fname := replace(fname, '%20', ' ');
  end if;
  t := regexp_replace(coalesce(a.role_txt, '') || ' ' || coalesce(a.specialist, '') || ' ' || left(coalesce(a.about, ''), 800) || ' ' || regexp_replace(fname, '[_.]+', ' ', 'g'), path_words, ' ', 'gi');
  if t ~* hair_assist then return 'Hair Assistant'; end if;
  r := regexp_instr(t, rec_word, 1, 1, 0, 'i'); h := regexp_instr(t, hair_word, 1, 1, 0, 'i'); b := regexp_instr(t, beauty_word, 1, 1, 0, 'i');
  ra := regexp_replace(coalesce(a.role_txt, '') || ' ' || coalesce(a.specialist, ''), path_words, ' ', 'gi');
  if ra ~* mua_word then return 'Make Up Artist'; end if;
  mg := regexp_instr(ra, mgr_word, 1, 1, 0, 'i');
  if mg > 0 then
    m := 1000000000;
    if regexp_instr(ra, hair_word, 1, 1, 0, 'i') > 0 then m := least(m, regexp_instr(ra, hair_word, 1, 1, 0, 'i')); end if;
    if regexp_instr(ra, beauty_word, 1, 1, 0, 'i') > 0 then m := least(m, regexp_instr(ra, beauty_word, 1, 1, 0, 'i')); end if;
    if mg <= m then return 'Manager'; end if;
  end if;
  if r > 0 then first := r; g := 'Front Desk / Reception'; end if;
  if h > 0 and (first = 0 or h < first) then first := h; g := 'Hairdresser / Hair Stylist'; end if;
  if b > 0 and (first = 0 or b < first) then first := b; g := 'Beautician'; end if;
  if g <> '' then return g; end if;
  return coalesce(case a.role_key when 'stylist' then 'Hairdresser / Hair Stylist' when 'colourist' then 'Hairdresser / Hair Stylist' when 'barber' then 'Hairdresser / Hair Stylist'
                    when 'braider' then 'Hairdresser / Hair Stylist' when 'beauty' then 'Beautician' when 'nails' then 'Beautician' when 'front' then 'Front Desk / Reception' end, 'Not stated');
end $$;
revoke all on function public.recruit_role_group(public.recruit_applicants) from public, anon, authenticated;

create or replace function public._recruit_wait_label(oldest timestamptz) returns text
language sql stable set search_path = public as $$
  select case when d <= 0 then 'less than a day' when d = 1 then '1 day' else d::text || ' days' end
    from (select greatest(0, (now() at time zone 'Asia/Dubai')::date - (oldest at time zone 'Asia/Dubai')::date) d) x
$$;
revoke all on function public._recruit_wait_label(timestamptz) from public, anon, authenticated;

create or replace function public.recruit_daily_reminder() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  open_stages text[] := array['screening', 'interview_booked', 'interview_pass', 'trade_test', 'trade_pass', 'offer', 'offer_to_send', 'offer_sent', 'start_pending'];
  roles text[]; sup bigint[]; allids bigint[]; rest bigint[]; link text; batch text;
  ns int; os timestamptz; ne int; oe timestamptz; rs jsonb; re jsonb; none constant jsonb := '{"queued": 0, "reason": "nobody_open"}'::jsonb;
begin
  if coalesce((select value from public.recruit_settings where key = 'reminder_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    return jsonb_build_object('queued', 0, 'reason', 'off');
  end if;
  roles := array(select jsonb_array_elements_text(value) from public.recruit_settings where key = 'notify_roles');
  sup := array(select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'reminder_support_ids');
  allids := array(select jsonb_array_elements_text(value)::bigint from public.recruit_settings where key = 'reminder_staff_ids');
  rest := array(select x from unnest(allids) x where not (x = any (sup)));
  sup := array(select x from unnest(allids) x where x = any (sup));

  select count(*) filter (where g.grp = any (roles)), min(g.d) filter (where g.grp = any (roles)),
         count(*) filter (where not (g.grp = any (roles))), min(g.d) filter (where not (g.grp = any (roles)))
    into ns, os, ne, oe
    from (select public.recruit_role_group(a) grp, coalesce(a.decided_at, a.updated_at, a.applied_at) d
            from public.recruit_applicants a where a.stage = any (open_stages) and not coalesce(a.is_test, false)) g;

  link := coalesce((select value #>> '{}' from public.recruit_settings where key = 'notify_url'), 'https://trk-salon-os.com/?view=recruitment');
  batch := 'recruit-reminder-' || to_char(now() at time zone 'Asia/Dubai', 'YYYY-MM-DD');
  rs := none; re := none;
  if ns > 0 and cardinality(sup) > 0 then
    rs := public._recruit_wa_queue('recruit_reminder', batch, sup, array[ns::text, public._recruit_wait_label(os), link], null, 'Daily reminder', 0) || jsonb_build_object('open', ns);
  end if;
  if ne > 0 and cardinality(rest) > 0 then
    re := public._recruit_wa_queue('recruit_reminder', batch, rest, array[ne::text, public._recruit_wait_label(oe), link], null, 'Daily reminder', 0) || jsonb_build_object('open', ne);
  end if;
  return jsonb_build_object('queued', coalesce((rs ->> 'queued')::int, 0) + coalesce((re ->> 'queued')::int, 0), 'support', rs, 'others', re);
end $$;
revoke all on function public.recruit_daily_reminder() from public, anon, authenticated;
