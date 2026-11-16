-- Recruitment: read the stored CV file for Experience and Based in (Kate, 16 Nov 2026: French and other-language CVs still showed Not stated). Additive.
--
-- The edge function recruit-cv-upload now reads the text of the PDF / DOCX when a CV is stored (and has a `read` mode for the backfill), finds the years of
-- experience and the country / emirate in any of the common languages, and calls recruit_cv_apply() to write them.
--
-- Rules built in (all in recruit_cv_apply, so the edge function cannot get round them):
--   * FILL ONLY WHERE EMPTY. experience, country and emirate are written only while they are null or blank. A form answer, an email-text value or anything typed
--     by hand is never overwritten. Nothing here clears a value either.
--   * Location stays consistent: both blank -> both filled from the CV; country blank but an emirate is there -> country only when the CV says UAE;
--     country is the UAE and the emirate is blank -> emirate only. A person already shown as living in another country is not given an emirate.
--   * Every person is read once per stored file: cv_read_at / cv_read_file / cv_read_note record it (note = what was filled, or why nothing was).
--     A new file (new cv_file path) is read again; the backfill queue is people with a file that has not been read yet.
--   * Service role only (the edge function). The page cannot call these, so recruit_guard() is not involved; the page lock still decides who sees the rows.
--
--   recruit_applicants.cv_read_at / cv_read_file / cv_read_note
--   recruit_cv_apply(id, file, experience, country, emirate, note)  -> jsonb {filled: [...]}
--   recruit_cv_read_queue(n)                                        -> [{id}] people whose stored file has not been read
-- Applied live on 16 Nov 2026 as recruit_cv_facts, then recruit_cv_facts_fix_array (the array_append lines below; the first version failed on filled || text). This file is the corrected version.
-- Backfill ran the same day through the edge function (x-mode: read) for all 101 stored files: 43 got a country, 35 got experience, 10 got an emirate.
-- Undo: drop function recruit_cv_apply(uuid, text, text, text, text, text); drop function recruit_cv_read_queue(int);
--       alter table public.recruit_applicants drop column cv_read_at, drop column cv_read_file, drop column cv_read_note;
--       (values already filled stay; to take them back: update ... set experience = null where cv_read_note like '%experience%' etc. before dropping the columns.)

alter table public.recruit_applicants
  add column if not exists cv_read_at timestamptz,
  add column if not exists cv_read_file text,
  add column if not exists cv_read_note text;

create or replace function public.recruit_cv_apply(
  p_id uuid, p_file text, p_experience text, p_country text, p_emirate text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $f$
declare
  r public.recruit_applicants%rowtype;
  v_exp text := nullif(btrim(coalesce(p_experience, '')), '');
  v_c   text := nullif(btrim(coalesce(p_country, '')), '');
  v_e   text := nullif(btrim(coalesce(p_emirate, '')), '');
  cur_c text; cur_e text; cur_x text;
  n_exp text; n_c text; n_e text;
  filled text[] := '{}';
  uae boolean;
  note text;
begin
  select * into r from public.recruit_applicants where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no such person'); end if;
  -- the file may have been replaced while we were reading the old one: then this answer belongs to a file that is gone
  if p_file is not null and r.cv_file is distinct from p_file then
    return jsonb_build_object('ok', false, 'error', 'file changed');
  end if;

  cur_x := nullif(btrim(coalesce(r.experience, '')), '');
  cur_c := nullif(btrim(coalesce(r.country, '')), '');
  cur_e := nullif(btrim(coalesce(r.emirate, '')), '');
  n_exp := cur_x; n_c := cur_c; n_e := cur_e;

  if cur_x is null and v_exp is not null and char_length(v_exp) <= 40 then n_exp := v_exp; filled := array_append(filled, 'experience'::text); end if;

  uae := v_c is not null and (v_c = 'United Arab Emirates');
  if cur_c is null and cur_e is null then
    if v_c is not null then n_c := v_c; filled := array_append(filled, 'country'::text); end if;
    if v_c is not null and v_e is not null and uae then n_e := v_e; filled := array_append(filled, 'emirate'::text); end if;
  elsif cur_c is null then
    if uae then n_c := v_c; filled := array_append(filled, 'country'::text); end if;
  elsif cur_e is null and uae and (cur_c ~* 'emirates' or upper(cur_c) = 'UAE') and v_e is not null then
    n_e := v_e; filled := array_append(filled, 'emirate'::text);
  end if;

  note := coalesce(nullif(p_note, ''), case when cardinality(filled) > 0 then array_to_string(filled, ',') else 'nothing new' end);
  update public.recruit_applicants
     set experience = n_exp, country = n_c, emirate = n_e,
         cv_read_at = now(), cv_read_file = r.cv_file, cv_read_note = left(case when cardinality(filled) > 0 then array_to_string(filled, ',') else note end, 80),
         updated_at = case when cardinality(filled) > 0 then now() else updated_at end
   where id = p_id;
  return jsonb_build_object('ok', true, 'filled', to_jsonb(filled));
end $f$;

create or replace function public.recruit_cv_read_queue(p_n int default 5)
returns table (id uuid)
language sql stable security definer set search_path = public as $$
  select a.id from public.recruit_applicants a
  where a.cv_file is not null and a.cv_read_file is distinct from a.cv_file
  order by a.applied_at desc
  limit greatest(1, least(coalesce(p_n, 5), 50))
$$;

revoke all on function public.recruit_cv_apply(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.recruit_cv_read_queue(int) from public, anon, authenticated;
grant execute on function public.recruit_cv_apply(uuid, text, text, text, text, text) to service_role;
grant execute on function public.recruit_cv_read_queue(int) to service_role;
