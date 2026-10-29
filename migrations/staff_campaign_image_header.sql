-- Staff campaign messages, step 2 (Kate, 29 Oct 2026): the memo goes on top of the message as an image header, and the two templates take a short
-- "what it is" line so ONE template serves every campaign (Blonde Standard, The Hair Rhythm, Hair Extension Plan, and the next one).
--   staff_cmp_templates.header_image   true = the template carries an image header, sent at send time from the link the page gives
--   staff_cmp_jobs.image_url           the memo's link for that message (test sends in plain text ignore it)
--   storage bucket 'staff-memos'       public read (WhatsApp has to fetch the image), upload Level 5 only, names are random uuids, jpg or png up to 5 MB
-- Run live on 29 Oct 2026 and kept here as the record. The Meta templates must be created with an IMAGE header (sample: any memo image) and these bodies.

alter table public.staff_cmp_templates add column if not exists header_image boolean not null default false;
alter table public.staff_cmp_jobs add column if not exists image_url text;

update public.staff_cmp_templates set header_image = true, vars = array['first_name','campaign_name','launch_day','pitch','link'],
  body = $b$Hi {{1}}, a quick note from the Tara Rose team. {{2}} launches on {{3}}, and we wanted you to hear it from us first, before clients start asking.

What it is: {{4}}

The memo above has everything you need. This is what clients will see: {{5}}

Any questions, reply here and we will come back to you. Thank you for everything you do for our clients.$b$
where key = 'heads_up' and not approved;

update public.staff_cmp_templates set header_image = true, vars = array['first_name','campaign_name','pitch','link'],
  body = $b$Hi {{1}}, {{2}} is live from today. Clients may ask about it in the salon, on WhatsApp and on Instagram. In short: {{3}}

Everything is here: {{4}}

Thank you for making it a lovely experience for every client.$b$
where key = 'live' and not approved;

-- The image link must be an https link to a jpg or png. Checked again inside the functions, whatever the page sends.
create or replace function public.staff_cmp_image_ok(p_url text) returns boolean
language sql immutable as $$
  select p_url ~* '^https://[a-z0-9.-]+/[^\s"<>]*\.(jpe?g|png)(\?[^\s"<>]*)?$' and length(p_url) <= 500
$$;

-- info: say which templates carry an image header.
create or replace function public.staff_cmp_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg staff_cmp_config;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_cmp_config where id = 1;
  return jsonb_build_object(
    'enabled', cfg.enabled, 'channel_label', cfg.channel_label, 'channel_id', cfg.channel_id, 'hour_from', cfg.hour_from, 'hour_to', cfg.hour_to,
    'test_ready', cfg.test_phone is not null, 'dubai_hour', extract(hour from now() at time zone 'Asia/Dubai')::int,
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'respond_name', t.respond_name, 'body', t.body, 'footer', t.footer,
                    'vars', t.vars, 'approved', t.approved, 'header_image', t.header_image) order by t.sort), '[]'::jsonb) from staff_cmp_templates t),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name,
                  'first', staff_cmp_first_name(p.name, p.email),
                  'team', coalesce((select case when s.dept ilike 'beauty' then 'Beauty' else 'Hair' end from perf_staff s where lower(s.email) = lower(p.email) and s.active limit 1),
                                   (select k.category from kb_staff k where lower(k.email) = lower(p.email) limit 1), 'Management and office'),
                  'blocked', exists (select 1 from staff_cmp_excluded x where x.key in (lower(coalesce(p.email, '')), lower(p.name)))) order by p.name), '[]'::jsonb)
               from staff_phones p),
    'excluded', (select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'reason', x.reason) order by x.reason), '[]'::jsonb) from staff_cmp_excluded x where x.key !~ '@'));
end $$;

-- enqueue and test: the memo link comes in p_vars ->> 'image_url' and is required when the template has an image header.
create or replace function public.staff_cmp_enqueue(p_campaign text, p_tkey text, p_vars jsonb, p_ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg staff_cmp_config; t staff_cmp_templates; who text; slug text; camp text; sp staff_phones; params text[]; nm text; val text; img text;
  queued int := 0; skipped jsonb := '[]'::jsonb; reason text; fn text;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_cmp_config where id = 1;
  if not cfg.enabled then raise exception 'Sending to staff is switched off'; end if;
  select * into t from staff_cmp_templates where key = p_tkey;
  if not found then raise exception 'unknown template'; end if;
  if not t.approved then raise exception 'That template is not approved in Meta yet'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Nobody ticked'; end if;
  img := nullif(btrim(coalesce(p_vars ->> 'image_url', '')), '');
  if t.header_image and not staff_cmp_image_ok(img) then raise exception 'Add the memo image first (a jpg or png)'; end if;
  slug := regexp_replace(lower(btrim(coalesce(p_vars ->> 'campaign_name', ''))), '[^a-z0-9]+', '-', 'g');
  if slug = '' or slug = '-' then raise exception 'Say which campaign this is'; end if;
  camp := slug || ':' || t.key;
  select m.name into who from dashboard_me() m limit 1;
  for sp in select * from staff_phones where id = any(p_ids) order by name loop
    reason := null; params := '{}';
    if exists (select 1 from staff_cmp_excluded x where x.key in (lower(coalesce(sp.email, '')), lower(sp.name))) then reason := 'not for campaign messages'; end if;
    if reason is null and exists (select 1 from staff_cmp_jobs j where j.campaign = camp and j.phone_id = sp.id and not j.is_test and j.status in ('queued', 'sending', 'sent')) then
      reason := 'already queued or sent'; end if;
    if reason is null then
      fn := staff_cmp_first_name(sp.name, sp.email);
      foreach nm in array t.vars loop
        val := case nm when 'first_name' then fn else btrim(coalesce(p_vars ->> nm, '')) end;
        if val = '' or length(val) > 300 or val ~ '[\n\r\t]' or val ~ '\s{4,}' then reason := 'missing or odd ' || nm; exit; end if;
        params := params || val;
      end loop;
    end if;
    if reason is null then
      insert into staff_cmp_jobs (campaign, phone_id, name, phone, tkey, channel_id, params, body_text, requested_by, image_url)
      values (camp, sp.id, sp.name, sp.phone, t.key, cfg.channel_id, params, staff_cmp_render(t.body, params), who, case when t.header_image then img end);
      queued := queued + 1;
    else
      skipped := skipped || jsonb_build_object('name', sp.name, 'reason', reason);
    end if;
  end loop;
  return jsonb_build_object('campaign', camp, 'queued', queued, 'skipped', skipped);
end $$;

create or replace function public.staff_cmp_test(p_tkey text, p_vars jsonb, p_mode text default 'template') returns bigint
language plpgsql security definer set search_path = public as $$
declare cfg staff_cmp_config; t staff_cmp_templates; who text; params text[] := '{}'; nm text; val text; sp staff_phones; new_id bigint; img text;
begin
  if staff_cmp_level() < 5 then raise exception 'Level 5 only'; end if;
  select * into cfg from staff_cmp_config where id = 1;
  if cfg.test_phone is null then raise exception 'No test number set'; end if;
  select * into t from staff_cmp_templates where key = p_tkey;
  if not found then raise exception 'unknown template'; end if;
  if p_mode = 'template' and not t.approved then raise exception 'That template is not approved in Meta yet. Use the plain text test, or wait for approval.'; end if;
  img := nullif(btrim(coalesce(p_vars ->> 'image_url', '')), '');
  if p_mode = 'template' and t.header_image and not staff_cmp_image_ok(img) then raise exception 'Add the memo image first (a jpg or png)'; end if;
  select * into sp from staff_phones where phone = cfg.test_phone limit 1;
  if not found then raise exception 'The test number is not on staff_phones'; end if;
  foreach nm in array t.vars loop
    val := case nm when 'first_name' then staff_cmp_first_name(sp.name, sp.email) else btrim(coalesce(p_vars ->> nm, '')) end;
    if val = '' then raise exception 'missing %', nm; end if;
    params := params || val;
  end loop;
  select m.name into who from dashboard_me() m limit 1;
  insert into staff_cmp_jobs (campaign, phone_id, name, phone, tkey, mode, channel_id, params, body_text, requested_by, is_test, image_url)
  values ('test', sp.id, sp.name, sp.phone, t.key, case when p_mode = 'text' then 'text' else 'template' end, cfg.channel_id, params,
          staff_cmp_render(t.body, params), who, true, case when p_mode = 'template' and t.header_image then img end)
  returning id into new_id;
  return new_id;
end $$;

-- claim: hand the worker the memo link too.
create or replace function public.staff_cmp_claim(p_n int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg staff_cmp_config; hr int; n int; out jsonb;
begin
  select * into cfg from staff_cmp_config where id = 1;
  hr := extract(hour from now() at time zone 'Asia/Dubai')::int;
  update staff_cmp_jobs set status = 'failed', error = 'Interrupted while sending. Look in respond.io before you retry; it may have gone.'
    where status = 'sending' and claimed_at < now() - interval '10 minutes';
  n := least(coalesce(p_n, cfg.per_run), cfg.per_run);
  with pick as (
    select j.id from staff_cmp_jobs j
    where j.status = 'queued' and j.next_try_at <= now() and (j.is_test or (cfg.enabled and hr >= cfg.hour_from and hr < cfg.hour_to))
    order by j.is_test desc, j.id limit n for update of j skip locked
  ), upd as (
    update staff_cmp_jobs j set status = 'sending', claimed_at = now(), attempts = j.attempts + 1 from pick where j.id = pick.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'phone', u.phone, 'channel_id', u.channel_id, 'campaign', u.campaign, 'params', u.params,
      'body_text', u.body_text, 'is_test', u.is_test, 'mode', u.mode, 'attempts', u.attempts, 'phone_id', u.phone_id, 'image_url', u.image_url,
      'template', t.respond_name, 'language', t.language, 'footer', t.footer) order by u.id), '[]'::jsonb)
  into out from upd u join staff_cmp_templates t on t.key = u.tkey;
  return out;
end $$;

revoke all on function public.staff_cmp_image_ok(text), public.staff_cmp_info(), public.staff_cmp_enqueue(text, text, jsonb, bigint[]),
  public.staff_cmp_test(text, jsonb, text), public.staff_cmp_claim(int) from public, anon, authenticated;
grant execute on function public.staff_cmp_info(), public.staff_cmp_enqueue(text, text, jsonb, bigint[]), public.staff_cmp_test(text, jsonb, text) to authenticated;

-- The memo images: a public bucket (WhatsApp has to fetch the link), upload Level 5 only, jpg or png up to 5 MB, names are random.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-memos', 'staff-memos', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
-- The policy runs as the signed-in user, so that role needs to be able to call the level check (it only ever returns the caller's own level).
grant execute on function public.staff_cmp_level() to authenticated;
drop policy if exists staff_memos_upload on storage.objects;
create policy staff_memos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-memos' and public.staff_cmp_level() = 5);
