-- KB search reads questions (kb_search_questions, 5 Oct 2026).
-- Before: every word typed had to be on the page, so "what do I do if a client
-- wants a redo" found nothing. Now filler words (English and Taglish) are dropped,
-- a plural is trimmed ("redos" finds "redo", "lashes" finds "lash"), and a page needs every word when
-- one or two are left, or at least half of them when three or more are. Pages with
-- more of the words rank higher. If the search is only filler words ("how"), the
-- words are used as typed, so typing in the header still finds something.
-- Same name, arguments and columns as before, so hub.js needs no change. Still runs
-- as the caller (security invoker), so the kb_pages policy decides what comes back.
create or replace function public.kb_search(q text)
returns table (slug text, section text, group_name text, title text, snippet text)
language sql stable security invoker set search_path = '' as $$
  with raw as (
    select w, w = any (array[
      -- English
      'a','an','the','and','or','but','if','of','to','in','on','at','for','with','from','by',
      'is','are','was','were','be','been','am','do','does','did','i','me','my','we','our','us',
      'you','your','it','its','this','that','these','those','what','whats','when','where',
      'which','who','why','how','can','could','should','would','will','may','might','must',
      'have','has','had','there','here','about','into','so','not','no','just','please','tell',
      'get','give','need','want','wants','know','any','some','there','they','them','their',
      'she','her','he','his','one','way','does','doing',
      -- Tagalog / Taglish
      'ang','ng','mga','sa','si','ni','na','ba','po','ko','mo','ka','ako','ikaw','siya','kami',
      'tayo','sila','nila','natin','namin','paano','pano','ano','saan','kailan','bakit','sino',
      'pag','kapag','kung','para','yung','yun','ito','iyan','iyon','dito','doon','may','meron',
      'wala','lang','din','rin','naman','nga','daw','raw','kasi','tapos','pwede','puwede',
      'dapat','gawin','mag','nag','beh'
    ]) as filler
    from regexp_split_to_table(lower(trim(q)), '[^a-z0-9]+') w
    where length(w) >= 2
  ),
  kept as (
    select distinct
      case when length(w) > 4 and w like '%ies' then left(w, -3) || 'y'
           when length(w) > 4 and (w like '%shes' or w like '%ches' or w like '%xes' or w like '%sses') then left(w, -2)
           when length(w) > 3 and w like '%s' and w not like '%ss' then left(w, -1)
           else w end as w
    from raw
    where not filler or not exists (select 1 from raw r where not r.filler)
  ),
  t as (select lower(trim(q)) as full_q, array_agg(w) as ws, count(*) as n from kept),
  scored as (
    select p.slug, p.section, p.group_name, p.title, p.body_text, p.sort, t.full_q, t.n,
      (select count(*) from unnest(t.ws) w where strpos(lower(p.title || ' ' || p.body_text), w) > 0) as hits,
      (select count(*) from unnest(t.ws) w where strpos(lower(p.title), w) > 0) as title_hits,
      (select min(nullif(strpos(lower(p.body_text), w), 0)) from unnest(t.ws) w) as first_pos
    from public.kb_pages p, t
    where t.n > 0
  )
  select s.slug, s.section, s.group_name, s.title,
    substr(s.body_text, greatest(1, coalesce(s.first_pos, 1) - 60), 180)
  from scored s
  where length(trim(q)) >= 2
    and s.hits >= case when s.n <= 2 then s.n else ceil(s.n / 2.0) end
  order by
    (strpos(lower(s.title), s.full_q) > 0) desc,                                   -- whole phrase in the title
    (s.hits = s.n) desc,                                                           -- every word somewhere
    s.hits desc,                                                                   -- then the most words
    s.title_hits desc,                                                             -- words in the title
    (strpos(lower(s.body_text), s.full_q) > 0) desc,                               -- whole phrase in the text
    s.section, s.sort
  limit 20
$$;
revoke all on function public.kb_search(text) from public, anon;
grant execute on function public.kb_search(text) to authenticated;
